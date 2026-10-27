import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";
import { type AgentAdapter, defaultAgent } from "./agents/index.js";
import { findGitRoot } from "./git.js";
import { messageHash } from "./messages.js";
import type { Session } from "./schema/session.js";
import { readSessionHead } from "./session-git.js";
import { captureDisabled } from "./store/paths.js";
import { loadConfig } from "./store/stores.js";

const exec = promisify(execFile);

/**
 * The link between a code commit and the thought behind it (Story 9.4). A git
 * `prepare-commit-msg` hook writes a `Thought: h…` trailer naming the newest user
 * message of the session that made the commit (Story 10.6: the session the
 * agent's shell names, else the one in `.cogit/HEAD`); at read time the trailers
 * are read back from `git log`, so the link survives a rebase or a fresh clone
 * and never depends on the agent remembering a rule.
 */

/** The trailer key git and cogit share. */
export const THOUGHT_TRAILER = "Thought";

/** A message id (`h` plus 12 hex, `messages.ts`). */
const THOUGHT_VALUE = /^h[0-9a-f]{12}$/;

/** A full commit hash: what `%H` prints and what the records store. */
const FULL_HASH = /^[0-9a-f]{40}$/;

export interface TrailerOptions {
  /** The project root (where `.cogit/` lives). */
  dir: string;
  /** Git's `$1`: the file holding the proposed commit message. */
  messageFile: string;
  /** Git's `$2`: `message`, `template`, `merge`, `squash` or `commit`. */
  source?: string;
  env?: NodeJS.ProcessEnv;
  /** The clock used for the freshness check; defaults to now. */
  now?: Date;
}

/** True when the transcript file can be read. */
async function readable(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

/** Git resolves the message file from the working-tree root, which is its cwd. */
function messagePath(file: string): string {
  return isAbsolute(file) ? file : resolve(process.cwd(), file);
}

/** The newest user message of a transcript, as the trailer's value. */
async function newestThought(
  agent: AgentAdapter,
  transcript: string,
  sessionId: string,
): Promise<string | undefined> {
  const turns = await agent.readConversation(transcript);
  const newest = turns.at(-1);
  return newest === undefined ? undefined : messageHash(sessionId, newest);
}

/** Writes the trailer into git's message file, keeping one an `--amend` carried. */
async function writeTrailer(messageFile: string, value: string): Promise<void> {
  await exec("git", [
    "interpret-trailers",
    "--in-place",
    "--if-exists",
    "doNothing",
    "--trailer",
    `${THOUGHT_TRAILER}: ${value}`,
    "--",
    messagePath(messageFile),
  ]);
}

/**
 * Adds the `Thought:` trailer to the prepared commit message (Stories 9.4, 10.6).
 * The session that made the commit wins: when the agent names it in the
 * environment (a shell it started, `CLAUDE_CODE_SESSION_ID`), only that
 * session's transcript counts, so two sessions in one working tree cannot take
 * each other's message. A named session with no readable transcript gets no
 * trailer — never a fallback to `.cogit/HEAD`, which may be another session. With
 * no name (a human commit in a terminal) the fresh `.cogit/HEAD` is used.
 * Merges, squashes and an unreadable transcript are skipped, and a failure is
 * the caller's to swallow: this never blocks the commit.
 */
export async function addThoughtTrailer(opts: TrailerOptions): Promise<boolean> {
  const env = opts.env ?? process.env;
  if (captureDisabled(env)) return false;
  if (opts.source === "merge" || opts.source === "squash") return false;
  const agent = defaultAgent();

  const named = (env[agent.commitSessionEnv] ?? "").trim();
  if (named !== "") {
    const transcript = await agent.findTranscript(named, env);
    if (transcript === null) return false;
    const value = await newestThought(agent, transcript, named);
    if (value === undefined) return false;
    await writeTrailer(opts.messageFile, value);
    return true;
  }

  // Every policy gets the trailer: with the ignore policy the record stays on this
  // machine, but `blame` and `show <sha>` here still follow the exact link.
  const root = resolve(opts.dir);
  const head = await readSessionHead(root);
  if (head === undefined || head.at === undefined) return false;
  const written = Date.parse(head.at);
  if (!Number.isFinite(written)) return false;
  const config = await loadConfig(env);
  const age = (opts.now ?? new Date()).getTime() - written;
  // A little clock skew is fine; a cutoff that passed (or a future date) is not.
  if (age > config.trailerMaxAgeHours * 3_600_000 || age < -5 * 60_000) return false;

  const transcript =
    head.transcriptPath !== undefined && (await readable(head.transcriptPath))
      ? head.transcriptPath
      : await agent.findTranscript(head.sessionId, env);
  if (transcript === null) return false;

  const value = await newestThought(agent, transcript, head.sessionId);
  if (value === undefined) return false;
  await writeTrailer(opts.messageFile, value);
  return true;
}

/**
 * Parses `%H%x00%(trailers:key=Thought,valueonly)` lines into commit → message.
 * A commit with several Thought values keeps the first valid one.
 */
export function parseThoughtTrailers(stdout: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    const separator = line.indexOf("\0");
    if (separator === -1) continue;
    const commit = line.slice(0, separator);
    if (!FULL_HASH.test(commit)) continue;
    for (const value of line.slice(separator + 1).split(/[,\s]+/)) {
      if (THOUGHT_VALUE.test(value)) {
        out.set(commit, value);
        break;
      }
    }
  }
  return out;
}

