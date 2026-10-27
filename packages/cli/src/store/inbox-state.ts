import { z } from "zod";
import { IsoDate } from "../schema/common.js";
import { atomicWriteJson, readJson } from "./fs.js";
import { withLock } from "./lock.js";
import { projectPaths } from "./paths.js";

/**
 * Which inbox rows the user dismissed (Story 11.1), local per project like the
 * read marks: a dismissal is an action the user took, never inferred. The stored
 * value is the turn time that was dismissed, so a newer agent turn on the same
 * session brings the row back without a second flag.
 */

export const INBOX_STATE_SCHEMA = 1;

const SESSION_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export const InboxState = z.object({
  schema: z.literal(INBOX_STATE_SCHEMA),
  /** Session id → the ISO turn time the user dismissed. */
  dismissed: z.record(z.string(), IsoDate).default({}),
});

export type InboxState = z.infer<typeof InboxState>;

/**
 * Dismissed turn times by session id. A missing or unreadable file is "nothing
 * dismissed": the inbox is derived state and must not fail a build over it.
 */
export async function readInboxDismissed(root: string): Promise<Map<string, string>> {
  const read = await readJson(projectPaths(root).inboxState);
  if (!read.found || "error" in read) return new Map();
  const parsed = InboxState.safeParse(read.value);
  return new Map(parsed.success ? Object.entries(parsed.data.dismissed) : []);
}

/**
 * Records that the user dismissed a session at one turn time. The file is
 * derived state: an unreadable one is replaced rather than blocking the click.
 */
export async function dismissInboxSession(
  root: string,
  sessionId: string,
  at: string,
): Promise<void> {
  if (!SESSION_ID.test(sessionId)) throw new Error(`not a session id: ${sessionId}`);
  const stamp = Date.parse(at);
  if (Number.isNaN(stamp)) throw new Error(`not a time: ${at}`);
  const paths = projectPaths(root);
  await withLock(
    paths.lock("inbox-state"),
    async () => {
      const dismissed = await readInboxDismissed(root);
      dismissed.set(sessionId, at);
      const sorted = Object.fromEntries([...dismissed].sort(([a], [b]) => a.localeCompare(b)));
      await atomicWriteJson(paths.inboxState, {
        schema: INBOX_STATE_SCHEMA,
        dismissed: sorted,
      });
    },
    { timeoutMs: 2000 },
  );
}
