import { z } from "zod";
import { IsoDate, Slug } from "./common.js";

export const SESSION_SCHEMA = 1;

export const NodeKind = z.enum(["phase", "step", "decision", "question"]);
export type NodeKind = z.infer<typeof NodeKind>;

export const LineageNode = z.object({
  id: Slug,
  parent: Slug.nullable().default(null),
  kind: NodeKind,
  title: z.string().min(1).max(200),
  summary: z.string().max(2000).optional(),
  why: z.string().max(2000).optional(),
  at: IsoDate.optional(),
});

export const PendingItem = z.object({
  text: z.string().min(1).max(500),
  needsUser: z.boolean().default(false),
});

export const Status = z.object({
  goal: z.string().max(500).default(""),
  done: z.array(z.string().min(1).max(500)).default([]),
  pending: z.array(PendingItem).default([]),
  next: z.string().max(500).default(""),
});

export const Session = z.object({
  schema: z.literal(SESSION_SCHEMA),
  sessionId: Slug,
  agent: z.string().min(1).max(64).default("claude-code"),
  title: z.string().max(200).default(""),
  epoch: Slug.nullable().default(null),
  startedAt: IsoDate,
  updatedAt: IsoDate,
  status: Status.default({ goal: "", done: [], pending: [], next: "" }),
  nodes: z.array(LineageNode).default([]),
});

/** In input, a missing parent keeps the stored one (null for a new node). */
export const LineageNodeInput = LineageNode.extend({ parent: Slug.nullable().optional() });

/**
 * What the agent sends to `session write`. Everything but the id is optional;
 * the CLI owns `schema`, `startedAt` and `updatedAt`.
 */
export const SessionInput = z.object({
  sessionId: Slug,
  agent: z.string().min(1).max(64).optional(),
  title: z.string().max(200).optional(),
  epoch: Slug.nullable().optional(),
  status: Status.optional(),
  nodes: z.array(LineageNodeInput).optional(),
});

export type LineageNode = z.infer<typeof LineageNode>;
export type Status = z.infer<typeof Status>;
export type Session = z.infer<typeof Session>;
export type SessionInput = z.infer<typeof SessionInput>;

/** JSON Schema of the agent input, embedded in the /lineage skill. */
export function sessionInputJsonSchema(): object {
  return z.toJSONSchema(SessionInput, { io: "input" });
}
