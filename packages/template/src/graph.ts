import type { LineageViewModel, ViewNode, ViewSession } from "../../cli/src/view/model.js";

/**
 * Small helpers the map's UI shares: the "left off here" session, node labels,
 * and the panel's node detail. The layout lives in `gitLayout.ts` (both levels)
 * and `sessionLayout.ts` (the project's sessions).
 */

/** Everything the drill-down panel shows about a message. */
export type NodeDetail = {
  kind: ViewNode["kind"];
  title: string;
  summary?: string;
  why?: string;
  at?: string;
  decidedBy?: ViewNode["decidedBy"];
  alternatives?: ViewNode["alternatives"];
  commits?: string[];
  commitTags?: ViewNode["commitTags"];
  files?: string[];
  work?: ViewNode["work"];
  agentDecisions?: ViewNode["agentDecisions"];
  addedAt?: string;
  touchedAt?: string;
  parent?: string | null;
  links?: string[];
  /** A user message the record does not hold yet. */
  unsummarized?: true;
  /** Owning session, so the drill-down panel can show and resume it. */
  sessionId: string;
  /** The node's id in its session, which for a message is also its chat turn's id. */
  nodeId: string;
};

export function toNodeDetail(node: ViewNode, sessionId: string): NodeDetail {
  return { ...node, sessionId, nodeId: node.id };
}

/** Where the work left off: the newest message of the most recently updated session. */
export interface Head {
  sessionId: string;
  messageId: string | null;
}

function time(value: string): number {
  const at = Date.parse(value);
  return Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at;
}

function latestSession(model: LineageViewModel): ViewSession | undefined {
  const all = [...model.epochs.flatMap((epoch) => epoch.sessions), ...model.unassigned];
  return all.sort(
    (a, b) => time(b.updatedAt) - time(a.updatedAt) || a.sessionId.localeCompare(b.sessionId),
  )[0];
}

/**
 * "Left off here": the newest message the user sent, in whichever session it
 * is — not the most recently updated record, since fixing an old session's
 * record must not move HEAD there. Sessions whose messages carry no time fall
 * back to the most recently updated session and its last message.
 */
export function headOf(model: LineageViewModel): Head | null {
  let best: { sessionId: string; messageId: string; at: number } | null = null;
  for (const session of [...model.epochs.flatMap((epoch) => epoch.sessions), ...model.unassigned]) {
    for (const message of session.messages) {
      const at = time(message.at ?? "");
      if (at === Number.NEGATIVE_INFINITY) continue;
      if (best === null || at > best.at)
        best = { sessionId: session.sessionId, messageId: message.id, at };
    }
  }
  if (best !== null) return { sessionId: best.sessionId, messageId: best.messageId };
  const latest = latestSession(model);
  if (!latest) return null;
  return {
    sessionId: latest.sessionId,
    messageId: latest.messages[latest.messages.length - 1]?.id ?? null,
  };
}

/** The highlight key of a session in the outline and the map. */
export function sessionId(id: string): string {
  return `session:${id}`;
}

/** A stable message id (Story 8.5): `h` plus 12 hex. Older records stay `m1`. */
export function isMessageHash(id: string): boolean {
  return /^h[0-9a-f]{12}$/.test(id);
}

/** `h3f2a1b8`: what the panel shows and `codelineage show` accepts. */
export function shortHash(id: string): string {
  return isMessageHash(id) ? id.slice(0, 8) : id;
}

/** Outline group key of an epoch; epochs are only tags on the map now. */
export function epochId(id: string): string {
  return `epoch:${id}`;
}

/** Outline group key for sessions with no epoch (or an unknown one). */
export const UNASSIGNED_EPOCH_ID = "unassigned";

/**
 * Node ids are flat per session: the outline and the map agree on the same id
 * when the outline highlights a message.
 */
export function nodeId(sessionGroup: string, id: string): string {
  return `node:${sessionGroup}:${id}`;
}

/** The messages just before and after a message in its session, by send order. */
export function messageNeighbors(
  messages: ViewNode[],
  id: string,
): { previous: ViewNode | null; next: ViewNode | null } {
  const index = messages.findIndex((message) => message.id === id);
  if (index < 0) return { previous: null, next: null };
  return { previous: messages[index - 1] ?? null, next: messages[index + 1] ?? null };
}
