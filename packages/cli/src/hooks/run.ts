import { spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type AgentAdapter, defaultAgent, type HookInput } from "../agents/index.js";
import type { SessionLineage } from "../agents/types.js";
import { Slug } from "../schema/common.js";
import { captureDisabled, projectPaths } from "../store/paths.js";
import { resolveProjectRoot } from "../store/root.js";
import { loadConfig } from "../store/stores.js";
import { onPromptSubmit } from "./promptsubmit.js";
import { onSessionEnd } from "./sessionend.js";
import { onSessionStart } from "./sessionstart.js";
import { onStop } from "./stop.js";

export interface HookContext {
  /** The agent whose hook this is: its payload format and its record skill. */
  agent: AgentAdapter;
  input: HookInput;
  sessionId: string;
  /** Where `.cogit/` lives: `CLAUDE_PROJECT_DIR`, else the hook's `cwd`, mapped out of a worktree. */
  root: string;
  /** Whether `.cogit/project.json` exists; only SessionStart runs without it. */
  initialized: boolean;
  env: NodeJS.ProcessEnv;
  now: string;
  /** Starts the detached catch-up (`node <cli> <args>`); never waited for. */
  spawnDetached: (args: string[]) => void;
  /** Runs `node <cli> <args>` and waits for it, up to `RUN_AND_WAIT_LIMIT_MS`. */
  runAndWait: (args: string[]) => Promise<void>;
}

export type HookOutput = Record<string, unknown>;

/** Test seams for the effects a hook leaves behind. */
export interface HookDeps {
  /** The CLI file a detached child runs; defaults to the running script. */
  cli?: string;
  /** Starts the detached process; tests observe instead of spawning. */
  spawnDetached?: (cli: string, args: string[], env: NodeJS.ProcessEnv, log?: string) => void;
  /** Runs a child and waits for it; tests observe instead of running. */
  runAndWait?: (cli: string, args: string[], env: NodeJS.ProcessEnv, log?: string) => Promise<void>;
  /** Stands in for the agent's process-tree read; tests fix the answer. */
  sessionLineage?: () => SessionLineage | undefined;
}

/** Where each session's process-tree answer is kept for its later hooks. */
export function lineageCacheDir(): string {
  return join(tmpdir(), "cogit-headless");
}

/**
 * The process-tree answer for one session, read once and kept for its later
 * hooks: on macOS each process costs a `ps` call, and a loop's session runs
 * several hooks. "No answer" is kept too, so it is not asked again.
 */
export function rememberedLineage(
  dir: string,
  sessionId: string,
  read: () => SessionLineage | undefined,
): SessionLineage | undefined {
  const file = join(dir, sessionId);
  try {
    const kept = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (kept === "unknown") return undefined;
    if (
      typeof kept === "object" &&
      kept !== null &&
      typeof (kept as SessionLineage).own === "number"
    )
      return kept as SessionLineage;
  } catch {
    // Not read yet for this session.
  }
  const answer = read();
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(answer ?? "unknown"));
  } catch {
    // Read again next time.
  }
  return answer;
}

/**
 * Whether a headless session is recorded under `recordHeadless` (Background
 * work). On records the sessions a person or a script started (no session
 * process above: a loop, cron) and the ones a recorded session started through
 * its commands: that session hands them `COGIT_RECORD=<its process>`, and only
 * a session it started directly counts, not one a plugin starts inside it in
 * turn. A tool's own `COGIT_RECORD=1` always counts. Where the process tree
 * cannot be read (Windows), a session mark counts too and nothing else does.
 */
export function recordsHeadless(
  on: boolean,
  env: NodeJS.ProcessEnv,
  lineage: () => SessionLineage | undefined,
): boolean {
  if (!on) return false;
  const mark = env.COGIT_RECORD;
  if (mark === "1") return true;
  const known = lineage();
  if (mark !== undefined && /^\d+$/.test(mark))
    return known === undefined || known.parent === Number(mark);
  return known !== undefined && known.parent === null;
}

const HANDLERS: Record<string, (ctx: HookContext) => Promise<HookOutput | undefined>> = {
  stop: onStop,
  sessionstart: onSessionStart,
  sessionend: onSessionEnd,
  promptsubmit: onPromptSubmit,
};

export const HOOK_EVENTS = Object.keys(HANDLERS);

/** Past this size the log starts over, so a long-lived project never grows it unbounded. */
const LOG_LIMIT = 256 * 1024;

/**
 * Opens `log` for appending, with a header naming the run, and returns its fd;
 * undefined when it cannot be opened, so logging never stops the child.
 */
