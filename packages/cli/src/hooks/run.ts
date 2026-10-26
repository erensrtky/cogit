import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type AgentAdapter, defaultAgent, type HookInput } from "../agents/index.js";
import { Slug } from "../schema/common.js";
import { captureDisabled, projectPaths } from "../store/paths.js";
import { resolveProjectRoot } from "../store/root.js";
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
}

export type HookOutput = Record<string, unknown>;

/** Test seams for the effects a hook leaves behind. */
export interface HookDeps {
  /** The CLI file a detached child runs; defaults to the running script. */
  cli?: string;
  /** Starts the detached process; tests observe instead of spawning. */
  spawnDetached?: (cli: string, args: string[], env: NodeJS.ProcessEnv) => void;
}

const HANDLERS: Record<string, (ctx: HookContext) => Promise<HookOutput | undefined>> = {
  stop: onStop,
  sessionstart: onSessionStart,
  sessionend: onSessionEnd,
  promptsubmit: onPromptSubmit,
};

export const HOOK_EVENTS = Object.keys(HANDLERS);

/**
 * Starts `node <cli> <args>` detached, with capture disabled in the child so it
 * cannot fire these hooks again. The hook returns at once.
 */
export function spawnDetachedProcess(cli: string, args: string[], env: NodeJS.ProcessEnv): void {
  spawn(process.execPath, [cli, ...args], {
    detached: true,
    stdio: "ignore",
    env: { ...env, COGIT_DISABLE: "1" },
  }).unref();
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
    // In a linked worktree both point at the worktree; the record lives in the main checkout.
    const { root } = await resolveProjectRoot(env[agent.projectDirEnv] ?? input.cwd ?? ".");
    const initialized = existsSync(projectPaths(root).project);
    // Before `init` every hook is a no-op except SessionStart, which offers setup;
    // projects are never registered here.
    if (!initialized && handler !== onSessionStart) return undefined;
    const cli = deps.cli ?? process.argv[1] ?? fileURLToPath(import.meta.url);
    const startCatchUp = (args: string[]) =>
      (deps.spawnDetached ?? spawnDetachedProcess)(cli, args, env);
    const out = await handler({
      agent,
      input,
      sessionId: input.session_id,
      root,
      initialized,
      env,
      now,
      spawnDetached: startCatchUp,
    });
    return out === undefined ? undefined : JSON.stringify(out);
  } catch (err) {
    debug(`cogit ${event} hook: ${(err as Error).message}`);
    return undefined;
  }
}
