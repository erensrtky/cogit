import { ensureConversationGitignore } from "../git.js";
import { CliError, type Io } from "../io.js";
import { redactDeep } from "../redact.js";
import type { Session } from "../schema/session.js";
import { appendConversationTurns, readConversationStore } from "../store/conversations.js";
import { atomicWrite } from "../store/fs.js";
import { withLock } from "../store/lock.js";
import { projectPaths } from "../store/paths.js";
import { resolveProjectRoot } from "../store/root.js";
import { loadAllSessions, loadConfig, loadProject } from "../store/stores.js";
import {
  type ChatTurn,
  displayTurn,
  excerpt,
  readConversation,
  readUserMessages,
} from "../transcript.js";
import { buildViewModel, embedViewModel } from "../view/lineage.js";
import type { LineageViewModel, ViewChatTurn, ViewPendingMessage } from "../view/model.js";
import { buildPanel } from "../view/panel.js";
import { TEMPLATE_HTML } from "../view/template.js";
import { collectTranscripts } from "../view/transcripts.js";

export interface BuildOptions {
  dir: string;
  io: Io;
  /** Replaces the bundled template; tests inject a minimal page. */
  templateHtml?: string;
  /** `session write` rebuilds without printing a success line. */
  quiet?: boolean;
}

/** How many characters of a not-yet-summarized message become its card title. */
export const PENDING_TITLE_LENGTH = 200;

export interface TranscriptViews {
  /**
   * The conversation of every session that shows messages, recorded or not. It
   * goes into the page only, never into a session file.
   */
  chats: Map<string, ViewChatTurn[]>;
  /** User messages with no node yet, per session, titled for the map. */
  pending: Map<string, ViewPendingMessage[]>;
}

/** Drops the fields only the drill-down needs (uuid, hints) and keeps the contract. */
function toViewTurn(turn: ChatTurn, id = turn.id): ViewChatTurn {
  return {
    id,
    at: turn.at,
    text: turn.text,
    replies: turn.replies,
    tools: turn.tools,
  };
}

/**
 * Reads each session's conversation, preferring the project's own store and
 * reading the transcript only for turns it does not hold yet. New turns are
 * appended to the store, so the drill-down survives Claude Code deleting the
 * transcript; a session whose transcript is gone (or unreadable) still shows what
 * was stored. A transcript that cannot be read is a warning, never a lost map.
 */
async function readTranscriptViews(
  sessions: Session[],
  transcripts: ReadonlyMap<string, string>,
  root: string,
  io: Io,
): Promise<TranscriptViews> {
  const chats = new Map<string, ViewChatTurn[]>();
  const pending = new Map<string, ViewPendingMessage[]>();
  for (const session of sessions) {
    const file = transcripts.get(session.sessionId);
    const recordsMessages = session.nodes.some((node) => node.kind === "message");
    const roots = [session.worktree?.path, root].filter((r): r is string => Boolean(r));
    const stored = await readConversationStore(root, session.sessionId);
    const storedByUuid = new Map(stored.map((turn) => [turn.uuid, turn]));
    let transcript: ChatTurn[] | null = null;
    if (file) {
      try {
        transcript = await readConversation(file);
      } catch (err) {
        if (recordsMessages)
          io.warn(
            `could not read the conversation of ${session.sessionId}: ${(err as Error).message}`,
          );
      }
    }
    let turns: ViewChatTurn[];
    if (transcript && transcript.length > 0) {
      const fresh = transcript.filter(
        (turn) => turn.uuid !== undefined && !storedByUuid.has(turn.uuid),
      );
      if (fresh.length > 0) {
        const displayed = fresh.map((turn) => displayTurn(turn, roots));
        try {
          await appendConversationTurns(root, session.sessionId, displayed);
        } catch (err) {
          // Losing the transcript is a real risk, but a failed append must never
          // fail the map: the page still shows this build's conversation.
          io.warn(
            `could not store the conversation of ${session.sessionId}: ${(err as Error).message}`,
          );
        }
      }
      turns = transcript.map((turn) => {
        const kept = turn.uuid === undefined ? undefined : storedByUuid.get(turn.uuid);
        return kept
          ? { id: turn.id, at: kept.at, text: kept.text, replies: kept.replies, tools: kept.tools }
          : toViewTurn(displayTurn(turn, roots));
      });
    } else {
      // No readable transcript: the store is all that is left. Its append-only
      // order is the transcript order, so `m1`, `m2`, … still line up.
      turns = stored.map((turn, index) => toViewTurn({ ...turn, id: `m${index + 1}` }));
    }
    const recorded = new Set(session.nodes.map((node) => node.id));
    const missing = turns.filter((turn) => !recorded.has(turn.id));
    if (missing.length > 0) {
      pending.set(
        session.sessionId,
        missing.map((turn) => ({
          id: turn.id,
          at: turn.at,
          title: excerpt(turn.text, PENDING_TITLE_LENGTH) || "(blank message)",
        })),
      );
    }
    if (recordsMessages || missing.length > 0) chats.set(session.sessionId, turns);
  }
  return { chats, pending };
}

