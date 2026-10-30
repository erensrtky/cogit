import { useStore } from "@xyflow/react";
import { type PointerEvent, useState } from "react";
import { clampMapWidth, MAP_WIDTH } from "./gitLayout.js";

/**
 * The project map's right edge, full height: drag it to make every row, the
 * sessions' and the open sessions' messages, wider or narrower; double-click it
 * to reset. Titles get the room and wrap into fewer lines. The width stays in
 * this browser.
 */

const KEY = "cogit.mapWidth";
/** The grab area stays this wide on screen whatever the zoom. */
const GRAB = 12;

export function loadMapWidth(): number {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === null ? MAP_WIDTH : clampMapWidth(Number(raw));
  } catch {
    return MAP_WIDTH;
  }
}

export function saveMapWidth(width: number): void {
  try {
    window.localStorage.setItem(KEY, String(width));
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

export function RowEdge({
  left,
  height,
  width,
  onResize,
}: {
  /** Where the edge sits on the canvas. */
  left: number;
  height: number;
  /** The width the edge sets; a drag adds to it. */
  width: number;
  onResize: (width: number) => void;
}) {
  // The canvas may be zoomed: a screen pixel is 1/zoom of a canvas pixel.
  const zoom = useStore((state) => state.transform[2]) || 1;
  const [start, setStart] = useState<{ x: number; width: number } | null>(null);
  const grab = GRAB / zoom;
  return (
    <span
      className={`row-edge nodrag nopan${start ? " is-dragging" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the map's rows"
      title="Drag to make the rows wider or narrower · double-click to reset"
      style={{ left: left - grab / 2, width: grab, height }}
      onPointerDown={(event: PointerEvent) => {
        event.stopPropagation();
        capture(event, true);
        setStart({ x: event.clientX, width });
      }}
      onPointerMove={(event: PointerEvent) => {
        if (!start) return;
        onResize(clampMapWidth(start.width + (event.clientX - start.x) / zoom));
      }}
      onPointerUp={(event: PointerEvent) => {
        if (!start) return;
        capture(event, false);
        setStart(null);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onResize(MAP_WIDTH);
      }}
    />
  );
}
