import { defaultAgent } from "../agents/index.js";
import type { HookState } from "../schema/state.js";
import { STATE_SCHEMA } from "../schema/state.js";
import { isLockHeld } from "../store/lock.js";
import { projectPaths } from "../store/paths.js";
import { loadConfig, loadSession, updateState } from "../store/stores.js";
import type { HookContext, HookOutput } from "./run.js";

/** The turn-count request, naming the skill the way the agent spells it. */
export function updateRequestText(skill: string): string {
  return (
    "cogit: several turns have passed since this session's lineage record was last updated. " +
    `Run the ${skill} skill now. It records only what changed and replies ` +
    '"up to date" when nothing did; do not mention this request otherwise.'
  );
}

export const UPDATE_REQUEST = updateRequestText(defaultAgent().skill);

export interface TurnOptions {
  /** How often the side model records (Story 12.1); absent: the agent-only mode. */
  sideEveryTurns?: number;
  /** False in `side` mode: the main agent is never asked by a hook. */
  askAgent?: boolean;
  /** Who wrote the record last, so a side write does not reset the agent's count. */
  lastRecordedBy?: "agent" | "side";
}

export interface TurnPlan {
  state: HookState;
  request: boolean;
  side: boolean;
}

/** One Stop: count the turn and decide who records (Story 12.1). */
export function countTurn(
  state: HookState | undefined,
  recordUpdatedAt: string | null,
  everyTurns: number,
  opts: TurnOptions = {},
): TurnPlan {
  const cur: HookState = state ?? {
    schema: STATE_SCHEMA,
    turns: 0,
    turnsSinceUpdate: 0,
    recordUpdatedAt,
    turnsSinceSide: 0,
    notedFiles: [],
  };
  // A change the agent made (the skill ran) restarts its count. A change the
  // side model made does not: otherwise side runs would starve the agent's
  // every-N-turns request in mixed mode.
  const changed = cur.recordUpdatedAt !== recordUpdatedAt;
  const agentChanged = changed && opts.lastRecordedBy !== "side";
  const turnsSinceUpdate = (agentChanged ? 0 : cur.turnsSinceUpdate) + 1;
  const request = (opts.askAgent ?? true) && turnsSinceUpdate >= everyTurns;
  // Any change means the record is current, so the side model may wait again.
  const turnsSinceSide = (changed ? 0 : cur.turnsSinceSide) + 1;
  const side = opts.sideEveryTurns !== undefined && turnsSinceSide >= opts.sideEveryTurns;
  return {
    state: {
      ...cur,
      turns: cur.turns + 1,
      // Reset on a request too, so an "up to date" answer is not asked again next turn.
      turnsSinceUpdate: request ? 0 : turnsSinceUpdate,
      recordUpdatedAt,
      turnsSinceSide: side ? 0 : turnsSinceSide,
    },
    request,
    side,
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
  const lastRecordedBy = record.found && record.ok ? record.data.lastRecordedBy : undefined;

  let request = false;
  let side = false;
  // A busy lock means another hook is on it; skipping one count is harmless.
  await updateState(
    root,
    sessionId,
    (cur) => {
      const next = countTurn(cur, recordUpdatedAt, config.updateEveryTurns, {
        // In agent mode the side model runs only at session end (Story 12.1).
        ...(config.recorder === "agent" ? {} : { sideEveryTurns: config.sideEveryTurns }),
        askAgent: config.recorder !== "side",
        ...(lastRecordedBy === undefined ? {} : { lastRecordedBy }),
      });
      request = next.request;
      side = next.side;
      return next.state;
    },
    { timeoutMs: 2000 },
  );
  // The side run records outside the chat: detached, behind the session lock,
  // and it never prints into the conversation.
  if (side) ctx.spawnDetached(["backfill", sessionId, "--tail", "-C", root]);
  if (!request) return undefined;
  return ctx.agent.additionalContext("Stop", UPDATE_REQUEST);
}
