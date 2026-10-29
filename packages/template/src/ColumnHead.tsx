import { useStore } from "@xyflow/react";
import { type PointerEvent, useState } from "react";
import { columnVars } from "./GitGraph.js";
import { clampColumns, DEFAULT_COLUMNS, type GitLayout, type RowColumns } from "./gitLayout.js";

/**
 * The head over an open session's message rows: the column names, and a handle
 * on each column's right edge to drag it wider or narrower, like a table.
 * Double-clicking a handle puts that column back to its default width. The
 * widths are the same for every session and stay in this browser.
 */

const KEY = "cogit.mapColumns";

export function loadColumns(): RowColumns {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? clampColumns(JSON.parse(raw)) : DEFAULT_COLUMNS;
  } catch {
    return DEFAULT_COLUMNS;
  }
}

export function saveColumns(columns: RowColumns): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(columns));
  } catch {
    // Private window or blocked storage: the widths last until the page closes.
  }
}

/** Keeps the drag on the handle when the pointer leaves it; best effort. */
function capture(event: PointerEvent, on: boolean): void {
  try {
    if (on) event.currentTarget.setPointerCapture(event.pointerId);
    else event.currentTarget.releasePointerCapture(event.pointerId);
  } catch {
    // The pointer is gone already; the drag still ends on pointerup.
  }
}

/** Height of the head; the open session leaves this much room above its rows. */
export const COLUMN_HEAD = 22;

function Handle({
  column,
  columns,
  onResize,
}: {
  column: keyof RowColumns;
  columns: RowColumns;
  onResize: (columns: RowColumns) => void;
}) {
  // The canvas may be zoomed: a screen pixel is 1/zoom of a column pixel.
  const zoom = useStore((state) => state.transform[2]);
  const [start, setStart] = useState<{ x: number; width: number } | null>(null);
  return (
    <span
      className={`column-handle nodrag nopan${start ? " is-dragging" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize the ${column} column`}
      title="Drag to resize · double-click to reset"
      onPointerDown={(event: PointerEvent) => {
        event.stopPropagation();
        capture(event, true);
        setStart({ x: event.clientX, width: columns[column] });
      }}
      onPointerMove={(event: PointerEvent) => {
        if (!start) return;
        const width = start.width + (event.clientX - start.x) / (zoom || 1);
        onResize(clampColumns({ ...columns, [column]: width }));
      }}
      onPointerUp={(event: PointerEvent) => {
        if (!start) return;
        capture(event, false);
        setStart(null);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onResize({ ...columns, [column]: DEFAULT_COLUMNS[column] });
      }}
    />
  );
}

export function ColumnHead({
  git,
  onResize,
}: {
  git: GitLayout;
  onResize: (columns: RowColumns) => void;
}) {
  const columns = git.columns;
  if (!columns) return null;
  const handle = (column: keyof RowColumns) => (
    <Handle column={column} columns={columns} onResize={onResize} />
  );
  return (
    <div
      className="column-head"
      style={{ marginLeft: git.graphWidth + 8, width: git.rowWidth, ...columnVars(columns) }}
    >
      <span className="column-name">Time{handle("time")}</span>
      <span className="column-name">#</span>
      <span className="column-name">Message{handle("title")}</span>
      <span className="column-name">Commits · changes{handle("details")}</span>
    </div>
  );
}
