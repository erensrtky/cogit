import { z } from "zod";
import { atomicWriteJson, readJson } from "./fs.js";
import { withLock } from "./lock.js";
import { projectPaths } from "./paths.js";

/**
 * Which messages the user has read (Story 10.3). The mark is a fact the user
 * states, not something cogit infers: no message text is read or classified.
 * It is local per-user state under `.cogit/state/`, never committed and never
 * shared, so one person's reading never marks a teammate's map.
 */

export const READ_STATE_SCHEMA = 1;

const MESSAGE_ID = /^h[0-9a-f]{12}$/;

export const ReadState = z.object({
  schema: z.literal(READ_STATE_SCHEMA),
  /** Read message ids (`h` plus 12 hex). */
  read: z.array(z.string().regex(MESSAGE_ID)).default([]),
});

export type ReadState = z.infer<typeof ReadState>;

/** The ids marked read. A missing or unreadable file is "nothing read yet". */
export async function readReadState(root: string): Promise<Set<string>> {
  const read = await readJson(projectPaths(root).readState);
  if (!read.found || "error" in read) return new Set();
  const parsed = ReadState.safeParse(read.value);
  return new Set(parsed.success ? parsed.data.read : []);
}

/**
 * Marks one message read or unread. The file is derived state: an unreadable
 * one is replaced rather than blocking the toggle, and the list is sorted so
 * two toggles never reorder the file into a noisy diff (it stays ignored).
 */
export async function setMessageRead(root: string, id: string, read: boolean): Promise<void> {
  if (!MESSAGE_ID.test(id)) throw new Error(`not a message id: ${id}`);
  const p = projectPaths(root);
  await withLock(
    p.lock("read-state"),
    async () => {
      const ids = await readReadState(root);
      if (read) ids.add(id);
      else ids.delete(id);
      await atomicWriteJson(p.readState, {
        schema: READ_STATE_SCHEMA,
        read: [...ids].sort(),
      });
    },
    { timeoutMs: 2000 },
  );
}
