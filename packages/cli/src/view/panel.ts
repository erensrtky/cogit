import { pathToFileURL } from "node:url";
import { defaultAgent } from "../agents/index.js";
import type { Io } from "../io.js";
import { redactDeep } from "../redact.js";
import type { Config, RegistryEntry } from "../schema/config.js";
import type { Session } from "../schema/session.js";
import { readProjectChanges } from "../store/changes.js";
import { atomicWrite, isDirectory } from "../store/fs.js";
import { readInboxDismissed } from "../store/inbox-state.js";
import { globalPaths, projectPaths } from "../store/paths.js";
import { readReadState } from "../store/read-state.js";
import { loadAllSessions, loadConfig, loadRegistry } from "../store/stores.js";
import { attachThoughtTrailers, earliestSessionStart, readThoughtTrailers } from "../thought.js";
import { countBigUnread } from "./change.js";
import {
  compareInboxRows,
  dismissKey,
  INBOX_PENDING_LIMIT,
  type InboxCandidate,
  inboxRows,
} from "./inbox.js";
import { embedViewModel, lastActive, statusCard } from "./lineage.js";
import {
  type PanelSettings,
  type PanelViewModel,
  VIEW_SCHEMA,
  type ViewInboxRow,
} from "./model.js";
import type { SwitcherSource } from "./switcher.js";
import { TEMPLATE_HTML } from "./template.js";

export interface PanelOptions {
  env: NodeJS.ProcessEnv;
  io: Io;
  /** Replaces the bundled template; tests inject a minimal page. */
  templateHtml?: string;
  /** A project whose session warnings were already printed by the map build. */
  quietPath?: string;
  /**
   * What the caller already collected (the map build needs the same projects for
   * its switcher); skipped, the panel reads the registry itself.
   */
  data?: PanelData;
}

/**
 * A panel card with the one line the map's switcher shows (Story 8.12). The
 * panel page itself does not embed `leftOff`; the map's switcher does. The
 * shape lives in `switcher.ts` so the template can import it without this file.
 */
export type CollectedProject = SwitcherSource;

const PANEL_TITLE = "<title>cogit — panel</title>";

/**
 * The settings both pages embed (Stories 8.9, 8.13). The map needs them for the
 * settings modal over `file://`, the panel for its model; the server reads the
 * same values live through `GET /api/config`.
 */
export function panelSettings(config: Config): PanelSettings {
  return {
    recorder: config.recorder,
    language: config.language,
    updateEveryTurns: config.updateEveryTurns,
    sideEveryTurns: config.sideEveryTurns,
    sessionEndCatchUp: config.sessionEndCatchUp,
    sideModel: config.sideModel,
    messageSummaries: config.messageSummaries,
    startupContext: config.startupContext,
    recordHeadless: config.recordHeadless,
    tryBeforeNotes: config.tryBeforeNotes,
    shareConversations: config.shareConversations,
    recordCommit: config.recordCommit,
    gitPolicy: config.gitPolicy,
    agents: config.agents,
    bigChangeLines: config.bigChangeLines,
  };
}

/**
 * How many unread messages in this project crossed the threshold (Story 10.3).
 * The card count never fails a panel build: a missing git, a broken record or
 * an unreadable state file simply counts zero.
 */
async function unreadBigCount(
  root: string,
  sessions: Session[],
  threshold: number,
): Promise<number> {
  try {
    const trailers = await readThoughtTrailers(root, {
      since: earliestSessionStart(sessions),
    });
    const withThoughts = attachThoughtTrailers(sessions, trailers);
    const hashes = new Set(
      withThoughts.flatMap((session) => session.nodes.flatMap((node) => node.commits ?? [])),
    );
    if (hashes.size === 0) return 0;
    const changes = await readProjectChanges(root, hashes);
    const read = await readReadState(root);
    return countBigUnread(
      withThoughts.map((session) => ({
        sessionId: session.sessionId,
        title: session.title,
        startedAt: session.startedAt,
        nodes: session.nodes,
      })),
      read,
      threshold,
    );
  } catch {
    return 0;
  }
}

/** The title of the newest message in a session, in send order. */
function lastMessageTitle(session: Session): string {
  const messages = session.nodes.filter((node) => node.kind === "message");
  return messages[messages.length - 1]?.title ?? "";
}

/**
 * Where the work left off: the `next` step of the session with the newest
 * message (not the most recently updated record — fixing an old record must
 * not move it), or the title of its last message when no next step was recorded.
 */