/**
 * User messages with no node, per session, counted from the transcripts. The
 * SessionEnd hook normally records them; while the catch-up is off this count is
 * the only sign. An unreadable transcript is skipped, never failing the build.
 */
export async function countUnrecorded(
  sessions: Session[],
  transcripts: ReadonlyMap<string, string>,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const file = transcripts.get(session.sessionId);
    if (!file) continue;
    let messages;
    try {
      messages = await readUserMessages(file);
    } catch {
      continue;
    }
    const recorded = new Set(session.nodes.map((node) => node.id));
    const missing = messages.filter((message) => !recorded.has(message.id)).length;
    if (missing > 0) counts.set(session.sessionId, missing);
  }
  return counts;
}

/**
 * Rebuilds `.codelineage/lineage.html` from `project.json` and every session file,
 * then refreshes the global panel. One unreadable session is a warning, never a
 * failed build; an unwritable global directory only skips the panel.
 */
export async function buildProject(opts: BuildOptions): Promise<LineageViewModel> {
  const { io } = opts;
  const { root } = await resolveProjectRoot(opts.dir);
  const project = await loadProject(root);
  if (!project.found)
    throw new CliError(`${root} is not initialized; run \`codelineage init\` first`);
  if (!project.ok) throw new CliError(project.error);
  for (const warning of project.warnings) io.warn(warning);

  const paths = projectPaths(root);
  // Projects initialized before the conversation store get the privacy line on
  // their next build; an unwritable record must never fail the map.
  try {
    await ensureConversationGitignore(root);
  } catch (err) {
    io.warn(`could not update .codelineage/.gitignore: ${(err as Error).message}`);
  }
  // The Stop hook skips a turn while this lock is held, and a second build waits
  // for the first instead of interleaving reads and writes of the same files.
  const model = await withLock(
    paths.lock("build"),
    async () => {
      const sessions = await loadAllSessions(root, io.warn);
      const transcripts = await collectTranscripts(io.env);
      const config = await loadConfig(io.env);
      const views = await readTranscriptViews(sessions, transcripts, root, io);
      const built = buildViewModel({
        project: project.data,
        sessions,
        path: root,
        generatedAt: io.now(),
        transcripts: new Set(transcripts.keys()),
        chats: views.chats,
        pending: views.pending,
        // With the catch-up on, the hook records the tail at session end, so the
        // count would only be a stale warning about work already scheduled.
        unrecorded: config.sessionEndCatchUp
          ? undefined
          : await countUnrecorded(sessions, transcripts),
      });
      // The skill already avoids secrets; this is the safety net before rendering.
      const redacted = redactDeep(built);
      if (redacted.count > 0)
        io.warn(`redacted ${redacted.count} secret-looking value(s) in the map`);

      const template = opts.templateHtml ?? TEMPLATE_HTML;
      await atomicWrite(paths.html, embedViewModel(template, redacted.value));
      if (!opts.quiet) io.out(`Wrote ${paths.html}`);
      return redacted.value;
    },
    { timeoutMs: 30_000 },
  );

  // The panel is derived state: a read-only home or a broken registry warning
  // must never turn a successful map build into a failure.
  try {
    await buildPanel({
      env: io.env,
      io,
      templateHtml: opts.templateHtml ?? TEMPLATE_HTML,
      quietPath: root,
    });
  } catch (err) {
    io.warn(`could not build panel.html: ${(err as Error).message}`);
  }
  return model;
}
