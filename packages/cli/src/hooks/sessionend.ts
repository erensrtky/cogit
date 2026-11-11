import { readSessionMessages } from "../messages.js";
import { loadConfig, loadState } from "../store/stores.js";
import { markClosePending } from "./close-retry.js";
import type { HookContext } from "./run.js";

/**
 * SessionEnd hook. SessionEnd cannot make the agent act and hook commands get a
 * 1.5 s budget, so this only starts the detached catch-up and returns. The tail
 * is not stored: the catch-up reads whatever messages still have no node, so a
 * child that dies is retried when the session is opened next.
 *
 * The catch-up then runs the closing pass (threads, parents, branch summaries,
 * where the session left off) over the whole session, so it starts even when
 * every message already has a node. Nothing waits for it: when it never
 * finishes, the next session start in the project runs it again (close-retry.ts).
 * A headless session's Stop hook already closed it, waiting (stop.ts); this
 * starts nothing then, unless that pass was cut off.
 */
export async function onSessionEnd(ctx: HookContext): Promise<undefined> {
  if (!ctx.initialized) return undefined;
  const config = await loadConfig(ctx.env);
  if (!config.sessionEndCatchUp) return undefined;
  const messages = await readSessionMessages(ctx.root, ctx.sessionId, ctx.env);
  if (!messages || messages.length === 0) return undefined;
  const state = await loadState(ctx.root, ctx.sessionId);
  if (state.found && state.ok && state.data.closedAt && !state.data.closePending) return undefined;
  // Quality: the session's own model reviews the record while its cache is warm.
  // A retry from a later session (close-retry.ts) runs without it.
  const review = config.recorder === "mixed" ? ["--review"] : [];
  await markClosePending(ctx.root, ctx.sessionId, ctx.now);
  ctx.spawnDetached(["backfill", ctx.sessionId, "--tail", "--close", ...review, "-C", ctx.root]);
  return undefined;
}
