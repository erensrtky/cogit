import { useStore } from "@xyflow/react";
import { type PointerEvent, useState } from "react";
import { clampRowWidth, type GitLayout, ROW_WIDTH } from "./gitLayout.js";

/**
 * The right edge of an open session's message rows: drag it to make the rows
 * wider or narrower, double-click it to reset. Titles get the room and wrap
 * into fewer lines. Each session keeps its own width, and it stays in this
 * browser.
 */

const KEY = "cogit.sessionRowWidths";
/** The grab area stays this wide on screen whatever the zoom. */
const GRAB = 12;

/** Widths the user dragged, by session id; a session not listed has `ROW_WIDTH`. */
export type RowWidths = Readonly<Record<string, number>>;

export function loadRowWidths(): RowWidths {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
    const out: Record<string, number> = {};
    for (const [sessionId, width] of Object.entries(raw)) out[sessionId] = clampRowWidth(width);
    return out;
  } catch {
    return {};
  }
}

export function saveRowWidths(widths: RowWidths): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(widths));
  } catch {
    // Private window or blocked storage: the width lasts until the page closes.
  }
}

/** Keeps the drag on the edge when the pointer leaves it; best effort. */
function capture(event: PointerEvent, on: boolean): void {
  try {
    if (on) event.currentTarget.setPointerCapture(event.pointerId);
    else event.currentTarget.releasePointerCapture(event.pointerId);
  } catch {
    // The pointer is gone already; the drag still ends on pointerup.
  }
}

export function RowEdge({ git, onResize }: { git: GitLayout; onResize: (width: number) => void }) {
  // The canvas may be zoomed: a screen pixel is 1/zoom of a canvas pixel.
  const zoom = useStore((state) => state.transform[2]) || 1;
  const [start, setStart] = useState<{ x: number; width: number } | null>(null);
  const grab = GRAB / zoom;
  return (
    <span
      className={`row-edge nodrag nopan${start ? " is-dragging" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the message rows"
      title="Drag to make the rows wider or narrower · double-click to reset"
      style={{ left: git.width - grab / 2, width: grab, height: git.height }}
      onPointerDown={(event: PointerEvent) => {
        event.stopPropagation();
        capture(event, true);
        setStart({ x: event.clientX, width: git.rowWidth });
      }}
      onPointerMove={(event: PointerEvent) => {
        if (!start) return;
        onResize(clampRowWidth(start.width + (event.clientX - start.x) / zoom));
      }}
      onPointerUp={(event: PointerEvent) => {
        if (!start) return;
        capture(event, false);
        setStart(null);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onResize(ROW_WIDTH);
      }}
    />
  );
}
