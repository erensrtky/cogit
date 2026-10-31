import type { ViewCapture } from "../../cli/src/view/model.js";
import type { FilesTarget } from "./FilesView.js";
import { formatStamp } from "./format.js";

/**
 * Captured work (Story 14.1): what the sessions left open, read from the
 * record (`pending` items and branch summaries' open lines). A read-only list,
 * not a plan: no checkboxes, no status, no assignee. Clicking a row opens the
 * message that named it, the same drill-down the files view gives.
 */
export function CapturesView({
  captures,
  active,
  onSelect,
  onClose,
}: {
  captures: readonly ViewCapture[] | undefined;
  /** The message the map has selected, if any. */
  active: FilesTarget | null;
  onSelect: (target: FilesTarget) => void;
  onClose: () => void;
}) {
  const all = captures ?? [];
  return (
    <nav className="outline capture-view" aria-label="Captured work">
      <header className="outline-head capture-head">
        <span className="outline-title capture-title">
          Captured work — what the sessions left open
        </span>
        <span className="outline-badge capture-badge">{all.length}</span>
        <button
          type="button"
          className="drilldown-close"
          aria-label="Hide captured work"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <p className="capture-note">
        Derived from the record on every build. Not a plan: cogit keeps no planning state.
      </p>
      <div className="outline-scroll">
        {all.length === 0 ? (
          <p className="empty">No captured work in this project.</p>
        ) : (
          <ul className="capture-list">
            {all.map((row) => {
              const messageId = row.messageId;
              const selected =
                messageId !== undefined &&
                active?.sessionId === row.sessionId &&
                active.messageId === messageId;
              const body = (
                <>
                  <span className="capture-line">
                    <span className="capture-chip">
                      {row.source === "pending" ? "pending" : "branch"}
                    </span>
                    {row.needsUser ? (
                      <span className="capture-needs" title="Waiting for you">
                        your call
                      </span>
                    ) : null}
                    <span className="capture-text">{row.text}</span>
                  </span>
                  <span className="capture-meta">
                    <span className="capture-session">{row.sessionTitle}</span>
                    {row.label === undefined ? null : (
                      <span className="capture-label">{row.label}</span>
                    )}
                    {row.branch === undefined ? null : (
                      <span className="capture-branch">╭ {row.branch}</span>
                    )}
                    {row.author === undefined ? null : (
                      <span className="capture-author">{row.author}</span>
                    )}
                    <span className="capture-time">{formatStamp(row.updatedAt)}</span>
                  </span>
                </>
              );
              return (
                <li key={row.key}>
                  {messageId === undefined ? (
                    <div className="capture-row">{body}</div>
                  ) : (
                    <button
                      type="button"
                      className={`capture-row${selected ? " is-active" : ""}`}
                      onClick={() => onSelect({ sessionId: row.sessionId, messageId })}
                    >
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </nav>
  );
}
