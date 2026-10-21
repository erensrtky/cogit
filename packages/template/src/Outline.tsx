import { useEffect, useMemo, useState } from "react";
import type { LineageViewModel, ViewNode, ViewSession } from "../../cli/src/view/model.js";
import { countNodes, epochId, nodeId, sessionId, UNASSIGNED_EPOCH_ID } from "./graph.js";
import type { Selection } from "./SidePanel.js";

/**
 * Experimental outline tree (epoch → session → nodes) that sits next to the
 * graph. Selecting a row expands the graph groups the row lives in, centres the
 * matching React Flow node and opens the same drill-down panel a click would.
 * Epochs have no panel of their own: focusing the group is their detail view.
 */

export interface OutlineTarget {
  /** React Flow node id to centre on. */
  focusId: string;
  /** Graph group ids that must be expanded for `focusId` to exist. */
  expand: string[];
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

/** Ids from the first matching node down to the target, or `null`. */
function findNodePath(nodes: ViewNode[], group: string, targetId: string): string[] | null {
  for (const node of nodes) {
    const id = nodeId(group, node.id);
    if (id === targetId) return [id];
    const childPath = findNodePath(node.children, group, targetId);
    if (childPath) return [id, ...childPath];
  }
  return null;
}

/**
 * Ancestor chain of an outline item, including the item itself: the epoch for a
 * session, the epoch, session and node ancestors for a node. `null` when the id
 * does not belong to this model.
 */
export function outlinePath(model: LineageViewModel, targetId: string): string[] | null {
  for (const group of groups(model)) {
    if (group.id === targetId) return [group.id];
    for (const session of group.sessions) {
      const key = sessionId(session.sessionId);
      if (key === targetId) return [group.id];
      const nodePath = findNodePath(session.nodes, key, targetId);
      if (nodePath) return [group.id, key, ...nodePath];
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

function NodeRows({
  nodes,
  epoch,
  sessionKey,
  rawSessionId,
  activeId,
  expanded,
  onToggle,
  onSelect,
}: {
  nodes: ViewNode[];
  epoch: string;
  sessionKey: string;
  rawSessionId: string;
  activeId: string | null;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onSelect: (target: OutlineTarget) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const id = nodeId(sessionKey, node.id);
        const hasChildren = node.children.length > 0;
        const open = hasChildren && expanded.has(id);
        return (
          <li key={id}>
            <div className="outline-row">
              <ExpandToggle
                id={id}
                hasChildren={hasChildren}
                expanded={expanded.has(id)}
                onToggle={onToggle}
              />
              <button
                type="button"
                className={`outline-item${activeId === id ? " is-active" : ""}`}
                onClick={() =>
                  onSelect({
                    focusId: id,
                    expand: [epoch, sessionKey],
                    selection: {
                      type: "node",
                      node: {
                        kind: node.kind,
                        title: node.title,
                        ...(node.summary === undefined ? {} : { summary: node.summary }),
                        ...(node.why === undefined ? {} : { why: node.why }),
                        ...(node.at === undefined ? {} : { at: node.at }),
                        sessionId: rawSessionId,
                      },
                    },
                  })
                }
              >
                <span className={`kind kind-${node.kind}`}>{node.kind}</span>
                <span className="label">{node.title}</span>
              </button>
            </div>
            {open ? (
              <ul>
                <NodeRows
                  nodes={node.children}
                  epoch={epoch}
                  sessionKey={sessionKey}
                  rawSessionId={rawSessionId}
                  activeId={activeId}
                  expanded={expanded}
                  onToggle={onToggle}
                  onSelect={onSelect}
                />
              </ul>
            ) : null}
          </li>
        );
      })}
    </>
  );
}

function SessionRow({
  group,
  session,
  activeId,
  expanded,
  onToggle,
  onSelect,
}: {
  group: string;
  session: ViewSession;
  activeId: string | null;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onSelect: (target: OutlineTarget) => void;
}) {
  const key = sessionId(session.sessionId);
  const hasChildren = session.nodes.length > 0;
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
              focusId: key,
              expand: [group],
              selection: { type: "session", sessionId: session.sessionId },
            })
          }
        >
          <span className="label">{session.title || session.sessionId}</span>
          <span className="outline-count">{countNodes(session.nodes)}</span>
        </button>
      </div>
      {open ? (
        <ul>
          <NodeRows
            nodes={session.nodes}
            epoch={group}
            sessionKey={key}
            rawSessionId={session.sessionId}
            activeId={activeId}
            expanded={expanded}
            onToggle={onToggle}
            onSelect={onSelect}
          />
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
  // Epochs start open so the tree lists every session; sessions and nodes close
  // their own children until asked, mirroring the graph's collapsed default.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(allGroups.map((group) => group.id)),
  );

  // Graph clicks drive the highlight too; reveal the row when it is nested.
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
                        onSelect({ focusId: group.id, expand: [group.id], selection: null })
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
                          group={group.id}
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
