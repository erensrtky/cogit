import { z } from "zod";
import { IsoDate } from "./common.js";

export const STATE_SCHEMA = 1;

/**
 * Per-session hook state in `.cogit/state/<id>.json`. It is derived and
 * machine-local: losing it only restarts the turn count.
 */
export const HookState = z.object({
  schema: z.literal(STATE_SCHEMA),
  /** Completed turns seen by the Stop hook (hook-driven continuations excluded). */
  turns: z.number().int().min(0).default(0),
  /** Turns since the record last changed or the skill was last requested. */
  turnsSinceUpdate: z.number().int().min(0).default(0),
  /** The record's `updatedAt` when the hook last looked; a change resets the count. */
  recordUpdatedAt: IsoDate.nullable().default(null),
  /** Turns since the side model last recorded (Story 12.1). */
  turnsSinceSide: z.number().int().min(0).default(0),
  /**
   * When the main agent last wrote the record. `session show` lists what the
   * side model recorded since then, so the agent can add or correct its own
   * decisions there; null until the agent's first write.
   */
  agentWroteAt: IsoDate.nullable().default(null),
  /**
   * Closing passes a later session started for this one because its own, at
   * the session end, never finished (machine shut down, run hung or failed).
   */
  closeRetries: z.number().int().min(0).optional(),
});

export type HookState = z.infer<typeof HookState>;
