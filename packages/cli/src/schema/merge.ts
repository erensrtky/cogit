import { type LineageNode, SESSION_SCHEMA, type Session, type SessionInput } from "./session.js";

export interface MergeResult {
  session: Session;
  warnings: string[];
}

/**
 * Merges agent input into the stored session. Nodes are upserted by id and never
 * removed; status is replaced when sent; other fields change only when sent.
 */
export function mergeSession(
  existing: Session | undefined,
  input: SessionInput,
  now: string,
): MergeResult {
  if (existing && existing.sessionId !== input.sessionId) {
    throw new Error(`session id mismatch: ${existing.sessionId} vs ${input.sessionId}`);
  }
  const base: Session = existing ?? {
    schema: SESSION_SCHEMA,
    sessionId: input.sessionId,
    agent: "claude-code",
    title: "",
    epoch: null,
    startedAt: now,
    updatedAt: now,
    status: { goal: "", done: [], pending: [], next: "" },
    nodes: [],
  };

  const nodes = new Map<string, LineageNode>(base.nodes.map((n) => [n.id, n]));
  for (const { parent, ...n } of input.nodes ?? []) {
    const prev = nodes.get(n.id);
    const next: LineageNode = {
      ...prev,
      ...n,
      parent: parent === undefined ? (prev?.parent ?? null) : parent,
    };
    // Nodes recorded before these stamps existed keep no addedAt: their order stays as stored.
    const addedAt = prev ? prev.addedAt : now;
    nodes.set(n.id, {
      ...next,
      ...(addedAt === undefined ? {} : { addedAt }),
      touchedAt: prev && sameNode(prev, next) ? prev.touchedAt : now,
    });
  }

  const merged: Session = {
    ...base,
    agent: input.agent ?? base.agent,
    title: input.title ?? base.title,
    epoch: input.epoch === undefined ? base.epoch : input.epoch,
    status: input.status ?? base.status,
    nodes: [...nodes.values()],
    updatedAt: now,
  };
  const warnings = repairTree(merged.nodes);
  return { session: merged, warnings };
}

const NODE_FIELDS = ["parent", "kind", "title", "summary", "why", "at"] as const;

/** A resent node that changed nothing keeps its touch time. */
function sameNode(a: LineageNode, b: LineageNode): boolean {
  return NODE_FIELDS.every((field) => a[field] === b[field]);
}

/** Re-roots nodes whose parent is missing or that sit on a cycle. Mutates in place. */
export function repairTree(nodes: LineageNode[]): string[] {
  const warnings: string[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    if (n.parent !== null && !byId.has(n.parent)) {
      warnings.push(`node ${n.id}: parent ${n.parent} not found, moved to root`);
      n.parent = null;
    }
  }
  for (const n of nodes) {
    const seen = new Set<string>([n.id]);
    let cur = n.parent;
    while (cur !== null) {
      if (seen.has(cur)) {
        warnings.push(`node ${n.id}: parent cycle, moved to root`);
        n.parent = null;
        break;
      }
      seen.add(cur);
      cur = byId.get(cur)?.parent ?? null;
    }
  }
  return warnings;
}
