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

/** A compact stamp for dense rows ("10-24 00:10"); unparseable values pass through. */
export function formatStamp(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The local calendar day of a timestamp, for "same day as the row above"; null if unparseable. */
export function dayOf(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toDateString();
}

/** Only the time (`14:05`); the row's date is already shown above it. */
export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Phases are shown as topics, messages as what the user said. */
export function kindLabel(kind: string): string {
  return kind === "phase" ? "topic" : kind === "message" ? "you" : kind;
}
