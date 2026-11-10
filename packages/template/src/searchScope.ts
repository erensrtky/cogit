import type { LineageViewModel } from "../../cli/src/view/model.js";
import type { SearchHit } from "../../cli/src/view/search.js";
import { layoutGitGraph } from "./gitLayout.js";

/**
 * Narrowing the map search to what is open: the whole project, the open
 * session, or the branch the open message sits in. Finding the session first
 * and then the one place in it is often quicker than one search over all.
 */
export type SearchScope = "all" | "session" | "branch";

/** What the map has open: a session, or a message in it. */
export interface ScopeAnchor {
  sessionId: string;
  /** The open message; null when only the session is open. */
  nodeId: string | null;
}

/** The messages of the branch `nodeId` sits in, as the git view draws it; null when it has none. */
export function branchOf(
  model: LineageViewModel,
  anchor: ScopeAnchor,
): { ids: ReadonlySet<string>; title: string } | null {
  if (anchor.nodeId === null) return null;
  const session = model.sessions.find((candidate) => candidate.sessionId === anchor.sessionId);
  if (session === undefined) return null;
  const segment = layoutGitGraph(session.messages).segments.find((candidate) =>
    candidate.ids.includes(anchor.nodeId as string),
  );
  return segment === undefined ? null : { ids: new Set(segment.ids), title: segment.branch.title };
}

/** The hits inside the scope; with no anchor every scope is the whole project. */
export function scopeHits(
  hits: readonly SearchHit[],
  scope: SearchScope,
  anchor: ScopeAnchor | null,
  branch: { ids: ReadonlySet<string> } | null,
): SearchHit[] {
  if (scope === "all" || anchor === null) return [...hits];
  const inSession = hits.filter((hit) => hit.sessionId === anchor.sessionId);
  if (scope === "session" || branch === null) return inSession;
  return inSession.filter((hit) => hit.messageId !== null && branch.ids.has(hit.messageId));
}
