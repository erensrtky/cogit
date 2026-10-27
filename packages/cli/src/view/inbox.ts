import type { ViewInboxRow, ViewPendingItem } from "./model.js";

/**
 * The "your turn" inbox (Story 11.1), as pure data work: collection reads
 * transcripts and records, this module decides what a page shows. Kept free of
 * Node imports because the browser template imports it too.
 */

/** How much of the agent's last message a row keeps, verbatim. */
export const INBOX_MESSAGE_LIMIT = 300;

/** How many open pending items a where-were-we line lists. */
export const INBOX_PENDING_LIMIT = 5;

/** One session as the builder found it, before age and dismissal are applied. */
export interface InboxCandidate {
  projectName: string;
  projectPath: string;
  /** `file://` URL of the project's map. */
  mapUrl: string;
  sessionId: string;
  sessionTitle: string;
  /** The agent's last turn, when the transcript ends with it. */
  turn: { at: string; text: string } | null;
  /** The newest time the record knows about, for a record-only row. */
  lastActivity: string | null;
  /** Open pending items flagged `needsUser`. */
  needsUser: string[];
  goal: string;
  lastDecision: string;
  pending: ViewPendingItem[];
  /** The session's newest message id, when it has one. */
  messageId: string | null;
  transcriptAvailable: boolean;
}

/** A dismissal is per session, and a project keeps its own copy of the state. */
export function dismissKey(projectPath: string, sessionId: string): string {
  return `${projectPath}\0${sessionId}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parsed(iso: string | null): number {
  if (iso === null) return Number.NEGATIVE_INFINITY;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/** First `limit` characters of a message, with an ellipsis when it was cut. */
export function clipMessage(text: string, limit = INBOX_MESSAGE_LIMIT): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

/**
 * The rows a page shows, oldest first. A candidate is a row when it has a turn
 * or a `needsUser` item; a session older than `maxAgeDays` is hidden, and so is
 * one the user dismissed at that same turn (a newer turn brings it back).
 * `dismissed` is keyed by {@link dismissKey}; an unparseable time never hides a
 * row, because a broken value must not silently lose work.
 */
export function inboxRows(
  candidates: InboxCandidate[],
  dismissed: ReadonlyMap<string, string>,
  now: string,
  maxAgeDays: number,
): ViewInboxRow[] {
  const cutoff = Date.parse(now) - maxAgeDays * DAY_MS;
  const rows: ViewInboxRow[] = [];
  for (const candidate of candidates) {
    const turnAt = candidate.turn?.at ?? null;
    const at = turnAt ?? candidate.lastActivity;
    if (at === null) continue;
    const atMs = parsed(at);
    // The age filter applies to every row, including a record-only one.
    if (atMs === Number.NEGATIVE_INFINITY) continue;
    if (!Number.isNaN(cutoff) && atMs < cutoff) continue;
    const dismissedAt = dismissed.get(dismissKey(candidate.projectPath, candidate.sessionId));
    if (dismissedAt !== undefined && parsed(dismissedAt) >= atMs) continue;
    const signal: ViewInboxRow["signal"] =
      turnAt !== null && candidate.needsUser.length > 0
        ? "both"
        : turnAt !== null
          ? "turn"
          : "record";
    rows.push({
      projectName: candidate.projectName,
      projectPath: candidate.projectPath,
      mapUrl: candidate.mapUrl,
      sessionId: candidate.sessionId,
      sessionTitle: candidate.sessionTitle,
      signal,
      at,
      ...(turnAt !== null && candidate.turn !== null
        ? { lastMessage: clipMessage(candidate.turn.text) }
        : {}),
      goal: candidate.goal,
      lastDecision: candidate.lastDecision,
      pending: candidate.pending,
      ...(candidate.messageId === null ? {} : { messageId: candidate.messageId }),
      transcriptAvailable: candidate.transcriptAvailable,
    });
  }
  rows.sort(compareInboxRows);
  return rows;
}

/**
 * Oldest first, so the row that has waited longest is the one to go back to.
 * Name, path and session id keep equal times deterministic.
 */
export function compareInboxRows(a: ViewInboxRow, b: ViewInboxRow): number {
  return (
    parsed(a.at) - parsed(b.at) ||
    a.projectName.localeCompare(b.projectName) ||
    a.projectPath.localeCompare(b.projectPath) ||
    a.sessionId.localeCompare(b.sessionId)
  );
}

/**
 * How long ago a moment was, in the page's words ("2 h", "3 days"). The label
 * never decides anything; an unparseable value renders as an empty string.
 */
export function timeSince(at: string, now: string): string {
  const then = Date.parse(at);
  const reference = Date.parse(now);
  if (Number.isNaN(then) || Number.isNaN(reference)) return "";
  const seconds = Math.max(0, Math.floor((reference - then) / 1000));
  if (seconds < 60) return "under a minute";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}
