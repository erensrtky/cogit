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

const DECIDED_BY = { user: "you decided", agent: "agent decided", agreed: "agreed" } as const;

/** Who decided, and what more the drill-down holds; empty when there is nothing to say. */
export function cardMeta(node: {
  decidedBy?: keyof typeof DECIDED_BY | undefined;
  commits?: string[] | undefined;
  alternatives?: unknown[] | undefined;
}): string {
  const parts: string[] = [];
  if (node.decidedBy) parts.push(DECIDED_BY[node.decidedBy]);
  const commits = node.commits?.length ?? 0;
  if (commits > 0) parts.push(`${commits} commit${commits === 1 ? "" : "s"}`);
  const rejected = node.alternatives?.length ?? 0;
  if (rejected > 0) parts.push(`${rejected} option${rejected === 1 ? "" : "s"} rejected`);
  return parts.join(" · ");
}

/** A card's second line: for decisions the reason, otherwise the summary. */
export function cardText(node: {
  kind: string;
  summary?: string | undefined;
  why?: string | undefined;
}) {
  return node.kind === "decision" && node.why ? node.why : node.summary;
}
