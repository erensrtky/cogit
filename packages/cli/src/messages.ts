import { createHash } from "node:crypto";
import type { LineageNode, Session } from "./schema/session.js";
import { readConversationStore } from "./store/conversations.js";
import { type ChatTurn, findTranscript, readConversation } from "./transcript.js";

/**
 * A user message's stable id: `h` plus the first 12 hex of the SHA-256 over the
 * canonical JSON of the message. The parent is NOT part of it, so correcting a
 * parent never changes an id (unlike git, on purpose: the id names the message,
 * not its place in the graph).
 */
export const MESSAGE_HASH = /^h[0-9a-f]{12}$/;

/** The exact bytes hashed; fixed key order and no whitespace, so any machine agrees. */
export function canonicalMessage(
  sessionId: string,
  message: { uuid?: string; at: string; text: string },
): string {
  return JSON.stringify({
    sessionId,
    uuid: message.uuid ?? "",
    at: message.at,
    text: message.text,
  });
}

/** The stable id of one user message of a session. */
export function messageHash(
  sessionId: string,
  message: { uuid?: string; at: string; text: string },
): string {
  return `h${createHash("sha256").update(canonicalMessage(sessionId, message)).digest("hex").slice(0, 12)}`;
}

/** The display label of the message at a position: `m1`, `m2`, … */
export function messageLabel(index: number): string {
  return `m${index + 1}`;
}

/** One user message with both its stable id and the label the user reads. */
export interface SessionMessage extends ChatTurn {
  hash: string;
  label: string;
}

/** Adds the stable id and the display label to transcript turns, in order. */
export function hashTurns(sessionId: string, turns: ChatTurn[]): SessionMessage[] {
  return turns.map((turn, index) => ({
    ...turn,
    label: messageLabel(index),
    hash: messageHash(sessionId, turn),
  }));
}

/**
 * The user's messages of a session, in send order, with their stable id and
 * label. The transcript is authoritative; the project's own conversation store
 * (8.4) stands in once Claude Code has deleted it. Null when neither is readable,
 * which means ids cannot be hashed at all and labels stay the only names.
 */
export async function readSessionMessages(
  root: string,
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SessionMessage[] | null> {
  const file = await findTranscript(sessionId, env);
  if (file) {
    try {
      const turns = await readConversation(file);
      if (turns.length > 0) return hashTurns(sessionId, turns);
      const stored = await readConversationStore(root, sessionId);
      if (stored.length > 0) return storedMessages(sessionId, stored);
      // An empty transcript that parsed is still the truth: the user wrote nothing.
      return [];
    } catch {
      // Fall through to the store.
    }
  }
  const stored = await readConversationStore(root, sessionId);
  return stored.length > 0 ? storedMessages(sessionId, stored) : null;
}

/**
 * Stored turns keep the hash they were written with, so ids survive the
 * transcript. A turn stored before hashes existed falls back to hashing its own
 * fields (the text is the displayed one, so it may differ from the transcript
 * hash; the transcript is gone anyway).
 */
export function storedMessages(
  sessionId: string,
  stored: Awaited<ReturnType<typeof readConversationStore>>,
): SessionMessage[] {
  return stored.map((turn, index) => ({
    id: messageLabel(index),
    label: messageLabel(index),
    hash: turn.hash ?? messageHash(sessionId, turn),
    uuid: turn.uuid,
    at: turn.at,
    text: turn.text,
    replies: turn.replies,
    tools: turn.tools,
  }));
}

/** A message is recorded when either its stable id or its label names a node. */
export function isRecorded(recorded: ReadonlySet<string>, message: SessionMessage): boolean {
  return recorded.has(message.hash) || recorded.has(message.label);
}

/** Position of each message in send order, keyed by stable id. */
export function messageOrder(messages: readonly SessionMessage[] | null): Map<string, number> {
  return new Map((messages ?? []).map((message, index) => [message.hash, index]));
}

/** `m1` → `h…` for every message of the session. */
export function labelsToHashes(messages: readonly SessionMessage[] | null): Map<string, string> {
  return new Map((messages ?? []).map((message) => [message.label, message.hash]));
}

/** `h…` → `m1` for every message of the session, for warnings and display. */
export function hashesToLabels(messages: readonly SessionMessage[] | null): Map<string, string> {
  return new Map((messages ?? []).map((message) => [message.hash, message.label]));
}

/**
 * Renames a record's message nodes from their old `m1` labels to stable ids, and
 * their parents/links with them. Runs on load, so a record written before 8.5
 * renders with stable ids without touching the file; `session write` persists it.
 * A node the message table does not know keeps its id.
 */
export function upgradeSessionIds(session: Session, messages: readonly SessionMessage[]): Session {
  const byLabel = labelsToHashes(messages);
  const rename = (id: string): string => byLabel.get(id) ?? id;
  const byId = new Map<string, LineageNode>();
  /** Ids whose current entry came from a node that was already stable. */
  const stable = new Set<string>();
  for (const node of session.nodes) {
    if (node.kind !== "message") {
      byId.set(node.id, node);
      continue;
    }
    const id = rename(node.id);
    const next: LineageNode = {
      ...node,
      id,
      ...(node.parent === undefined || node.parent === null ? {} : { parent: rename(node.parent) }),
      ...(node.links === undefined ? {} : { links: node.links.map(rename) }),
    };
    if (!byId.has(id)) {
      byId.set(id, next);
      if (node.id === id) stable.add(id);
      continue;
    }
    // A half-upgraded record can hold both the label and the stable id for one
    // message; the node that already carried the stable id wins.
    if (node.id === id && !stable.has(id)) {
      byId.set(id, next);
      stable.add(id);
    }
  }
  return { ...session, nodes: [...byId.values()] };
}
