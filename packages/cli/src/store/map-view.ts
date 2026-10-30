import { z } from "zod";
import { atomicWriteJson, readJson } from "./fs.js";
import { withLock } from "./lock.js";
import { projectPaths } from "./paths.js";

/**
 * How the user left the map: which sessions were open and how wide each one's
 * message rows were dragged. A view preference, so it is local per-user state
 * under `.cogit/state/` like the read marks: never committed, so one person's
 * map never reshapes a teammate's. The page keeps widths in range; this file
 * only checks that they are sane numbers.
 */

export const MAP_VIEW_SCHEMA = 1;

const SESSION_ID = /^[A-Za-z0-9._:-]{1,128}$/;
/** Far past anything the map lets a drag reach. */
const MAX_WIDTH = 10_000;
/** More open sessions than any map shows; a cap on what one request may store. */
export const MAX_OPEN = 500;

export const MapView = z.object({
  schema: z.literal(MAP_VIEW_SCHEMA),
  /** Session id → the message rows' width in map pixels. */
  rowWidths: z.record(z.string(), z.number().int().positive().max(MAX_WIDTH)).default({}),
  /** Sessions open on the map, in the order the page sent them. */
  open: z.array(z.string().regex(SESSION_ID)).max(MAX_OPEN).default([]),
});

export type MapView = z.infer<typeof MapView>;

/** The stored view. A missing or unreadable file is "nothing stored yet". */
export async function readMapView(root: string): Promise<MapView> {
  const read = await readJson(projectPaths(root).mapView);
  const empty: MapView = { schema: MAP_VIEW_SCHEMA, rowWidths: {}, open: [] };
  if (!read.found || "error" in read) return empty;
  const parsed = MapView.safeParse(read.value);
  return parsed.success ? parsed.data : empty;
}

/** Reads, changes and writes the view under its lock; an unreadable file is replaced. */
async function updateMapView(root: string, change: (view: MapView) => void): Promise<void> {
  const paths = projectPaths(root);
  await withLock(
    paths.lock("map-view"),
    async () => {
      const view = await readMapView(root);
      change(view);
      const rowWidths = Object.fromEntries(
        Object.entries(view.rowWidths).sort(([a], [b]) => a.localeCompare(b)),
      );
      await atomicWriteJson(paths.mapView, { schema: MAP_VIEW_SCHEMA, rowWidths, open: view.open });
    },
    { timeoutMs: 2000 },
  );
}

/** Stores one session's width, or forgets it (`null`, the double-click reset). */
export async function setRowWidth(
  root: string,
  sessionId: string,
  width: number | null,
): Promise<void> {
  if (!SESSION_ID.test(sessionId)) throw new Error(`not a session id: ${sessionId}`);
  if (width !== null && !(Number.isInteger(width) && width > 0 && width <= MAX_WIDTH))
    throw new Error(`not a row width: ${width}`);
  await updateMapView(root, (view) => {
    if (width === null) delete view.rowWidths[sessionId];
    else view.rowWidths[sessionId] = width;
  });
}

/** Stores which sessions are open, replacing the previous list. */
export async function setOpenSessions(root: string, open: readonly string[]): Promise<void> {
  if (open.length > MAX_OPEN) throw new Error(`too many open sessions: ${open.length}`);
  for (const sessionId of open)
    if (!SESSION_ID.test(sessionId)) throw new Error(`not a session id: ${sessionId}`);
  await updateMapView(root, (view) => {
    view.open = [...new Set(open)];
  });
}
