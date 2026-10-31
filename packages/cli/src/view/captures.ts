import type { ViewNode, ViewPendingItem } from "./model.js";

/**
 * The input the captured-work distiller reads (Story 15.1). The record is the
 * only source: a session's pending items and its branch summaries' open lines,
 * next to the titles of its last messages so the model can tell what the session
 * was really about. The map and the CLI show the curated store, never these rows.
 *
 * Kept free of Node imports, like the rest of `view/`.
 */

/** The part of a session the distiller needs; an effective session fits as is. */
export interface CaptureSourceSession {
  sessionId: string;
  title: string;
  updatedAt: string;
  status: { pending: readonly ViewPendingItem[] };
  messages: readonly Pick<ViewNode, "id" | "label" | "title" | "branch" | "unsummarized">[];
}

/** One line the record left open, pointing at the message that named it. */
export interface CaptureLine {
  text: string;
  messageId?: string | undefined;
  label?: string | undefined;
}

/** A pending item: the session as a whole left it open. */
export interface CapturePendingLine extends CaptureLine {
  needsUser: boolean;
}

/** A message title, so the model knows what the session was about. */
export interface CaptureMessageTitle {
  id: string;
  label?: string | undefined;
  title: string;
}

export interface CaptureInput {
  sessionId: string;
  title: string;
  pending: CapturePendingLine[];
  /** A branch summary's `open` line, on the branch's first message. */
  branches: CaptureLine[];
  /** The last recorded messages, oldest first. */
  lastMessages: CaptureMessageTitle[];
}

/** How many recent messages the prompt carries: enough for the topic, not the chat. */
export const LAST_MESSAGE_LIMIT = 5;

function line(text: string, message: { id: string; label?: string | undefined }): CaptureLine {
  return {
    text: text.replace(/\s+/g, " ").trim(),
    messageId: message.id,
    ...(message.label === undefined ? {} : { label: message.label }),
  };
}

/** What one session left open, in the record's own words. */
export function captureInput(
  session: CaptureSourceSession,
  lastMessageLimit = LAST_MESSAGE_LIMIT,
): CaptureInput {
  const recorded = session.messages.filter((message) => message.unsummarized !== true);
  // A pending item belongs to the session as a whole; it points at the newest
  // recorded message, where the session left off.
  const newest = recorded[recorded.length - 1];
  const seen = new Set<string>();
  const pending: CapturePendingLine[] = [];
  for (const item of session.status.pending) {
    const text = item.text.replace(/\s+/g, " ").trim();
    if (text === "" || seen.has(text)) continue;
    seen.add(text);
    pending.push({
      text,
      needsUser: item.needsUser,
      ...(newest === undefined ? {} : line(text, newest)),
    });
  }
  const branches: CaptureLine[] = [];
  for (const message of session.messages) {
    const text = message.branch?.open.replace(/\s+/g, " ").trim() ?? "";
    if (text === "") continue;
    branches.push(line(text, message));
  }
  const lastMessages = recorded.slice(-Math.max(0, lastMessageLimit)).map(
    (message): CaptureMessageTitle => ({
      id: message.id,
      ...(message.label === undefined ? {} : { label: message.label }),
      title: message.title,
    }),
  );
  return {
    sessionId: session.sessionId,
    title: session.title === "" ? session.sessionId : session.title,
    pending,
    branches,
    lastMessages,
  };
}

/**
 * Whether the session is worth a model call at all: with no pending item (a
 * `needsUser` item is one) and no open branch line, most sessions cost nothing.
 */
export function hasOpenWork(input: CaptureInput): boolean {
  return input.pending.length > 0 || input.branches.length > 0;
}
