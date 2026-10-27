import { pathToFileURL } from "node:url";
import type { Io } from "../io.js";
import { redactDeep } from "../redact.js";
import type { Config, RegistryEntry } from "../schema/config.js";
import type { Session } from "../schema/session.js";
import { readProjectChanges } from "../store/changes.js";
import { atomicWrite, isDirectory } from "../store/fs.js";
import { globalPaths, projectPaths } from "../store/paths.js";
import { readReadState } from "../store/read-state.js";
import { loadAllSessions, loadConfig, loadRegistry } from "../store/stores.js";
import { attachThoughtTrailers, earliestSessionStart, readThoughtTrailers } from "../thought.js";
import { countBigUnread } from "./change.js";
import { embedViewModel, lastActive, statusCard } from "./lineage.js";
import { type PanelSettings, type PanelViewModel, VIEW_SCHEMA } from "./model.js";
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
   * Projects the caller already collected (the map build needs the same data for
   * its switcher); skipped, the panel reads the registry itself.
   */
  projects?: CollectedProject[];
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
    language: config.language,
    updateEveryTurns: config.updateEveryTurns,
    sessionEndCatchUp: config.sessionEndCatchUp,
    catchUpModel: config.catchUpModel,
    messageSummaries: config.messageSummaries,
    startupContext: config.startupContext,
    shareConversations: config.shareConversations,
    recordCommit: config.recordCommit,
    gitPolicy: config.gitPolicy,
    agents: config.agents,
    bigChangeLines: config.bigChangeLines,
  };
}

/** The schema default, for callers that collect cards without a config. */
const DEFAULT_BIG_CHANGE_LINES = 300;

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

/**
 * One card per registry entry. A directory that is gone is marked missing
 * instead of failing the panel; one unreadable project is a warning.
 */
export async function collectPanelProjects(
  entries: RegistryEntry[],
  generatedAt: string,
  warn: (line: string) => void,
  quietPath?: string,
  bigChangeLines = DEFAULT_BIG_CHANGE_LINES,
): Promise<CollectedProject[]> {
  const projects: CollectedProject[] = [];
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
      projects.push({
        name: entry.name,
        path: entry.path,
        missing: false,
        lastActivity: card.lastActivity,
        needsUserCount: card.pending.filter((item) => item.needsUser).length,
        lineageUrl: pathToFileURL(projectPaths(entry.path).html).href,
        leftOff: leftOffLine(sessions),
        unreadBigCount: await unreadBigCount(entry.path, sessions, bigChangeLines),
      });
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
  return projects;
}

/**
 * Reads the registry and collects every project. An unreadable registry is a
 * warning and no projects, never a failed build: the panel and the map's
 * switcher are derived state.
 */
export async function collectRegistryProjects(
  env: NodeJS.ProcessEnv,
  generatedAt: string,
  warn: (line: string) => void,
  quietPath?: string,
): Promise<CollectedProject[]> {
  const registry = await loadRegistry(env);
  if (registry.found && !registry.ok) {
    warn(`registry: ${registry.error}; showing no projects`);
    return [];
  }
  if (registry.found) {
    for (const warning of registry.warnings) warn(warning);
  }
  if (!registry.found || !registry.ok) return [];
  const config = await loadConfig(env);
  return await collectPanelProjects(
    registry.data.projects,
    generatedAt,
    warn,
    quietPath,
    config.bigChangeLines,
  );
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
  const projects =
    opts.projects ??
    (await collectRegistryProjects(opts.env, generatedAt, io.warn, opts.quietPath));

  const model: PanelViewModel = {
    kind: "panel",
    schema: VIEW_SCHEMA,
    generatedAt,
    settings: panelSettings(config),
    // `leftOff` belongs to the map's switcher; the panel page stays as it was.
    projects: projects.map(({ leftOff: _leftOff, ...project }) => project),
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
