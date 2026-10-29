import { refreshGitHooks } from "../git-hooks.js";
import { HookState, STATE_SCHEMA } from "../schema/state.js";
import { atomicWriteJson } from "../store/fs.js";
import { projectPaths } from "../store/paths.js";
import { updateState } from "../store/stores.js";
import type { HookContext } from "./run.js";

/**
 * UserPromptSubmit hook (Story 9.3). Records which session this working tree is
 * in, so the git pre-commit hook can carry its record with the next code commit.
 * The file is local state (`.cogit/.gitignore` keeps it out) and is rewritten on
 * every message: a resumed or new session replaces the previous one. It also
 * opens the session's hook state, so the map shows it from the first message.
 */
export async function onPromptSubmit(ctx: HookContext): Promise<undefined> {
  if (!ctx.initialized) return undefined;
  await atomicWriteJson(projectPaths(ctx.root).head, {
    sessionId: ctx.sessionId,
    ...(ctx.input.transcript_path === undefined
      ? {}
      : { transcriptPath: ctx.input.transcript_path }),
    at: ctx.now,
  });
  // The map lists a session without a record by its state file; before the
  // first Stop there was none, so a long first turn kept it off the map.
  await updateState(
    ctx.root,
    ctx.sessionId,
    (cur) => cur ?? HookState.parse({ schema: STATE_SCHEMA }),
    {
      timeoutMs: 1500,
    },
  );
  // A plugin update moves the CLI: point the git hooks' blocks at this one.
  await refreshGitHooks(ctx.root).catch(() => undefined);
  return undefined;
}
