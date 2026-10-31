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

/** Total lines a change touched; the sort key ("most code first"). */
export function changeLines(change: ViewChange): number {
  return change.added + change.removed;
}

/** True for a change whose linked commits crossed the threshold. */
export function isBigChange(change: ViewChange, threshold: number): boolean {
  return changeLines(change) >= threshold;
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
