import { parseMessageRef } from "./common.js";
import {
  type LineageNode,
  type LineageNodeInput,
  MESSAGE_ID,
  SESSION_SCHEMA,
  type Session,
  type SessionInput,
} from "./session.js";

export interface MergeResult {
  session: Session;
  warnings: string[];
}

export interface MergeOptions {
  /**
   * Position in send order of every message the session knows, by its stable id
   * (`h…`). Without it, `m1`, `m2`, … define the order, as before 8.5.
   */
  order?: ReadonlyMap<string, number>;
  /** Stable id → display label, for warnings the agent reads. */
  labels?: ReadonlyMap<string, string>;
  /**
   * Cross-session references (`<sessionId>:<id>`) that were checked against the
   * project's records: the other session exists, holds that message, and started
   * earlier (Story 8.6). Anything else is refused like an unknown parent.
   */
  crossTargets?: ReadonlySet<string>;
  /** Who is writing (Story 12.1): the main agent (default) or the side model. */
  by?: "agent" | "side";
  /**
   * Messages whose latest parent event was written by the side model (Story
   * 12.1). The side model may correct only those parents, so an agent's
   * correction is never undone by a later side run.
   */
  sideOwnsParent?: ReadonlySet<string>;
  /**
   * The user asked for this Shape (the map's Regenerate button), so a side
   * write replaces `shape` even when the agent wrote it. Every other field
   * keeps the usual rule.
   */
  forceShape?: boolean;
}

/**
 * The fields the side model may fill (Story 12.1). Structure (parent, links) is
 * handled separately because an agent correction must survive the next side run.
 */
const SIDE_FIELDS = [
  "title",
  "summary",
  "why",
  "decidedBy",
  "alternatives",
  "commits",
  "files",
  "branch",
  "work",
  "agentDecisions",
  "shape",
] as const;

type SideField = (typeof SIDE_FIELDS)[number];

/** A field the side model may fill: missing, empty text or an empty list. */
function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * Merges one side-model node into the stored one: a field is written only when
 * empty or already the side model's, so the agent's notes are never overwritten.
 */
function mergeSide(prev: LineageNode, input: LineageNodeInput, forceShape = false): LineageNode {
  const next: LineageNode = { ...prev };
  const marks: Record<string, "side"> = {};
  for (const field of SIDE_FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    const forced = forceShape && field === "shape";
    if (!forced && !isEmptyValue(prev[field]) && prev.by?.[field] !== "side") continue;
    (next as unknown as Record<SideField, unknown>)[field] = value;
    marks[field] = "side";
  }
  return Object.keys(marks).length === 0 ? prev : { ...next, by: { ...(prev.by ?? {}), ...marks } };
}

/** The agent wrote these fields now, so the side model may no longer replace them. */
function agentMarks(prev: LineageNode | undefined, input: LineageNodeInput): LineageNode["by"] {
  const marks = { ...(prev?.by ?? {}) };
  for (const field of SIDE_FIELDS) if (input[field] !== undefined) delete marks[field];
  return Object.keys(marks).length > 0 ? marks : undefined;
}

/** A new node from the side model: every field it sent is its own to correct. */
function sideMarks(input: LineageNodeInput): LineageNode["by"] {
  const marks: Record<string, "side"> = {};
  for (const field of SIDE_FIELDS) if (input[field] !== undefined) marks[field] = "side";
  return Object.keys(marks).length > 0 ? marks : undefined;
}

/**
 * Merges agent input into the stored session. Nodes are upserted by id and never
 * removed; status is replaced when sent; other fields change only when sent.
 */
export function mergeSession(
  existing: Session | undefined,
  input: SessionInput,
  now: string,
  opts: MergeOptions = {},
): MergeResult {
  if (existing && existing.sessionId !== input.sessionId) {
    throw new Error(`session id mismatch: ${existing.sessionId} vs ${input.sessionId}`);
  }
  const base: Session = existing ?? {
    schema: SESSION_SCHEMA,
    sessionId: input.sessionId,
    agent: "claude-code",
    title: "",
    startedAt: now,
    updatedAt: now,
    status: { goal: "", done: [], pending: [], next: "" },
    nodes: [],
  };

  const nodes = new Map<string, LineageNode>(base.nodes.map((n) => [n.id, n]));
  /**
   * Send-order position of every message the record holds or this write adds.
   * The table (stable ids) decides it; without one, `m1`, `m2`, … still do. A
   * parent must be one of these, so a message that has no node cannot be one.
   */
  const recorded = new Map<string, number>();
  for (const n of [...base.nodes, ...(input.nodes ?? [])]) {
    if (n.kind !== "message") continue;
    const fromTable = opts.order?.get(n.id);
    const number = messageNumber(n);
    const position = fromTable ?? (number === null ? null : number - 1);
    if (position !== null) recorded.set(n.id, position);
  }
  const label = (id: string): string => opts.labels?.get(id) ?? id;
  const messageWarnings: string[] = [];
  const side = opts.by === "side";
  for (const { parent, links, ...n } of input.nodes ?? []) {
    const prev = nodes.get(n.id);
    const own = n.kind === "message" ? (recorded.get(n.id) ?? null) : null;
    if (side && prev) {
      // The side model fills notes but never rewrites the agent's: it may only
      // correct a parent it wrote itself (Story 12.1).
      const merged = mergeSide(prev, n, opts.forceShape === true);
      const nextParent =
        parent !== undefined && own !== null && (opts.sideOwnsParent?.has(n.id) ?? false)
          ? checkParent(n.id, parent, own, recorded, messageWarnings, label, opts.crossTargets)
          : (prev.parent ?? null);
      const next: LineageNode = { ...merged, parent: nextParent };
      nodes.set(n.id, {
        ...next,
        addedAt: prev.addedAt,
        touchedAt: sameNode(prev, next) ? prev.touchedAt : now,
      });
      continue;
    }
    const nextParent =
      parent !== undefined && own !== null
        ? checkParent(n.id, parent, own, recorded, messageWarnings, label, opts.crossTargets)
        : parent === undefined
          ? (prev?.parent ?? null)
          : parent;
    const nextLinks =
      links !== undefined && own !== null
        ? checkLinks(n.id, links, own, recorded, messageWarnings, label, opts.crossTargets)
        : links;
    const next: LineageNode = {
      ...prev,
      ...n,
      parent: nextParent,
      ...(nextLinks === undefined ? {} : { links: nextLinks }),
    };
    const marks = side ? sideMarks(n) : agentMarks(prev, n);
    // Nodes recorded before these stamps existed keep no addedAt: their order stays as stored.
    const addedAt = prev ? prev.addedAt : now;
    nodes.set(n.id, {
      ...next,
      // An explicit undefined clears a previous side mark: the agent owns it now.
      by: marks,
      ...(addedAt === undefined ? {} : { addedAt }),
      touchedAt: prev && sameNode(prev, next) ? prev.touchedAt : now,
    });
  }

  const merged: Session = {
    ...base,
    agent: input.agent ?? base.agent,
    title: input.title ?? base.title,
    status: input.status ?? base.status,
    ...(input.leftOff === undefined && base.leftOff === undefined
      ? {}
      : { leftOff: input.leftOff ?? base.leftOff }),
    nodes: [...nodes.values()],
    updatedAt: now,
  };
  const warnings = [...messageWarnings, ...repairTree(merged.nodes)];
  return { session: merged, warnings };
}

