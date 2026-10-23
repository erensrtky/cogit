import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Slug } from "../schema/common.js";
import { projectPaths } from "../store/paths.js";
import { resolveProjectRoot } from "../store/root.js";
import { onSessionEnd } from "./sessionend.js";
import { onSessionStart } from "./sessionstart.js";
import { onStop } from "./stop.js";

/** The common fields of a Claude Code hook input we rely on. */
export const HookInput = z.looseObject({
  session_id: z.string(),
  cwd: z.string().optional(),
  stop_hook_active: z.boolean().optional(),
  /** SessionStart only: `startup`, `resume`, `clear` or `compact`. */
  source: z.string().optional(),
});
export type HookInput = z.infer<typeof HookInput>;

export interface HookContext {
  input: HookInput;
  sessionId: string;
  /** Where `.codelineage/` lives: `CLAUDE_PROJECT_DIR`, else the hook's `cwd`, mapped out of a worktree. */
  root: string;
  /** Whether `.codelineage/project.json` exists; only SessionStart runs without it. */
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
    env: { ...env, CODELINEAGE_DISABLE: "1" },
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
    if (env.CODELINEAGE_DISABLE === "1") return undefined;
    const handler = HANDLERS[event];
    if (!handler) return undefined;
    const input = HookInput.parse(JSON.parse(stdin));
    if (!Slug.safeParse(input.session_id).success) return undefined;
    // In a linked worktree both point at the worktree; the record lives in the main checkout.
    const { root } = await resolveProjectRoot(env.CLAUDE_PROJECT_DIR ?? input.cwd ?? ".");
    const initialized = existsSync(projectPaths(root).project);
    // Before `init` every hook is a no-op except SessionStart, which offers setup;
    // projects are never registered here.
    if (!initialized && handler !== onSessionStart) return undefined;
    const cli = deps.cli ?? process.argv[1] ?? fileURLToPath(import.meta.url);
    const startCatchUp = (args: string[]) =>
      (deps.spawnDetached ?? spawnDetachedProcess)(cli, args, env);
    const out = await handler({
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
    debug(`codelineage ${event} hook: ${(err as Error).message}`);
    return undefined;
  }
}
