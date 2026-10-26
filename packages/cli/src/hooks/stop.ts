import type { HookState } from "../schema/state.js";
import { STATE_SCHEMA } from "../schema/state.js";
import { isLockHeld } from "../store/lock.js";
import { projectPaths } from "../store/paths.js";
import { loadConfig, loadSession, updateState } from "../store/stores.js";
import type { HookContext, HookOutput } from "./run.js";

export const UPDATE_REQUEST =
  "cogit: several turns have passed since this session's lineage record was last updated. " +
  "Run the /cogit:record skill now. It records only what changed and replies " +
  '"up to date" when nothing did; do not mention this request otherwise.';

/** One Stop: count the turn and decide whether to ask for a record update. */
export function countTurn(
  state: HookState | undefined,
  recordUpdatedAt: string | null,
  everyTurns: number,
): { state: HookState; request: boolean } {
  const cur: HookState = state ?? {
    schema: STATE_SCHEMA,
    turns: 0,
    turnsSinceUpdate: 0,
    recordUpdatedAt,
  };
  // The record changed since the last Stop (the skill ran), so count from here.
  const since = cur.recordUpdatedAt === recordUpdatedAt ? cur.turnsSinceUpdate : 0;
  const turnsSinceUpdate = since + 1;
  const request = turnsSinceUpdate >= everyTurns;
  return {
    state: {
      ...cur,
      turns: cur.turns + 1,
      // Reset on a request too, so an "up to date" answer is not asked again next turn.
      turnsSinceUpdate: request ? 0 : turnsSinceUpdate,
      recordUpdatedAt,
    },
    request,
  };
}

/** True while a build or this session's write is running; the next turn rebuilds. */
async function mapBusy(root: string, sessionId: string): Promise<boolean> {
  const paths = projectPaths(root);
  if (await isLockHeld(paths.lock("build"))) return true;
  return isLockHeld(paths.lock(`session-${sessionId}`));
}

/**
 * Stop hook: rebuilds the map after every turn, detached so the hook returns at
 * once, and every `updateEveryTurns` completed turns asks the agent to run the
 * skill through `additionalContext` ("Stop hook feedback", not an error). Turns
 * that a stop hook itself continued are not counted and never asked again.
 */
export async function onStop(ctx: HookContext): Promise<HookOutput | undefined> {
  if (ctx.input.stop_hook_active) return undefined;
  const { root, sessionId } = ctx;
  if (!(await mapBusy(root, sessionId))) ctx.spawnDetached(["build", root, "--quiet"]);
  const config = await loadConfig(ctx.env);
  const record = await loadSession(root, sessionId);
  const recordUpdatedAt = record.found && record.ok ? record.data.updatedAt : null;

  let request = false;
  // A busy lock means another hook is on it; skipping one count is harmless.
  await updateState(
    root,
    sessionId,
    (cur) => {
      const next = countTurn(cur, recordUpdatedAt, config.updateEveryTurns);
      request = next.request;
      return next.state;
    },
    { timeoutMs: 2000 },
  );
  if (!request) return undefined;
  return { hookSpecificOutput: { hookEventName: "Stop", additionalContext: UPDATE_REQUEST } };
}
