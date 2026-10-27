import type { CommitChange } from "../git.js";
import type { ViewChange } from "./model.js";

/**
 * How much code landed after a message (Story 10.3), deterministic and pure:
 * the commits linked to the message — the `Thought:` trailer union with the
 * commits the record lists — and git's numstat totals for them. Cogit never
 * reads the message text, so a long sentence and "go on" are treated alike.
 * The numbers are facts for the reader to judge; nothing here calls them risky.
 */

/** The subset of a record/view node this module needs; both shapes fit. */
export interface ChangeNode {
  id: string;
  kind: string;
  title: string;
  label?: string | undefined;
  at?: string | undefined;
  commits?: string[] | undefined;
  change?: ViewChange | undefined;
}

export interface ChangeSession {
  sessionId: string;
  title: string;
  startedAt: string;
  nodes: readonly ChangeNode[];
}

/**
 * One message's totals: the union of its linked commits, each commit counted
 * once (its full hash decides), files deduped across commits. Undefined when no
 * linked commit resolves in git — the map then shows nothing, not "0".
 */
export function messageChange(
  commits: readonly string[] | undefined,
  changes: ReadonlyMap<string, CommitChange>,
): ViewChange | undefined {
  if (commits === undefined || commits.length === 0) return undefined;
  const seen = new Set<string>();
  const files = new Set<string>();
  let added = 0;
  let removed = 0;
  for (const hash of commits) {
    const change = changes.get(hash);
    if (change === undefined || seen.has(change.full)) continue;
    seen.add(change.full);
    added += change.added;
    removed += change.removed;
    for (const file of change.files) files.add(file);
  }
  if (seen.size === 0) return undefined;
  return { added, removed, files: files.size };
}

/** The record with a `change` on every message whose commits git resolves. */
export function attachChanges<N extends ChangeNode, S extends { nodes: readonly N[] }>(
  sessions: readonly S[],
  changes: ReadonlyMap<string, CommitChange>,
): S[] {
  if (changes.size === 0) return sessions.map((session) => session);
  return sessions.map((session) => {
    let changed = false;
    const nodes = session.nodes.map((node) => {
      if (node.kind !== "message") return node;
      const change = messageChange(node.commits, changes);
      if (change === undefined) {
        if (node.change === undefined) return node;
        changed = true;
        const { change: _dropped, ...rest } = node;
        return rest as N;
      }
      changed = true;
      return { ...node, change } as N;
    });
    return (changed ? { ...session, nodes } : session) as S;
  });
}

/** One unread message with code behind it, as the map view and `log --unread` list it. */
export interface UnreadMessage {
  sessionId: string;
  sessionTitle: string;
  sessionStartedAt: string;
  messageId: string;
  label: string;
  title: string;
  at?: string | undefined;
  change: ViewChange;
}

/** Total lines a change touched; the sort key ("most code first"). */
export function changeLines(change: ViewChange): number {
  return change.added + change.removed;
}

/** True for a message the user has not read whose code crossed the threshold. */
export function isBigChange(change: ViewChange, threshold: number): boolean {
  return changeLines(change) >= threshold;
}

/** Messages with commits that are not marked read, most code first. */
export function unreadMessages(
  sessions: readonly ChangeSession[],
  read: ReadonlySet<string>,
): UnreadMessage[] {
  const out: UnreadMessage[] = [];
  for (const session of sessions) {
    for (const node of session.nodes) {
      if (node.kind !== "message" || node.change === undefined) continue;
      if (read.has(node.id)) continue;
      out.push({
        sessionId: session.sessionId,
        sessionTitle: session.title,
        sessionStartedAt: session.startedAt,
        messageId: node.id,
        label: node.label ?? node.id,
        title: node.title,
        ...(node.at === undefined ? {} : { at: node.at }),
        change: node.change,
      });
    }
  }
  return out.sort(
    (a, b) =>
      changeLines(b.change) - changeLines(a.change) ||
      b.change.files - a.change.files ||
      a.title.localeCompare(b.title) ||
      a.messageId.localeCompare(b.messageId),
  );
}

/** The page's shape: `ViewSession` carries `messages` rather than `nodes`. */
export interface ViewChangeSession {
  sessionId: string;
  title: string;
  startedAt: string;
  messages: readonly ChangeNode[];
}

/** `unreadMessages` over the page model, which names its nodes `messages`. */
export function unreadViewMessages(
  sessions: readonly ViewChangeSession[],
  read: ReadonlySet<string>,
): UnreadMessage[] {
  return unreadMessages(
    sessions.map((session) => ({ ...session, nodes: session.messages })),
    read,
  );
}

/** How many unread messages crossed the threshold (the panel card's number). */
export function countBigUnread(
  sessions: readonly ChangeSession[],
  read: ReadonlySet<string>,
  threshold: number,
): number {
  return unreadMessages(sessions, read).filter((message) => isBigChange(message.change, threshold))
    .length;
}

/** `1240` → `1 240`: thousands separated by a thin space, no locale dependency. */
export function grouped(value: number): string {
  return String(Math.max(0, Math.trunc(value))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** `+1 240 −80 · 14 files` — the chip on a row and the CLI line's numbers. */
export function formatChange(change: ViewChange): string {
  const files = `${change.files} file${change.files === 1 ? "" : "s"}`;
  return `+${grouped(change.added)} −${grouped(change.removed)} · ${files}`;
}
