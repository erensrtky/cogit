import { formatChange, isBigChange, type UnreadMessage } from "../../cli/src/view/change.js";
import { formatStamp } from "./format.js";

/**
 * The map's unread filter (Story 10.3): messages the user has not marked read
 * that have commits behind them, most code first. It is a list, not a verdict:
 * the numbers come from git, and a message lands here simply because nobody has
 * looked at it yet. Clicking a row opens that message on the graph, exactly as
 * its dot does.
 */
export function UnreadView({
  messages,
  bigChangeLines,
  active,
  onSelect,
  onClose,
}: {
  messages: readonly UnreadMessage[];
  /** The highlight threshold; big rows get a quiet mark. */
  bigChangeLines: number;
  active: { sessionId: string; messageId: string } | null;
  onSelect: (target: { sessionId: string; messageId: string }) => void;
  onClose: () => void;
}) {
  return (
    <nav className="outline unread-view" aria-label="Unread messages, most code first">
      <header className="outline-head">
        <span className="outline-title">Unread, most code first</span>
        <span className="outline-badge">{messages.length}</span>
        <button
          type="button"
          className="drilldown-close"
          aria-label="Hide unread"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="outline-scroll">
        {messages.length === 0 ? (
          <p className="empty">
            No unread messages with commits. A message appears here once a commit carries it and you
            have not marked it read.
          </p>
        ) : (
          <ul className="outline-list">
            {messages.map((message) => {
              const big = isBigChange(message.change, bigChangeLines);
              const current =
                active?.sessionId === message.sessionId && active.messageId === message.messageId;
              return (
                <li key={message.messageId}>
                  <button
                    type="button"
                    className={`outline-item unread-row${current ? " is-active" : ""}${
                      big ? " is-big" : ""
                    }`}
                    title={`${message.title} — ${message.sessionTitle}`}
                    onClick={() =>
                      onSelect({
                        sessionId: message.sessionId,
                        messageId: message.messageId,
                      })
                    }
                  >
                    <span className="git-change">{formatChange(message.change)}</span>
                    <span className="unread-label">{message.label}</span>
                    <span className="unread-title">{message.title}</span>
                    <span className="muted unread-session">{message.sessionTitle}</span>
                    <span className="muted unread-when">
                      {message.at === undefined ? "" : formatStamp(message.at)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </nav>
  );
}
