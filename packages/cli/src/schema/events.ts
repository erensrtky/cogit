import { z } from "zod";
import { IsoDate, Slug } from "./common.js";

/**
 * Structure changes of one session, appended and never rewritten (Story 8.5).
 * The graph is the replay of this file: the last `parent` event for a message
 * wins, `link` adds a return and `unlink` removes one. Notes stay in the session
 * JSON; this file holds facts only.
 */
export const SessionEvent = z.object({
  /** When the change was recorded. */
  at: IsoDate,
  type: z.enum(["parent", "link", "unlink"]),
  /** The message the event is about, by its stable id. */
  msg: Slug,
  /** The parent for `parent` (null = a new root), the other message for link/unlink. */
  target: Slug.nullable(),
  /** Who made the change: the agent's record, or the user correcting it. */
  by: z.enum(["agent", "user"]).default("agent"),
});

export type SessionEvent = z.infer<typeof SessionEvent>;
