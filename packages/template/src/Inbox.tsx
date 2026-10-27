import { useState } from "react";
import { dismissKey, timeSince } from "../../cli/src/view/inbox.js";
import type { ViewInboxRow } from "../../cli/src/view/model.js";
import { isLivePage, pageToken, saveDismiss } from "./data.js";
import { formatTime } from "./format.js";
import { ResumeButton } from "./ResumeButton.js";

/**
 * The "your turn" inbox (Story 11.1): one row per session whose transcript ends
 * with the agent, or whose record has `needsUser` items. The two signals stay
 * apart — the turn is a transcript fact, the record summary is labelled as the
 * record's — and the agent's last message is shown verbatim so the user judges
 * it, never a guess about whether it asked a question.
 */

/** The map of the row's project, opened at the session's newest message. */
function rowHref(row: ViewInboxRow): string {
  const base = isLivePage() ? `/map?dir=${encodeURIComponent(row.projectPath)}` : row.mapUrl;
  const params = new URLSearchParams({ s: row.sessionId });
  if (row.messageId !== undefined) params.set("m", row.messageId);
  return `${base}#${params.toString()}`;
}

/**
 * One lane colour per project, so rows of different projects never blur
 * together: a stable hash of the path picks one of the six lane colours.
 */
export function projectColour(path: string): number {
  let hash = 0;
  for (const char of path) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return hash % 6;
}

function WhereWereWe({ row }: { row: ViewInboxRow }) {
  const parts = [
    row.goal === "" ? "" : `Goal: ${row.goal}`,
    row.lastDecision === "" ? "" : `Last decision: ${row.lastDecision}`,
    row.pending.length === 0 ? "" : `Open: ${row.pending.map((item) => item.text).join("; ")}`,
  ].filter((part) => part !== "");
  if (parts.length === 0) return null;
  return (
    <p className="inbox-where">
      <span className="muted">Where we were, from the record:</span> {parts.join(" · ")}
    </p>
  );
}

export function Inbox({
  rows,
  collapsible = false,
}: {
  rows: ViewInboxRow[];
  /** On a map the inbox starts folded to one line, so it never pushes the map away. */
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(!collapsible);
  // A `file://` page has no server to persist a dismissal; the row hides for
  // this open page, which is what the button's title says.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const visible = rows.filter((row) => !hidden.has(dismissKey(row.projectPath, row.sessionId)));
  if (visible.length === 0) return null;
  // The page is a snapshot; the age still moves while it stays open.
  const now = new Date().toISOString();

  function dismiss(row: ViewInboxRow): void {
    const key = dismissKey(row.projectPath, row.sessionId);
    setError(null);
    setHidden((previous) => new Set(previous).add(key));
    const token = pageToken();
    if (token === null) return;
    void saveDismiss(row.projectPath, row.sessionId, row.at, token).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
      setHidden((previous) => {
        const next = new Set(previous);
        next.delete(key);
        return next;
      });
    });
  }

  return (
    <section className="inbox" aria-labelledby="inbox-title">
      <h2 id="inbox-title">
        {collapsible ? (
          <button
            type="button"
            className="inbox-toggle"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="inbox-caret">{open ? "▾" : "▸"}</span> Your turn{" "}
            <span className="muted inbox-count">{visible.length}</span>
          </button>
        ) : (
          <>
            Your turn <span className="muted inbox-count">{visible.length}</span>
          </>
        )}
      </h2>
      {open ? (
        <ul className="inbox-rows">
          {visible.map((row) => (
            <li
              className="inbox-row"
              key={dismissKey(row.projectPath, row.sessionId)}
              style={{ borderLeftColor: `var(--l${projectColour(row.projectPath)})` }}
            >
              <div className="inbox-head">
                <span className="inbox-project" title={row.projectPath}>
                  {row.projectName}
                </span>
                <span className="inbox-session">{row.sessionTitle}</span>
                <span
                  className={row.signal === "record" ? "inbox-age is-record" : "inbox-age"}
                  title={formatTime(row.at)}
                >
                  {row.signal === "record"
                    ? `the record says it needs you · ${timeSince(row.at, now)}`
                    : `your turn for ${timeSince(row.at, now)}`}
                </span>
                <button
                  type="button"
                  className="inbox-dismiss"
                  aria-label="Dismiss"
                  title={
                    pageToken() === null
                      ? "Hide until this page is reloaded"
                      : "Hide until the agent writes in this session again"
                  }
                  onClick={() => dismiss(row)}
                >
                  ×
                </button>
              </div>
              {row.lastMessage === undefined ? null : (
                <p className="inbox-message">{row.lastMessage}</p>
              )}
              {row.signal !== "both" ? null : (
                <p className="inbox-signal">The record says it needs you.</p>
              )}
              <WhereWereWe row={row} />
              <div className="inbox-actions">
                <a className="inbox-open" href={rowHref(row)}>
                  {row.messageId === undefined ? "Open the map →" : "Open at this message →"}
                </a>
                <ResumeButton
                  projectPath={row.projectPath}
                  sessionId={row.sessionId}
                  available={row.transcriptAvailable}
                  revealCommand
                />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {error === null ? null : <p className="muted inbox-error">{error}</p>}
    </section>
  );
}