function openLog(log: string, args: string[]): number | undefined {
  try {
    mkdirSync(dirname(log), { recursive: true });
    let flag = "a";
    try {
      if (statSync(log).size > LOG_LIMIT) flag = "w";
    } catch {
      // No log yet.
    }
    const fd = openSync(log, flag);
    writeSync(fd, `\n--- ${new Date().toISOString()} ${args.join(" ")}\n`);
    return fd;
  } catch {
    return undefined;
  }
}

/**
 * How long a hook waits for a child it runs in the foreground. The plugin gives
 * the Stop hook ten minutes; this leaves room to return before that.
 */
export const RUN_AND_WAIT_LIMIT_MS = 9 * 60_000;

/**
 * Runs `node <cli> <args>` with capture disabled, like the detached child, but
 * waits for it to end (or for `limit`, then stops it). Its output goes to `log`.
 */
export function runAndWaitProcess(
  cli: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  log?: string,
  limit = RUN_AND_WAIT_LIMIT_MS,
): Promise<void> {
  const fd = log === undefined ? undefined : openLog(log, args);
  const out = fd ?? "ignore";
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      if (fd !== undefined) closeSync(fd);
      resolve();
    };
    const child = spawn(process.execPath, [cli, ...args], {
      stdio: ["ignore", out, out],
      env: { ...env, COGIT_DISABLE: "1" },
    });
    const timer = setTimeout(() => child.kill(), limit);
    child.on("exit", done);
    child.on("error", done);
  });
}

/**
 * Starts `node <cli> <args>` detached, with capture disabled in the child so it
 * cannot fire these hooks again. The hook returns at once. With `log`, the
 * child's stdout and stderr are appended there; a failed side run is otherwise
 * invisible.
 */
export function spawnDetachedProcess(
  cli: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  log?: string,
): void {
  const fd = log === undefined ? undefined : openLog(log, args);
  const out = fd ?? "ignore";
  try {
    spawn(process.execPath, [cli, ...args], {
      detached: true,
      stdio: ["ignore", out, out],
      env: { ...env, COGIT_DISABLE: "1" },
    }).unref();
  } finally {
    // The child holds its own copy of the descriptor.
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * Runs one hook and returns what to print on stdout, if anything. A hook must
 * never break the user's session, so every failure ends in silence; the reason
 * goes to `debug` (stderr, which Claude Code shows only in debug output).
 */
export async function runHook(
  event: string,
  stdin: string,
  env: NodeJS.ProcessEnv,
  now: string,
  debug: (line: string) => void,
  deps: HookDeps = {},
): Promise<string | undefined> {
  try {
    if (captureDisabled(env)) return undefined;
    const handler = HANDLERS[event];
    if (!handler) return undefined;
    const agent = defaultAgent();
    const input = agent.parseHookInput(stdin);
    if (input === undefined) {
      debug(`cogit ${event} hook: unreadable hook input`);
      return undefined;
    }
    if (!Slug.safeParse(input.session_id).success) return undefined;
    // The project's guard hook looks for this mark (agents/claude/settings.ts).
    if (handler === onSessionStart)
      await agent
        .markLive(input.session_id)
        .catch((err: Error) => debug(`cogit mark: ${err.message}`));
    const { recordHeadless } = await loadConfig(env);
    const lineage =
      deps.sessionLineage ??
      (() => rememberedLineage(lineageCacheDir(), input.session_id, () => agent.sessionLineage()));
    if (agent.isHeadless(env) && !recordsHeadless(recordHeadless, env, lineage)) return undefined;
    // What this session starts through its own commands (a `claude -p` handed a
    // task) is recorded with it.
    if (handler === onSessionStart && recordHeadless)
      await agent
        .markChildren(env, lineage()?.own)
        .catch((err: Error) => debug(`cogit mark: ${err.message}`));
    // In a linked worktree both point at the worktree; the record lives in the main checkout.
    const { root } = await resolveProjectRoot(env[agent.projectDirEnv] ?? input.cwd ?? ".");
    const initialized = existsSync(projectPaths(root).project);
    // Before `init` every hook is a no-op except SessionStart, which offers setup;
    // projects are never registered here.
    if (!initialized && handler !== onSessionStart) return undefined;
    const cli = deps.cli ?? process.argv[1] ?? fileURLToPath(import.meta.url);
    const startCatchUp = (args: string[]) =>
      (deps.spawnDetached ?? spawnDetachedProcess)(cli, args, env, projectPaths(root).detachedLog);
    const out = await handler({
      agent,
      input,
      sessionId: input.session_id,
      root,
      initialized,
      env,
      now,
      spawnDetached: startCatchUp,
      runAndWait: (args: string[]) =>
        (deps.runAndWait ?? runAndWaitProcess)(cli, args, env, projectPaths(root).detachedLog),
    });
    return out === undefined ? undefined : JSON.stringify(out);
  } catch (err) {
    debug(`cogit ${event} hook: ${(err as Error).message}`);
    return undefined;
  }
}
