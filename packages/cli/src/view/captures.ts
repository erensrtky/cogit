import type { ViewCapture, ViewNode, ViewPendingItem } from "./model.js";
import { personLabel } from "./people.js";

/**
 * Captured work (Story 14.1): what the sessions left open, gathered from the
 * record after the fact. One read-only derivation — no stored state, no model
 * call — that `cogit captures` and the map's Captured list both read, so the
 * two can never disagree. It is not a plan: nothing here can be ticked off,
 * assigned or edited. Kept free of Node imports because the template imports it.
 */

/** The part of a session the derivation needs; a `ViewSession` fits as is. */
export interface CaptureSourceSession {
  sessionId: string;
  title: string;
  author?: string | undefined;
  authorEmail?: string | undefined;
  updatedAt: string;
  status: { pending: readonly ViewPendingItem[] };
  messages: readonly Pick<ViewNode, "id" | "label" | "branch" | "unsummarized">[];
}

/** Parsed time, with `-Infinity` for an absent or rejected value. */
function timeOf(at: string): number {
  const time = Date.parse(at);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * `needsUser` first, then the newest session first. The sort is stable, so a
 * tie keeps the record's order: pending items, then branches in message order.
 */
function byOrder(a: ViewCapture, b: ViewCapture): number {
  return Number(b.needsUser) - Number(a.needsUser) || timeOf(b.updatedAt) - timeOf(a.updatedAt);
}

/** Every open line the records hold, one row per source, sorted for reading. */
export function buildCaptures(sessions: readonly CaptureSourceSession[]): ViewCapture[] {
  const rows: ViewCapture[] = [];
  for (const session of sessions) {
    const sessionTitle = session.title.trim() === "" ? session.sessionId : session.title;
    const person = personLabel(session);
    const base = {
      sessionId: session.sessionId,
      sessionTitle,
      ...(person === undefined ? {} : { author: person }),
      updatedAt: session.updatedAt,
    };

    // A pending item belongs to the session as a whole; it points at the
    // newest message the record holds, where the session left off.
    const recorded = session.messages.filter((message) => message.unsummarized !== true);
    const newest = recorded[recorded.length - 1];
    const seenPending = new Set<string>();
    session.status.pending.forEach((item, index) => {
      const text = item.text.trim();
      if (text === "" || seenPending.has(text)) return;
      seenPending.add(text);
      rows.push({
        key: `${session.sessionId}#p${index}`,
        text,
        source: "pending",
        ...base,
        ...(newest === undefined
          ? {}
          : {
              messageId: newest.id,
              ...(newest.label === undefined ? {} : { label: newest.label }),
            }),
        needsUser: item.needsUser,
      });
    });

    // A branch summary's open line sits on the branch's first message.
    for (const message of session.messages) {
      const text = message.branch?.open.trim() ?? "";
      if (text === "") continue;
      rows.push({
        key: `${session.sessionId}#${message.id}`,
        text,
        source: "branch",
        ...base,
        messageId: message.id,
        ...(message.label === undefined ? {} : { label: message.label }),
        ...(message.branch === undefined ? {} : { branch: message.branch.title }),
        needsUser: false,
      });
    }
  }
  return rows.sort(byOrder);
}