export interface ReadTrailerOptions {
  env?: NodeJS.ProcessEnv;
  /** Skip commits older than this ISO date; a session cannot explain them. */
  since?: string | undefined;
}

/**
 * The `Thought:` trailers of this repository (Story 9.4), keyed by full commit
 * hash. A missing repository, an old git or an unreadable log only means no
 * links: the map and the read verbs keep working.
 */
export async function readThoughtTrailers(
  root: string,
  opts: ReadTrailerOptions = {},
): Promise<Map<string, string>> {
  const gitRoot = await findGitRoot(root);
  if (gitRoot === undefined) return new Map();
  const args = [
    "-C",
    gitRoot,
    "log",
    "--format=%H%x00%(trailers:key=Thought,valueonly)",
    ...(opts.since === undefined ? [] : [`--since=${opts.since}`]),
  ];
  try {
    const { stdout } = await exec(
      "git",
      args,
      opts.env === undefined ? undefined : { env: opts.env },
    );
    return parseThoughtTrailers(String(stdout));
  } catch {
    return new Map();
  }
}

/** The `Thought:` value of one commit, or undefined (no trailer, no such commit). */
export async function readCommitThought(
  root: string,
  ref: string,
  env?: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const gitRoot = await findGitRoot(root);
  if (gitRoot === undefined) return undefined;
  const args = ["-C", gitRoot, "log", "-1", "--format=%(trailers:key=Thought,valueonly)", ref];
  try {
    const { stdout } = await exec("git", args, env === undefined ? undefined : { env });
    const value = String(stdout).trim().split("\n")[0]?.trim() ?? "";
    return THOUGHT_VALUE.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** The earliest session start, so the trailer read stops at the record's horizon. */
export function earliestSessionStart(sessions: readonly Session[]): string | undefined {
  let earliest: string | undefined;
  for (const session of sessions) {
    if (earliest === undefined || session.startedAt < earliest) earliest = session.startedAt;
  }
  return earliest;
}

/** Both directions, since a record may hold seven characters and git forty. */
function sameCommit(recorded: string, commit: string): boolean {
  return commit.startsWith(recorded) || recorded.startsWith(commit);
}

function thoughtOf(recorded: string, trailers: ReadonlyMap<string, string>): string | undefined {
  for (const [commit, thought] of trailers) {
    if (sameCommit(recorded, commit)) return thought;
  }
  return undefined;
}

/**
 * Attaches trailer-carrying commits to their message nodes (Story 9.4): the
 * union of the commits the agent wrote and the commits git says belong to the
 * message. A commit the agent listed under a different message moves to the
 * trailer's message — the trailer wins. A trailer for a message the record never
 * summarized has nowhere to land and is left for a later build.
 */
export function attachThoughtTrailers(
  sessions: readonly Session[],
  trailers: ReadonlyMap<string, string>,
): Session[] {
  if (trailers.size === 0) return [...sessions];
  const byThought = new Map<string, string[]>();
  for (const [commit, thought] of trailers) {
    const list = byThought.get(thought);
    if (list === undefined) byThought.set(thought, [commit]);
    else if (!list.some((hash) => sameCommit(hash, commit))) list.push(commit);
  }

  return sessions.map((session) => {
    let changed = false;
    const nodes = session.nodes.map((node) => {
      if (node.kind !== "message") return node;
      const current = node.commits ?? [];
      const kept = current.filter((hash) => {
        const thought = thoughtOf(hash, trailers);
        return thought === undefined || thought === node.id;
      });
      const claimed = (byThought.get(node.id) ?? []).filter(
        (commit) => !kept.some((hash) => sameCommit(hash, commit)),
      );
      if (kept.length === current.length && claimed.length === 0) return node;
      changed = true;
      return { ...node, commits: [...kept, ...claimed] };
    });
    return changed ? { ...session, nodes } : session;
  });
}
