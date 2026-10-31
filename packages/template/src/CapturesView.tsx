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
 * assignment, no priority, no tracker state. Clicking a row's source opens the
 * message that named it, the same drill-down the files view gives.
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

export function CapturesView({
  captures,
  sessions,
  dir,
  active,
  onSelect,
  onClose,
}: {
  captures: readonly ViewCapture[] | undefined;
  /** The project's sessions, for the title of each item's source message. */
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

  const titles = new Map(
    sessions.map((session) => [session.sessionId, session.title || session.sessionId]),
  );
  const labels = new Map<string, string>();
  for (const session of sessions)
    for (const message of session.messages)
      if (message.label !== undefined)
        labels.set(`${session.sessionId}:${message.id}`, message.label);

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
    const sessionTitle = titles.get(item.source.sessionId) ?? item.source.sessionId;
    const label = labels.get(`${item.source.sessionId}:${item.source.messageId}`);
    const age = timeSince(item.updatedAt, now);
    const selected =
      active?.sessionId === item.source.sessionId && active.messageId === item.source.messageId;
    return (
      <li key={item.id}>
        <div className={`capture-row${selected ? " is-active" : ""}`}>
          <button
            type="button"
            className="capture-open"
            title={formatStamp(item.updatedAt)}
            onClick={() =>
              onSelect({ sessionId: item.source.sessionId, messageId: item.source.messageId })
            }
          >
            <span className="capture-text">{item.text}</span>
            <span className="capture-meta">
              <span className="capture-session">{sessionTitle}</span>
              <span className="capture-label">{label ?? item.source.messageId}</span>
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
