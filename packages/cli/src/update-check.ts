import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentAdapter } from "./agents/types.js";
import { compareVersions, PACKAGE } from "./cli-version.js";
import { atomicWriteJson } from "./store/fs.js";
import { globalPaths } from "./store/paths.js";

/**
 * Whether a newer cogit is out. The only request is npm's "latest version of
 * @cogit/cli"; no conversation or code goes with it. A hook never waits on it:
 * SessionStart reads the last answer and starts `cogit update-check` detached
 * when that answer is a day old, so the news shows from the next chat at the
 * latest. Each new version is told at most once a day.
 */

const LATEST_URL = `https://registry.npmjs.org/${PACKAGE}/latest`;
const DAY_MS = 24 * 60 * 60_000;
/** Long enough for a slow line, short enough that a detached child does not linger. */
const FETCH_TIMEOUT_MS = 10_000;
const VERSION = /^\d+\.\d+\.\d+$/;

export interface UpdateState {
  /** When npm last answered. */
  checkedAt?: string;
  /** The newest version npm named then. */
  latest?: string;
  /** The version last told to the user, and when. */
  told?: { version: string; at: string };
}

function statePath(env: NodeJS.ProcessEnv): string {
  return join(globalPaths(env).base, "state", "update-check.json");
}

/** The last answer; empty when there is none or it cannot be read. */
export async function readUpdateState(env: NodeJS.ProcessEnv): Promise<UpdateState> {
  try {
    const value = JSON.parse(await readFile(statePath(env), "utf8")) as UpdateState;
    return typeof value === "object" && value !== null ? value : {};
  } catch {
    return {};
  }
}

function writeUpdateState(env: NodeJS.ProcessEnv, state: UpdateState): Promise<void> {
  return atomicWriteJson(statePath(env), state);
}

/** npm's latest version of the package; undefined when npm cannot be reached or answers oddly. */
export async function fetchLatestVersion(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<string | undefined> {
  try {
    const response = await fetchImpl(LATEST_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { version?: unknown };
    return typeof body.version === "string" && VERSION.test(body.version)
      ? body.version
      : undefined;
  } catch {
    return undefined;
  }
}

/** Asks npm and keeps the answer; a failed request leaves the last one as it was. */
export async function refreshUpdateState(
  env: NodeJS.ProcessEnv,
  now: string,
  fetchImpl?: typeof fetch,
): Promise<string | undefined> {
  const latest = await fetchLatestVersion(fetchImpl);
  if (latest === undefined) return undefined;
  await writeUpdateState(env, { ...(await readUpdateState(env)), checkedAt: now, latest });
  return latest;
}

/** Whether the last answer is missing or a day old. */
export function updateCheckDue(state: UpdateState, now: string): boolean {
  if (state.checkedAt === undefined) return true;
  const age = Date.parse(now) - Date.parse(state.checkedAt);
  return !(age >= 0 && age < DAY_MS);
}

/** The newer version npm named, if `running` is behind it. */
export function newerVersion(state: UpdateState, running: string): string | undefined {
  const latest = state.latest;
  if (latest === undefined || !VERSION.test(latest)) return undefined;
  return compareVersions(latest, running) > 0 ? latest : undefined;
}

/** The line that tells the user, with the commands for their agent. */
export function updateText(latest: string, running: string, agent: AgentAdapter): string {
  return (
    `cogit ${latest} is out (you have ${running}). Update with \`npm install -g ${PACKAGE}\` and ` +
    `${agent.updateHint}. Turn this off with \`cogit config set updateCheck false\`.`
  );
}

/**
 * At a new chat's start: the line to show, when a newer version is out and it was
 * not told today; it is marked as told. Starts the refresh when the answer is old.
 */
export async function updateNotice(
  env: NodeJS.ProcessEnv,
  now: string,
  running: string,
  agent: AgentAdapter,
  refresh: () => void,
): Promise<string | undefined> {
  const state = await readUpdateState(env);
  if (updateCheckDue(state, now)) refresh();
  const latest = newerVersion(state, running);
  if (latest === undefined) return undefined;
  const told = state.told;
  if (told?.version === latest && !updateCheckDue({ checkedAt: told.at }, now)) return undefined;
  await writeUpdateState(env, { ...state, told: { version: latest, at: now } });
  return updateText(latest, running, agent);
}
