import { isRecorded, readSessionMessages, upgradeSessionIds } from "../messages.js";
import { applyEvents, readEvents } from "../store/events.js";
import { loadConfig, loadSession } from "../store/stores.js";
import type { HookContext } from "./run.js";

/**
 * SessionEnd hook. SessionEnd cannot make the agent act and hook commands get a
 * 1.5 s budget, so this only starts the detached catch-up and returns. The tail
 * is not stored: the catch-up reads whatever messages still have no node, so a
 * child that dies is retried when the session is opened next.
 */
export async function onSessionEnd(ctx: HookContext): Promise<undefined> {
  if (!ctx.initialized) return undefined;
  const config = await loadConfig(ctx.env);
  if (!config.sessionEndCatchUp) return undefined;
  const messages = await readSessionMessages(ctx.root, ctx.sessionId, ctx.env);
  if (!messages || messages.length === 0) return undefined;
  const record = await loadSession(ctx.root, ctx.sessionId);
  let recorded = new Set<string>();
  if (record.found && record.ok) {
    const upgraded = upgradeSessionIds(record.data, messages);
    const events = await readEvents(ctx.root, ctx.sessionId);
    recorded = new Set(applyEvents(upgraded.nodes, events).map((node) => node.id));
  }
  if (messages.every((message) => isRecorded(recorded, message))) return undefined;
  ctx.spawnDetached(["backfill", ctx.sessionId, "--tail", "-C", ctx.root]);
  return undefined;
}
