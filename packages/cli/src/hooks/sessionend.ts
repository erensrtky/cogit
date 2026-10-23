import { loadConfig, loadSession } from "../store/stores.js";
import { findTranscript, readConversation } from "../transcript.js";
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
  const file = await findTranscript(ctx.sessionId, ctx.env);
  if (!file) return undefined;
  let turns;
  try {
    turns = await readConversation(file);
  } catch {
    return undefined;
  }
  const record = await loadSession(ctx.root, ctx.sessionId);
  const recorded = new Set(record.found && record.ok ? record.data.nodes.map((n) => n.id) : []);
  if (turns.every((turn) => recorded.has(turn.id))) return undefined;
  ctx.spawnDetached(["backfill", ctx.sessionId, "--tail", "-C", ctx.root]);
  return undefined;
}
