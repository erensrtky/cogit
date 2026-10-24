import { useEffect, useMemo, useState } from "react";
import type { LineageViewModel, ViewSession } from "../../cli/src/view/model.js";
import { kindLabel } from "./format.js";
import { epochId, nodeId, sessionId, UNASSIGNED_EPOCH_ID } from "./graph.js";
import type { Selection } from "./SidePanel.js";

/**
 * Experimental outline tree (epoch → session → messages) that sits next to the
 * map. Selecting a row opens its session's message graph (or goes back to the
 * session graph for an epoch) and opens the same drill-down a map click would.
 */

export interface OutlineTarget {
  /** The session to open; null returns the map to the session level. */
  sessionId: string | null;
  /** Highlight key: `epoch:…`, `session:…` or `node:…`. */
  focusId: string;
  /** Drill-down content; `null` for epochs. */
  selection: Selection | null;
}

interface Group {
  id: string;
  title: string;
  sessions: ViewSession[];
}

function groups(model: LineageViewModel): Group[] {
  const result: Group[] = model.epochs.map((epoch) => ({
    id: epochId(epoch.id),
    title: epoch.title,
    sessions: epoch.sessions,
  }));
  if (model.unassigned.length > 0) {
    result.push({ id: UNASSIGNED_EPOCH_ID, title: "Unassigned", sessions: model.unassigned });
  }
  return result;
}

/**
 * Ancestor chain of an outline item, including the item itself: the epoch for a
 * session, the epoch and session for a message. `null` when the id does not
 * belong to this model.
 */
export function outlinePath(model: LineageViewModel, targetId: string): string[] | null {
  for (const group of groups(model)) {
    if (group.id === targetId) return [group.id];
    for (const session of group.sessions) {
      const key = sessionId(session.sessionId);
      if (key === targetId) return [group.id];
      if (session.messages.some((message) => nodeId(key, message.id) === targetId)) {
        return [group.id, key];
      }
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
                    <span className={`kind kind-${message.kind}`}>{kindLabel(message.kind)}</span>
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
  const allGroups = useMemo(() => groups(model), [model]);
  // Epochs start open so the tree lists every session; sessions close their
  // messages until asked, mirroring the map's collapsed default.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(allGroups.map((group) => group.id)),
  );

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
        <span className="outline-badge">experimental</span>
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
        {allGroups.length === 0 ? (
          <p className="empty">No sessions recorded yet.</p>
        ) : (
          <ul className="outline-list">
            {allGroups.map((group) => {
              const open = expanded.has(group.id) && group.sessions.length > 0;
              return (
                <li key={group.id}>
                  <div className="outline-row">
                    <ExpandToggle
                      id={group.id}
                      hasChildren={group.sessions.length > 0}
                      expanded={expanded.has(group.id)}
                      onToggle={toggle}
                    />
                    <button
                      type="button"
                      className={`outline-item${activeId === group.id ? " is-active" : ""}`}
                      onClick={() =>
                        onSelect({
                          sessionId: null,
                          focusId: group.id,
                          selection: null,
                        })
                      }
                    >
                      <span className="label">{group.title}</span>
                      <span className="outline-count">{group.sessions.length}</span>
                    </button>
                  </div>
                  {open ? (
                    <ul>
                      {group.sessions.map((session) => (
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
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </nav>
  );
}
