import { type ReactNode, useEffect, useState } from "react";
import { timeSince } from "../../cli/src/view/inbox.js";
import type { ViewCapture, ViewSession } from "../../cli/src/view/model.js";
import { pageToken, saveCaptureState } from "./data.js";
import type { FilesTarget } from "./FilesView.js";
import { formatStamp } from "./format.js";

/**
 * Captured work (Story 15.1): a short list a side model drafted from what the
 * sessions left open, and the user curates. "To review" holds the suggestions
 * (Accept or Dismiss), "Open" the accepted ones (Done), and "Done" the last ten
 * that were closed. The list is the user's, not a plan cogit keeps: no
 * assignment, no priority, no tracker state. An item belongs to its session, so
 * clicking a row's source opens the session's first message — where the map
 * anchors its captured work.
 */

type CaptureState = ViewCapture["state"];
/** The states the user can set; `suggested` is only ever written by the distiller. */
type CaptureTarget = "open" | "dismissed" | "done";

/**
 * Whether the map shows the Captured button: only while the setting is on and
 * something waits or is open. A store of only done items has no button and no
 * empty list, and the setting off hides it.
 */
export function capturesButtonVisible(
  captures: readonly ViewCapture[] | undefined,
  setting: boolean | undefined,
): boolean {
  return (
    setting !== false &&
    (captures ?? []).some((item) => item.state === "suggested" || item.state === "open")
  );
}

function stateTarget(captures: readonly ViewCapture[], state: CaptureState) {
  return captures.filter((item) => item.state === state);
}

function byNewest(a: ViewCapture, b: ViewCapture): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

/** Where clicking an item's source takes the map: the session's first message. */
export interface CaptureSource {
  sessionTitle: string;
  /** The first message's `mN` label; absent when the session has no messages. */
  label?: string | undefined;
  /** The message to open; absent when the session has no messages to anchor. */
  target?: { sessionId: string; messageId: string } | undefined;
}

/**
 * An item belongs to its session (Story 15.2). The session's **first message in
 * send order** is the honest anchor — a session has no node of its own in the
 * record — and the map draws it as the session's root, even when the session
 * continues another one. A session with no messages anchors nowhere.
 */
export function captureSource(
  source: { sessionId: string },
  sessions: readonly ViewSession[],
): CaptureSource {
  const session = sessions.find((candidate) => candidate.sessionId === source.sessionId);
  if (session === undefined) return { sessionTitle: source.sessionId };
  const first = session.messages[0];
  const sessionTitle = session.title || session.sessionId;
  if (first === undefined) return { sessionTitle };
  return {
    sessionTitle,
    label: first.label ?? first.id,
    target: { sessionId: session.sessionId, messageId: first.id },
  };
}

/**
 * How many `suggested` + `open` items each session stands for, for the map's
 * capture badge. `done` and `dismissed` items are closed and count nothing, so a
 * store of only done items marks no row, like the Captured button.
 */
export function captureCounts(captures: readonly ViewCapture[] | undefined): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of captures ?? []) {
    if (item.state !== "suggested" && item.state !== "open") continue;
    counts.set(item.source.sessionId, (counts.get(item.source.sessionId) ?? 0) + 1);
  }
  return counts;
}

export function CapturesView({
  captures,
  sessions,
  dir,
  active,
  onSelect,
  onClose,
}: {
  captures: readonly ViewCapture[] | undefined;
  /** The project's sessions, for each item's source title and anchored message. */
  sessions: readonly ViewSession[];
  /** The project's path, for the state write. */
  dir: string;
  /** The message the map has selected, if any. */
  active: FilesTarget | null;
  onSelect: (target: FilesTarget) => void;
  onClose: () => void;
}) {
  // The page is a snapshot; a state change is shown at once and the live page
  // swaps in the rebuilt model a moment later.
  const [items, setItems] = useState<readonly ViewCapture[]>(captures ?? []);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setItems(captures ?? []), [captures]);
  const now = new Date().toISOString();

  function change(item: ViewCapture, state: CaptureTarget): void {
    const token = pageToken();
    if (token === null) {
      setError("This is a saved page; open it with `cogit open` to change the list.");
      return;
    }
    const previous = items;
    setError(null);
    setItems(items.map((row) => (row.id === item.id ? { ...row, state } : row)));
    void saveCaptureState(dir, item.id, state, token).catch((err: unknown) => {
      setItems(previous);
      setError(err instanceof Error ? err.message : String(err));
    });
  }

  const review = stateTarget(items, "suggested").sort(byNewest);
  const open = stateTarget(items, "open").sort(byNewest);
  const done = stateTarget(items, "done").sort(byNewest).slice(0, 10);

  function row(item: ViewCapture, actions: ReactNode) {
    const source = captureSource(item.source, sessions);
    const age = timeSince(item.updatedAt, now);
    const selected =
      source.target !== undefined &&
      active?.sessionId === source.target.sessionId &&
      active.messageId === source.target.messageId;
    return (
      <li key={item.id}>
        <div className={`capture-row${selected ? " is-active" : ""}`}>
          <button
            type="button"
            className="capture-open"
            title={formatStamp(item.updatedAt)}
            disabled={source.target === undefined}
            onClick={() => {
              if (source.target !== undefined) onSelect(source.target);
            }}
          >
            <span className="capture-text">{item.text}</span>
            <span className="capture-meta">
              <span className="capture-session">{source.sessionTitle}</span>
              {source.label === undefined ? null : (
                <span className="capture-label">{source.label}</span>
              )}
              {age === "" ? null : <span className="capture-time">{age} ago</span>}
            </span>
          </button>
          <span className="capture-actions">{actions}</span>
        </div>
      </li>
    );
  }

  const empty = review.length === 0 && open.length === 0 && done.length === 0;

  return (
    <nav className="outline capture-view" aria-label="Captured work">
      <header className="outline-head capture-head">
        <span className="outline-title capture-title">Captured work</span>
        <span className="outline-badge capture-badge">{review.length + open.length}</span>
        <button
          type="button"
          className="drilldown-close"
          aria-label="Hide captured work"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <p className="capture-note">A list you curate, not a plan cogit keeps.</p>
      {error === null ? null : <p className="muted capture-error">{error}</p>}
      <div className="outline-scroll">
        {empty ? (
          <p className="empty">No captured work.</p>
        ) : (
          <>
            {review.length === 0 ? null : (
              <section className="capture-section">
                <h3 className="capture-heading">To review</h3>
                <ul className="capture-list">
                  {review.map((item) =>
                    row(
                      item,
                      <>
                        <button
                          type="button"
                          className="capture-action is-accept"
                          onClick={() => change(item, "open")}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="capture-action"
                          onClick={() => change(item, "dismissed")}
                        >
                          Dismiss
                        </button>
                      </>,
                    ),
                  )}
                </ul>
              </section>
            )}
            {open.length === 0 ? null : (
              <section className="capture-section">
                <h3 className="capture-heading">Open</h3>
                <ul className="capture-list">
                  {open.map((item) =>
                    row(
                      item,
                      <button
                        type="button"
                        className="capture-action"
                        onClick={() => change(item, "done")}
                      >
                        Done
                      </button>,
                    ),
                  )}
                </ul>
              </section>
            )}
            {done.length === 0 ? null : (
              <details className="capture-section capture-done">
                <summary className="capture-heading">Done (last 10)</summary>
                <ul className="capture-list">{done.map((item) => row(item, null))}</ul>
              </details>
            )}
          </>
        )}
      </div>
    </nav>
  );
}
