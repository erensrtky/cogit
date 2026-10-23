import { existsSync } from "node:fs";
import { z } from "zod";
import { Slug } from "../schema/common.js";
import { projectPaths } from "../store/paths.js";
import { resolveProjectRoot } from "../store/root.js";
import { onStop } from "./stop.js";

/** The common fields of a Claude Code hook input we rely on. */
export const HookInput = z.looseObject({
  session_id: z.string(),
  cwd: z.string().optional(),
  stop_hook_active: z.boolean().optional(),
});
export type HookInput = z.infer<typeof HookInput>;

export interface HookContext {
  input: HookInput;
  sessionId: string;
  /** Where `.codelineage/` lives: `CLAUDE_PROJECT_DIR`, else the hook's `cwd`, mapped out of a worktree. */
  root: string;
  env: NodeJS.ProcessEnv;
  now: string;
}

export type HookOutput = Record<string, unknown>;

const HANDLERS: Record<string, (ctx: HookContext) => Promise<HookOutput | undefined>> = {
  stop: onStop,
};

export const HOOK_EVENTS = Object.keys(HANDLERS);

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
): Promise<string | undefined> {
  try {
    if (env.CODELINEAGE_DISABLE === "1") return undefined;
    const handler = HANDLERS[event];
    if (!handler) return undefined;
    const input = HookInput.parse(JSON.parse(stdin));
    if (!Slug.safeParse(input.session_id).success) return undefined;
    // In a linked worktree both point at the worktree; the record lives in the main checkout.
    const { root } = await resolveProjectRoot(env.CLAUDE_PROJECT_DIR ?? input.cwd ?? ".");
    // Before `init` every hook is a no-op; projects are never registered here.
    if (!existsSync(projectPaths(root).project)) return undefined;
    const out = await handler({ input, sessionId: input.session_id, root, env, now });
    return out === undefined ? undefined : JSON.stringify(out);
  } catch (err) {
    debug(`codelineage ${event} hook: ${(err as Error).message}`);
    return undefined;
  }
}
