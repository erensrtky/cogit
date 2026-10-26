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
});

export type HookState = z.infer<typeof HookState>;
