import { CliError, type Io } from "../io.js";
import { redactDeep } from "../redact.js";
import type { Session } from "../schema/session.js";
import { atomicWrite } from "../store/fs.js";
import { projectPaths } from "../store/paths.js";
import { resolveProjectRoot } from "../store/root.js";
import { loadAllSessions, loadProject } from "../store/stores.js";
import { type ChatTurn, displayTurn, readConversation } from "../transcript.js";
import { buildViewModel, embedViewModel } from "../view/lineage.js";
import type { LineageViewModel } from "../view/model.js";
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

/**
 * The conversation of every session that records messages and still has its
 * transcript. It goes into the page only, never into a session file. A transcript
 * that cannot be read leaves that session without a chat, with a warning.
 */
async function readChats(
  sessions: Session[],
  transcripts: ReadonlyMap<string, string>,
  root: string,
  io: Io,
): Promise<Map<string, ChatTurn[]>> {
  const chats = new Map<string, ChatTurn[]>();
  for (const session of sessions) {
    const file = transcripts.get(session.sessionId);
    if (!file || !session.nodes.some((node) => node.kind === "message")) continue;
    try {
      const roots = [session.worktree?.path, root].filter((r): r is string => Boolean(r));
      const turns = await readConversation(file);
      chats.set(
        session.sessionId,
        turns.map((turn) => displayTurn(turn, roots)),
      );
    } catch (err) {
      io.warn(`could not read the conversation of ${session.sessionId}: ${(err as Error).message}`);
    }
  }
  return chats;
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
  const sessions = await loadAllSessions(root, io.warn);
  const transcripts = await collectTranscripts(io.env);
  const model = buildViewModel({
    project: project.data,
    sessions,
    path: root,
    generatedAt: io.now(),
    transcripts: new Set(transcripts.keys()),
    chats: await readChats(sessions, transcripts, root, io),
  });
  // The skill already avoids secrets; this is the safety net before rendering.
  const redacted = redactDeep(model);
  if (redacted.count > 0) io.warn(`redacted ${redacted.count} secret-looking value(s) in the map`);

  const template = opts.templateHtml ?? TEMPLATE_HTML;
  await atomicWrite(paths.html, embedViewModel(template, redacted.value));
  if (!opts.quiet) io.out(`Wrote ${paths.html}`);

  // The panel is derived state: a read-only home or a broken registry warning
  // must never turn a successful map build into a failure.
  try {
    await buildPanel({ env: io.env, io, templateHtml: template, quietPath: root });
  } catch (err) {
    io.warn(`could not build panel.html: ${(err as Error).message}`);
  }
  return redacted.value;
}
