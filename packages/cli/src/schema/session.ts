import { z } from "zod";
import { IsoDate, MessageRef, Slug } from "./common.js";

export const SESSION_SCHEMA = 1;

/**
 * `message` is one user message, numbered from the transcript (`m1`, `m2`, …);
 * `phase` is a topic. `step`, `decision` and `question` are the agent's own
 * items from records written before messages became the nodes.
 */
export const NodeKind = z.enum(["phase", "message", "step", "decision", "question"]);
export type NodeKind = z.infer<typeof NodeKind>;

/** Who made a decision: the user, the agent alone, or the user approving the agent's proposal. */
export const DecidedBy = z.enum(["user", "agent", "agreed"]);

/** An option that was considered and not taken, with the reason. */
export const Alternative = z.object({
  option: z.string().min(1).max(200),
  why: z.string().max(500).default(""),
});

/** A choice the agent made on its own while working on a message. */
export const AgentDecision = z.object({
  title: z.string().min(1).max(200),
  why: z.string().max(500).default(""),
  alternatives: z.array(Alternative).max(10).optional(),
});

/** Message node ids follow the order of the user's messages in the transcript. */
export const MESSAGE_ID = /^m[1-9][0-9]*$/;

/**
 * The summary a branch carries on its first message: what the thread asked,
 * what came of it and what is still open.
 */
export const BranchSummary = z.object({
  title: z.string().min(1).max(80),
  asked: z.string().min(1).max(300),
  outcome: z.string().min(1).max(600),
  /** May be empty: a thread can leave nothing open. */
  open: z.string().max(300).default(""),
});

export const LineageNode = z.object({
  id: Slug,
  /**
   * For a message: the id of the earlier message it reacts to (`m3` for `m7`),
   * `<sessionId>:<id>` for a message of an earlier session (Story 8.6), or null
   * for a new root. For other kinds: the node it belongs to.
   */
  parent: MessageRef.nullable().default(null),
  kind: NodeKind,
  title: z.string().min(1).max(200),
  summary: z.string().max(2000).optional(),
  why: z.string().max(2000).optional(),
  at: IsoDate.optional(),
  decidedBy: DecidedBy.optional(),
  /** Options considered and rejected, mostly for decisions. */
  alternatives: z.array(Alternative).max(10).optional(),
  /** Commits that carry this work out, as short or full hashes. */
  commits: z
    .array(z.string().regex(/^[0-9a-f]{7,40}$/, "a commit hash"))
    .max(20)
    .optional(),
  /** Files this work touched, relative to the project. */
  files: z.array(z.string().min(1).max(300)).max(30).optional(),
  /** For a message: earlier messages it returns to or builds on besides its parent. */
  links: z.array(MessageRef).max(5).optional(),
  /** For the first message of a branch: the summary of that thread. */
  branch: BranchSummary.optional(),
  /** For a message: what the agent did about it, in short items. */
  work: z.array(z.string().min(1).max(300)).max(20).optional(),
  /** For a message: choices the agent made on its own along the way. */
  agentDecisions: z.array(AgentDecision).max(10).optional(),
  /**
   * Who wrote each optional field (Story 12.1): the main agent or the side
   * model. A missing entry means the agent (every record written before the
   * split was the agent's). The merge lets the side model fill a field only
   * when it is empty or already the side model's own.
   */
  by: z.record(z.string().max(40), z.enum(["agent", "side"])).optional(),
  /** When `session write` first added this node; set by the CLI, never by the agent. */
  addedAt: IsoDate.optional(),
  /** When `session write` last added or changed this node; set by the CLI, never by the agent. */
  touchedAt: IsoDate.optional(),
  /**
   * Numstat totals of the node's commits, attached at read time from git
   * (Story 10.3). Never stored in the record: it is derived, so the record
   * stays small and the numbers stay current after a rebase.
   */
  change: z
    .object({
      added: z.number().int().min(0),
      removed: z.number().int().min(0),
      files: z.number().int().min(0),
    })
    .optional(),
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
  startedAt: IsoDate,
  updatedAt: IsoDate,
  status: Status.default({ goal: "", done: [], pending: [], next: "" }),
  /**
   * One line on where the session left off (L0), so a later session can tell
   * whether it continues this one without reading the branches. Written by the
   * session-end pass; old records have none.
   */
  leftOff: z.string().max(400).optional(),
  nodes: z.array(LineageNode).default([]),
  /** The linked git worktree the session ran in; set by the CLI, never by the agent. */
  worktree: z.object({ path: z.string().min(1), branch: z.string().min(1).nullable() }).optional(),
  /**
   * Who recorded the session (git `user.name`, else the OS user); set by the CLI
   * on the first write (Story 9.3). Old records have none.
   */
  author: z.string().min(1).max(200).optional(),
  /**
   * The recorder's git `user.email`, stamped with `author`: like git, a person is
   * told apart by email, so two people with one name stay two and a renamed
   * one stays one. Records from before it have none.
   */
  authorEmail: z.string().min(3).max(320).optional(),
  /**
   * Who wrote the record last (Story 12.1): the Stop hook counts the main
   * agent's turns separately when the side model keeps writing in between.
   */
  lastRecordedBy: z.enum(["agent", "side"]).optional(),
});

/** In input, a missing parent keeps the stored one (null for a new node). */
export const LineageNodeInput = LineageNode.omit({
  addedAt: true,
  touchedAt: true,
  change: true,
  by: true,
}).extend({
  parent: MessageRef.nullable().optional(),
});

/**
 * What the agent sends to `session write`. Everything but the id is optional;
 * the CLI owns `schema`, `startedAt` and `updatedAt`. An `epoch` from an older
 * skill is dropped with the other unknown keys: epochs are gone.
 */
export const SessionInput = z.object({
  sessionId: Slug,
  agent: z.string().min(1).max(64).optional(),
  title: z.string().max(200).optional(),
  status: Status.optional(),
  leftOff: z.string().max(400).optional(),
  nodes: z.array(LineageNodeInput).optional(),
});

export type LineageNode = z.infer<typeof LineageNode>;
export type LineageNodeInput = z.infer<typeof LineageNodeInput>;
export type BranchSummary = z.infer<typeof BranchSummary>;
export type AgentDecision = z.infer<typeof AgentDecision>;
export type Status = z.infer<typeof Status>;
export type Session = z.infer<typeof Session>;
export type SessionInput = z.infer<typeof SessionInput>;

/** JSON Schema of the agent input, embedded in the /lineage skill. */
export function sessionInputJsonSchema(): object {
  return z.toJSONSchema(SessionInput, { io: "input" });
}