/** The number in a message node's id (`m7` → 7), or null for any other node. */
function messageNumber(node: { id: string; kind: string }): number | null {
  if (node.kind !== "message" || !MESSAGE_ID.test(node.id)) return null;
  return Number(node.id.slice(1));
}

function isEarlierMessage(numbers: Map<string, number>, id: string, own: number): boolean {
  const number = numbers.get(id);
  return number !== undefined && number < own;
}

/** The recorded message just before `own` by position, or null when there is none. */
function previousMessage(numbers: Map<string, number>, own: number): string | null {
  let best: string | null = null;
  let bestNumber = -1;
  for (const [id, number] of numbers) {
    if (number < own && number > bestNumber) {
      best = id;
      bestNumber = number;
    }
  }
  return best;
}

/**
 * A message's parent is the earlier message it reacts to; anything else (a
 * forward reference, a self-parent, a removed message id) falls back to the
 * previous message so the chain stays in time order. Old records whose message
 * parents are phase ids are left alone: this only checks what the agent sends now.
 */
function checkParent(
  id: string,
  parent: string | null,
  own: number,
  numbers: Map<string, number>,
  warnings: string[],
  label: (id: string) => string,
  crossTargets: ReadonlySet<string> | undefined,
): string | null {
  if (parent === null || isEarlierMessage(numbers, parent, own)) return parent;
  if (isCrossTarget(parent, crossTargets)) return parent;
  const fallback = previousMessage(numbers, own);
  const cross = parseMessageRef(parent).sessionId !== null;
  warnings.push(
    fallback === null
      ? `message ${label(id)}: parent ${label(parent)} is not ${cross ? "a message of an earlier session in this project" : "an earlier message of this session"}, moved to root`
      : `message ${label(id)}: parent ${label(parent)} is not ${cross ? "a message of an earlier session in this project" : "an earlier message of this session"}, using ${label(fallback)}`,
  );
  return fallback;
}

/** A `<sessionId>:<id>` reference that was checked against the other record. */
function isCrossTarget(ref: string, crossTargets: ReadonlySet<string> | undefined): boolean {
  return parseMessageRef(ref).sessionId !== null && (crossTargets?.has(ref) ?? false);
}

/** Links point at earlier messages too; a forward or unknown one is dropped. */
function checkLinks(
  id: string,
  links: string[],
  own: number,
  numbers: Map<string, number>,
  warnings: string[],
  label: (id: string) => string,
  crossTargets: ReadonlySet<string> | undefined,
): string[] {
  return links.filter((link) => {
    if (isEarlierMessage(numbers, link, own) || isCrossTarget(link, crossTargets)) return true;
    const cross = parseMessageRef(link).sessionId !== null;
    warnings.push(
      `message ${label(id)}: link ${label(link)} is not ${cross ? "a message of an earlier session in this project" : "an earlier message of this session"}, dropped`,
    );
    return false;
  });
}

const NODE_FIELDS = [
  "parent",
  "kind",
  "title",
  "summary",
  "why",
  "at",
  "decidedBy",
  "alternatives",
  "commits",
  "files",
  "links",
  "branch",
  "work",
  "agentDecisions",
  "shape",
] as const;

/** A resent node that changed nothing keeps its touch time. */
function sameNode(a: LineageNode, b: LineageNode): boolean {
  return NODE_FIELDS.every((field) => JSON.stringify(a[field]) === JSON.stringify(b[field]));
}

/**
 * Re-roots nodes whose parent is missing or that sit on a cycle. Mutates in
 * place. A `<sessionId>:<id>` parent (Story 8.6) belongs to another session's
 * graph, so it is not looked up here and never re-rooted.
 */
export function repairTree(nodes: LineageNode[]): string[] {
  const warnings: string[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    if (n.parent !== null && parseMessageRef(n.parent).sessionId === null && !byId.has(n.parent)) {
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
