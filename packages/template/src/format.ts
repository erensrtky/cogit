/** Renders an ISO timestamp for humans; an unparseable value is shown as-is. */
export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/** A compact date for tight headers; the full time belongs in a tooltip. */
export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Phases are shown as topics: the map groups a session by what the work is about. */
export function kindLabel(kind: string): string {
  return kind === "phase" ? "topic" : kind;
}

/** The line a collapsed topic shows in place of its summary. */
export function itemsInside(count: number): string {
  return `${count} item${count === 1 ? "" : "s"} inside`;
}
