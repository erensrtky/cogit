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

export function headOf(model: LineageViewModel): Head | null {
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
