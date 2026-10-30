import { useEffect, useState } from "react";
import type { LineageViewModel, ViewSession } from "../../cli/src/view/model.js";
import { kindLabel } from "./format.js";
import { nodeId, sessionId } from "./graph.js";
import type { Selection } from "./SidePanel.js";

/**
 * Outline tree (session → messages) that sits next to the map, sessions in the
 * map's start order. Selecting a row opens its session's message graph and the
 * same drill-down a map click would.
 */

export interface OutlineTarget {
  /** The session to open; null returns the map to the session level. */
  sessionId: string | null;
  /** Highlight key: `session:…` or `node:…`. */
  focusId: string;
  /** Drill-down content. */
  selection: Selection | null;
}

/**
 * Chain of an outline item, the item itself last: a session alone, or the
 * session and then the message. `null` when the id does not belong to this model.
 */
export function outlinePath(model: LineageViewModel, targetId: string): string[] | null {
  for (const session of model.sessions) {
    const key = sessionId(session.sessionId);
    if (key === targetId) return [key];
    if (session.messages.some((message) => nodeId(key, message.id) === targetId)) {
      return [key, targetId];
    }
  }
  return null;
}

function ExpandToggle({
  id,
  hasChildren,
  expanded,
  onToggle,
}: {
  id: string;
  hasChildren: boolean;
  expanded: boolean;
  onToggle: (id: string) => void;
}) {
  if (!hasChildren) return <span className="outline-toggle is-empty" aria-hidden="true" />;
  return (
    <button
      type="button"
      className="outline-toggle"
      aria-expanded={expanded}
      aria-label={expanded ? "Collapse" : "Expand"}
      onClick={() => onToggle(id)}
    >
      {expanded ? "▾" : "▸"}
    </button>
  );
}

function SessionRow({
  session,
  activeId,
  expanded,
  onToggle,
  onSelect,
}: {
  session: ViewSession;
  activeId: string | null;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onSelect: (target: OutlineTarget) => void;
}) {
  const key = sessionId(session.sessionId);
  const hasChildren = session.messages.length > 0;
  const open = hasChildren && expanded.has(key);
  return (
    <li>
      <div className="outline-row">
        <ExpandToggle
          id={key}
          hasChildren={hasChildren}
          expanded={expanded.has(key)}
          onToggle={onToggle}
        />
        <button
          type="button"
          className={`outline-item${activeId === key ? " is-active" : ""}`}
          onClick={() =>
            onSelect({
              sessionId: session.sessionId,
              focusId: key,
              selection: { type: "session", sessionId: session.sessionId },
            })
          }
        >
          <span className="label">{session.title || session.sessionId}</span>
          <span className="outline-count">{session.messages.length}</span>
        </button>
      </div>
      {open ? (
        <ul>
          {session.messages.map((message) => {
            const id = nodeId(key, message.id);
            return (
              <li key={id}>
                <div className="outline-row">
                  <span className="outline-toggle is-empty" aria-hidden="true" />
                  <button
                    type="button"
                    className={`outline-item${activeId === id ? " is-active" : ""}`}
                    onClick={() =>
                      onSelect({
                        sessionId: session.sessionId,
                        focusId: id,
                        selection: {
                          type: "node",
                          sessionId: session.sessionId,
                          nodeId: message.id,
                        },
                      })
                    }
                  >
                    {/* Every node is a message now; older records still carry other kinds. */}
                    {message.kind === "message" ? null : (
                      <span className={`kind kind-${message.kind}`}>{kindLabel(message.kind)}</span>
                    )}
                    <span className="label">{message.title}</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

export function Outline({
  model,
  activeId,
  onSelect,
  onClose,
}: {
  model: LineageViewModel;
  activeId: string | null;
  onSelect: (target: OutlineTarget) => void;
  onClose: () => void;
}) {
  // Sessions close their messages until asked, mirroring the map's collapsed default.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // Map clicks drive the highlight too; reveal the row when it is nested.
  useEffect(() => {
    if (!activeId) return;
    const path = outlinePath(model, activeId);
    if (!path) return;
    // Reveal the target: expand its ancestors, never its own children.
    const reveal = path.slice(0, -1);
    if (reveal.length === 0) return;
    setExpanded((previous) => {
      if (reveal.every((id) => previous.has(id))) return previous;
      const next = new Set(previous);
      for (const id of reveal) next.add(id);
      return next;
    });
  }, [activeId, model]);

  const toggle = (id: string): void => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <nav className="outline" aria-label="Project outline">
      <header className="outline-head">
        <span className="outline-title">Outline</span>
        <button
          type="button"
          className="drilldown-close"
          aria-label="Hide outline"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="outline-scroll">
        {model.sessions.length === 0 ? (
          <p className="empty">No sessions recorded yet.</p>
        ) : (
          <ul className="outline-list">
            {model.sessions.map((session) => (
              <SessionRow
                key={session.sessionId}
                session={session}
                activeId={activeId}
                expanded={expanded}
                onToggle={toggle}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </div>
    </nav>
  );
}
