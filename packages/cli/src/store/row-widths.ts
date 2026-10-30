import { z } from "zod";
import { atomicWriteJson, readJson } from "./fs.js";
import { withLock } from "./lock.js";
import { projectPaths } from "./paths.js";

/**
 * How wide the user dragged each session's message rows on the map. A view
 * preference, so it is local per-user state under `.cogit/state/` like the read
 * marks: never committed, so one person's wide screen never reshapes a
 * teammate's map. The page keeps the width in range; this file only checks that
 * it is a sane number.
 */

export const ROW_WIDTHS_SCHEMA = 1;

const SESSION_ID = /^[A-Za-z0-9._:-]{1,128}$/;
/** Far past anything the map lets a drag reach. */
const MAX_WIDTH = 10_000;

export const RowWidths = z.object({
  schema: z.literal(ROW_WIDTHS_SCHEMA),
  /** Session id → the message rows' width in map pixels. */
  widths: z.record(z.string(), z.number().int().positive().max(MAX_WIDTH)).default({}),
});

export type RowWidths = z.infer<typeof RowWidths>;

/** The stored widths. A missing or unreadable file is "nothing dragged yet". */
export async function readRowWidths(root: string): Promise<Record<string, number>> {
  const read = await readJson(projectPaths(root).rowWidths);
  if (!read.found || "error" in read) return {};
  const parsed = RowWidths.safeParse(read.value);
  return parsed.success ? parsed.data.widths : {};
}

/**
 * Stores one session's width, or forgets it (`null`, the double-click reset).
 * The file is derived state: an unreadable one is replaced rather than blocking
 * the drag.
 */
export async function setRowWidth(
  root: string,
  sessionId: string,
  width: number | null,
): Promise<void> {
  if (!SESSION_ID.test(sessionId)) throw new Error(`not a session id: ${sessionId}`);
  if (width !== null && !(Number.isInteger(width) && width > 0 && width <= MAX_WIDTH))
    throw new Error(`not a row width: ${width}`);
  const paths = projectPaths(root);
  await withLock(
    paths.lock("row-widths"),
    async () => {
      const widths = await readRowWidths(root);
      if (width === null) delete widths[sessionId];
      else widths[sessionId] = width;
      const sorted = Object.fromEntries(
        Object.entries(widths).sort(([a], [b]) => a.localeCompare(b)),
      );
      await atomicWriteJson(paths.rowWidths, { schema: ROW_WIDTHS_SCHEMA, widths: sorted });
    },
    { timeoutMs: 2000 },
  );
}
