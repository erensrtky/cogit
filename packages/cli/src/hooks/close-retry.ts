import { statSync } from "node:fs";
import type { Session } from "../schema/session.js";
import { type HookState, STATE_SCHEMA } from "../schema/state.js";
import { loadAllSessions, loadConfig, updateState } from "../store/stores.js";
import type { HookContext } from "./run.js";

/** A session written to this recently may still be open in another terminal. */
export const CLOSE_RETRY_IDLE_MS = 10 * 60_000;
/** Older sessions are left alone, so an upgrade does not close a whole history at once. */
export const CLOSE_RETRY_WINDOW_MS = 3 * 24 * 60 * 60_000;
/** Retries per session, so one that never yields a `leftOff` is not closed forever. */
export const CLOSE_RETRY_LIMIT = 2;
/** Closing passes one session start may begin. */
export const CLOSE_RETRY_BATCH = 3;

/**
 * The session-end pass runs detached when a session ends, and nothing waits for
 * it: a machine shut down within the next minute, a closed terminal that never
 * fired SessionEnd, or a hung or failed model run leaves the record without
 * where it left off and without its branch summaries. The next session start in
 * the project closes those sessions instead, with the same detached catch-up.
 * Closing one that is in fact still open is harmless: its own session end runs
 * the pass again and rewrites what this one wrote.
 */
export async function retryUnclosed(ctx: HookContext): Promise<void> {
  const config = await loadConfig(ctx.env);
  if (!config.sessionEndCatchUp) return;
  const now = Date.parse(ctx.now);
  const sessions = await loadAllSessions(ctx.root, () => {});
  const candidates = sessions
    .filter((session) => session.sessionId !== ctx.sessionId && unclosed(session, now))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  let started = 0;
  for (const session of candidates) {
    if (started >= CLOSE_RETRY_BATCH) break;
    const id = session.sessionId;
    const transcript = await ctx.agent.findTranscript(id, ctx.env);
    // No transcript (Claude Code deleted it) means nobody is writing to it either.
    const written = transcript
      ? statSync(transcript, { throwIfNoEntry: false })?.mtimeMs
      : undefined;
    if (written !== undefined && now - written < CLOSE_RETRY_IDLE_MS) continue;
    let allowed = false;
    await updateState(ctx.root, id, (cur) => {
      const tries = cur?.closeRetries ?? 0;
      if (tries >= CLOSE_RETRY_LIMIT) return cur ?? emptyState();
      allowed = true;
      return { ...(cur ?? emptyState()), closeRetries: tries + 1 };
    });
    if (!allowed) continue;
    ctx.spawnDetached(["backfill", id, "--tail", "--close", "-C", ctx.root]);
    started += 1;
  }
}

/** Recorded messages, no `leftOff`, idle long enough and recent enough. */
function unclosed(session: Session, now: number): boolean {
  if (session.leftOff !== undefined) return false;
  if (!session.nodes.some((node) => node.kind === "message")) return false;
  const age = now - Date.parse(session.updatedAt);
  return age >= CLOSE_RETRY_IDLE_MS && age <= CLOSE_RETRY_WINDOW_MS;
}

function emptyState(): HookState {
  return {
    schema: STATE_SCHEMA,
    turns: 0,
    turnsSinceUpdate: 0,
    recordUpdatedAt: null,
    turnsSinceSide: 0,
    notedFiles: [],
  };
}
