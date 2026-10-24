import type { LineageViewModel, ViewSession } from "../../cli/src/view/model.js";
import { type GitLayout, type GitNode, layoutGitGraph } from "./gitLayout.js";
import { headOf } from "./graph.js";

/**
 * The project map's top level (Story 8.7): each session is one dot on a git
 * graph, laid out by the same engine as a session's messages. A session's
 * parent is the session its first message continues (8.6), so a new chat that
 * picks up earlier work grows out of that earlier session; everything else is a
 * root. Epochs are not boxes any more, just tags on the dots.
 */

/** Wider than a message row: a session row carries a title, a count and a tag. */
export const SESSION_ROW_WIDTH = 720;

function time(value: string | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const at = Date.parse(value);
  return Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at;
}

/** The session a session hangs from: the one its first message continues. */
export function sessionParentOf(session: ViewSession, known: ReadonlySet<string>): string | null {
  const other = session.messages[0]?.continues?.sessionId;
  if (other === undefined || other === session.sessionId) return null;
  return known.has(other) ? other : null;
}

/** Every session of the map in start order, across epochs and unassigned. */
export function allSessions(model: LineageViewModel): ViewSession[] {
  const all = [...model.epochs.flatMap((epoch) => epoch.sessions), ...model.unassigned];
  return all.sort(
    (a, b) => time(a.startedAt) - time(b.startedAt) || a.sessionId.localeCompare(b.sessionId),
  );
}

export interface SessionGraph {
  /** Geometry of the session dots, lanes and rows. */
  git: GitLayout;
  sessions: Map<string, ViewSession>;
  /** The session each session hangs from; null for a root. */
  parents: Map<string, string | null>;
}

/**
 * Lays the sessions out as a git graph. A session occupies its lane from the
 * row it starts on until `updatedAt`, so two sessions that run at the same time
 * get parallel lanes even when their rows are not adjacent. Long chains never
 * fold: every session must stay visible.
 */
export function layoutSessionGraph(model: LineageViewModel): SessionGraph {
  const sessions = allSessions(model);
  const byId = new Map(sessions.map((session) => [session.sessionId, session]));
  const known = new Set(byId.keys());
  const parents = new Map<string, string | null>();
  const items: GitNode[] = sessions.map((session) => {
    const parent = sessionParentOf(session, known);
    parents.set(session.sessionId, parent);
    return {
      id: session.sessionId,
      title: session.title || session.sessionId,
      at: session.startedAt,
      until: session.updatedAt,
      parent,
    };
  });

  const starts = sessions.map((session) => time(session.startedAt));
  /** How many sessions had started by the time this one stopped running. */
  const endIndex = (item: GitNode): number | null => {
    const until = time(item.until);
    if (until === Number.NEGATIVE_INFINITY) return null;
    let end = 0;
    for (let at = 0; at < starts.length; at += 1) {
      if ((starts[at] ?? Number.NEGATIVE_INFINITY) <= until) end = at + 1;
    }
    return end;
  };

  const git = layoutGitGraph(items, {
    fold: false,
    rowWidth: SESSION_ROW_WIDTH,
    headId: headOf(model)?.sessionId ?? null,
    itemEnd: endIndex,
  });
  return { git, sessions: byId, parents };
}