export function leftOffLine(sessions: Session[]): string {
  const newest = [...sessions].sort(
    (a, b) => lastActive(b) - lastActive(a) || a.sessionId.localeCompare(b.sessionId),
  )[0];
  if (!newest) return "";
  return newest.status.next.trim() || lastMessageTitle(newest);
}

/** The newest message of a session, from the record's append order. */
function newestMessageId(session: Session): string | null {
  for (let index = session.nodes.length - 1; index >= 0; index -= 1) {
    const node = session.nodes[index];
    if (node?.kind === "message") return node.id;
  }
  return null;
}

/**
 * The record's last decision: the newest `decision` node, or the newest choice
 * the agent recorded on a message. Read as written; never inferred from text.
 */
export function lastDecisionOf(session: Session): string {
  let found = "";
  for (const node of session.nodes) {
    if (node.kind === "decision") found = node.title;
    else {
      const latest = node.agentDecisions?.at(-1);
      if (latest !== undefined) found = latest.title;
    }
  }
  return found;
}

/** The session's newest activity as ISO, or null when it has no usable time. */
function activityIso(session: Session): string | null {
  const time = lastActive(session);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** The open items the inbox's where-were-we line lists, capped for size. */
function openPending(session: Session) {
  return session.status.pending
    .slice(0, INBOX_PENDING_LIMIT)
    .map((item) => ({ text: item.text, needsUser: item.needsUser }));
}

/**
 * The "your turn" rows of one project (Story 11.1). The primary signal is the
 * transcript's ending through the agent adapter: the agent wrote last, so the
 * user has something to read or answer. The record's `needsUser` items are a
 * second signal and stay labelled as the record's. A session older than
 * `inboxMaxAgeDays` is skipped before its transcript is read.
 */
export async function collectInboxForProject(
  project: { name: string; path: string },
  sessions: Session[],
  transcripts: ReadonlyMap<string, string>,
  config: Config,
  now: string,
): Promise<ViewInboxRow[]> {
  const agent = defaultAgent();
  const cutoff = Date.parse(now) - config.inboxMaxAgeDays * 24 * 60 * 60 * 1000;
  const candidates: InboxCandidate[] = [];
  for (const session of sessions) {
    // Skip the transcript read for a session the age filter would hide anyway;
    // one day of grace keeps a reply that landed after the last message.
    const activity = lastActive(session);
    if (!Number.isNaN(cutoff) && activity < cutoff - 24 * 60 * 60 * 1000) continue;
    const file = transcripts.get(session.sessionId);
    let turn: InboxCandidate["turn"] = null;
    if (file !== undefined) {
      try {
        const last = await agent.readLastTurn(file);
        if (last?.speaker === "agent") turn = { at: last.at, text: last.text };
      } catch {
        // An unreadable transcript is a missing signal, never a failed build.
      }
    }
    const needsUser = session.status.pending
      .filter((item) => item.needsUser)
      .map((item) => item.text);
    if (turn === null && needsUser.length === 0) continue;
    candidates.push({
      projectName: project.name,
      projectPath: project.path,
      mapUrl: pathToFileURL(projectPaths(project.path).html).href,
      sessionId: session.sessionId,
      sessionTitle: session.title || session.sessionId,
      turn,
      lastActivity: activityIso(session),
      needsUser,
      goal: session.status.goal.trim(),
      lastDecision: lastDecisionOf(session),
      pending: openPending(session),
      messageId: newestMessageId(session),
      transcriptAvailable: file !== undefined,
    });
  }
  const dismissed = new Map(
    [...(await readInboxDismissed(project.path))].map(([id, at]) => [
      dismissKey(project.path, id),
      at,
    ]),
  );
  return inboxRows(candidates, dismissed, now, config.inboxMaxAgeDays);
}

/** A panel card plus the inbox rows, collected in one pass per project. */
export interface PanelData {
  projects: CollectedProject[];
  inbox: ViewInboxRow[];
}

/**
 * One card per registry entry, and the inbox rows they carry. A directory that
 * is gone is marked missing instead of failing the panel; one unreadable
 * project is a warning.
 */
export async function collectPanelData(
  entries: RegistryEntry[],
  env: NodeJS.ProcessEnv,
  generatedAt: string,
  warn: (line: string) => void,
  quietPath?: string,
): Promise<PanelData> {
  const config = await loadConfig(env);
  const transcripts = await defaultAgent().collectTranscripts(env);
  const projects: CollectedProject[] = [];
  const inbox: ViewInboxRow[] = [];
  for (const entry of entries) {
    if (!(await isDirectory(entry.path))) {
      projects.push({
        name: entry.name,
        path: entry.path,
        missing: true,
        lastActivity: null,
        needsUserCount: 0,
        lineageUrl: null,
        leftOff: "",
        unreadBigCount: 0,
      });
      continue;
    }
    try {
      const sessionWarn = entry.path === quietPath ? () => {} : warn;
      const sessions = await loadAllSessions(entry.path, sessionWarn);
      const card = statusCard(sessions, generatedAt);
      // Rows first: a failure inside the inbox must leave one fallback card,
      // never a card pushed twice.
      const rows = await collectInboxForProject(
        { name: entry.name, path: entry.path },
        sessions,
        transcripts,
        config,
        generatedAt,
      );
      projects.push({
        name: entry.name,
        path: entry.path,
        missing: false,
        lastActivity: card.lastActivity,
        needsUserCount: card.pending.filter((item) => item.needsUser).length,
        lineageUrl: pathToFileURL(projectPaths(entry.path).html).href,
        leftOff: leftOffLine(sessions),
        unreadBigCount: await unreadBigCount(entry.path, sessions, config.bigChangeLines),
      });
      inbox.push(...rows);
    } catch (err) {
      warn(`skipping project ${entry.path}: ${(err as Error).message}`);
      projects.push({
        name: entry.name,
        path: entry.path,
        missing: false,
        lastActivity: null,
        needsUserCount: 0,
        lineageUrl: pathToFileURL(projectPaths(entry.path).html).href,
        leftOff: "",
        unreadBigCount: 0,
      });
    }
  }
  // Each project's rows are aged and sorted on their own; the panel reads them
  // as one list, so the longest-waiting session across projects comes first.
  inbox.sort(compareInboxRows);
  return { projects, inbox };
}

/** The panel cards only; kept for callers that do not need the inbox. */
export async function collectPanelProjects(
  entries: RegistryEntry[],
  env: NodeJS.ProcessEnv,
  generatedAt: string,
  warn: (line: string) => void,
  quietPath?: string,
): Promise<CollectedProject[]> {
  return (await collectPanelData(entries, env, generatedAt, warn, quietPath)).projects;
}

/**
 * Reads the registry and collects every project. An unreadable registry is a
 * warning and no projects, never a failed build: the panel and the map's
 * switcher are derived state.
 */
export async function collectRegistryData(
  env: NodeJS.ProcessEnv,
  generatedAt: string,
  warn: (line: string) => void,
  quietPath?: string,
): Promise<PanelData> {
  const registry = await loadRegistry(env);
  if (registry.found && !registry.ok) {
    warn(`registry: ${registry.error}; showing no projects`);
    return { projects: [], inbox: [] };
  }
  if (registry.found) {
    for (const warning of registry.warnings) warn(warning);
  }
  if (!registry.found || !registry.ok) return { projects: [], inbox: [] };
  return await collectPanelData(registry.data.projects, env, generatedAt, warn, quietPath);
}

/** The map's switcher and panel cards, without the inbox rows. */
export async function collectRegistryProjects(
  env: NodeJS.ProcessEnv,
  generatedAt: string,
  warn: (line: string) => void,
  quietPath?: string,
): Promise<CollectedProject[]> {
  return (await collectRegistryData(env, generatedAt, warn, quietPath)).projects;
}

/**
 * Builds the global panel from `projects.json` and `config.json` and writes it
 * next to them. The caller decides whether an unwritable global directory is a
 * warning (`build`) or an error (`open` without a directory).
 */
export async function buildPanel(opts: PanelOptions): Promise<PanelViewModel> {
  const { io } = opts;
  const generatedAt = io.now();
  const config = await loadConfig(opts.env);
  const data =
    opts.data ?? (await collectRegistryData(opts.env, generatedAt, io.warn, opts.quietPath));

  const model: PanelViewModel = {
    kind: "panel",
    schema: VIEW_SCHEMA,
    generatedAt,
    settings: panelSettings(config),
    // `leftOff` belongs to the map's switcher; the panel page stays as it was.
    projects: data.projects.map(({ leftOff: _leftOff, ...project }) => project),
    // Oldest first: the row that has waited longest is the one to go back to.
    inbox: data.inbox,
  };

  // Same safety net as the map: nothing leaves this process unredacted.
  const redacted = redactDeep(model);
  if (redacted.count > 0)
    io.warn(`redacted ${redacted.count} secret-looking value(s) in the panel`);

  const template = (opts.templateHtml ?? TEMPLATE_HTML).replace(
    /<title>[^<]*<\/title>/,
    PANEL_TITLE,
  );
  await atomicWrite(globalPaths(opts.env).panel, embedViewModel(template, redacted.value));
  return redacted.value;
}
