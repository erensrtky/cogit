import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ViewFile, ViewFileLink } from "../../cli/src/view/model.js";
import {
  buildFileGraph,
  defaultFocus,
  type GraphNode,
  graphBounds,
  layoutFileGraph,
} from "./fileGraph.js";
import { clampPan, fitView, type PanView, type Size, zoomAt } from "./panZoom.js";

/**
 * The Graph view: one file in focus, the recorded files it imports or is
 * imported by around it, and the messages that touched them. A file click moves
 * the focus there; a message click opens the same drill-down a dot click on the
 * git view gives. Without a code graph it shows the focus file's messages only.
 */

export interface GraphTarget {
  sessionId: string;
  messageId: string;
}

const shortName = (path: string): string => path.split("/").pop() ?? path;

export function FileGraphView({
  files,
  links,
  focus,
  active,
  onFocus,
  onSelect,
}: {
  files: readonly ViewFile[] | undefined;
  links: readonly ViewFileLink[] | undefined;
  focus: string | null;
  active: GraphTarget | null;
  onFocus: (path: string) => void;
  onSelect: (target: GraphTarget) => void;
}) {
  const list = files ?? [];
  const current =
    focus !== null && list.some((file) => file.path === focus) ? focus : defaultFocus(list, links);
  const graph = useMemo(
    () => (current === undefined ? null : buildFileGraph(list, links, current)),
    [list, links, current],
  );
  const nodes = useMemo(() => (graph === null ? [] : layoutFileGraph(graph)), [graph]);
  const bounds = useMemo(() => graphBounds(nodes), [nodes]);
  const at = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const viewport = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<PanView>({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  // The click that ends a drag is not a node click.
  const dragged = useRef(false);
  const content: Size = { width: bounds.width, height: bounds.height };
  const box = useCallback(
    (): Size | null =>
      viewport.current === null
        ? null
        : { width: viewport.current.clientWidth, height: viewport.current.clientHeight },
    [],
  );
  // A new focus opens fitted, and so does a resized view (full screen, the
  // side panel opening); the user's pan and zoom last until then.
  useEffect(() => {
    const element = viewport.current;
    if (element === null) return;
    const fit = () => {
      const size = box();
      if (size !== null) setView(fitView(size, content));
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [bounds, box]);
  useEffect(() => {
    const element = viewport.current;
    if (element === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * 0.0015);
      setView((now) => zoomAt(now, factor, event.clientX - rect.left, event.clientY - rect.top));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragged.current = false;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (start === null || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 4) return;
    if (!start.moved) event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: start.id, x: event.clientX, y: event.clientY, moved: true };
    const size = box();
    setView((now) => {
      const moved = { ...now, x: now.x + dx, y: now.y + dy };
      return size === null ? moved : clampPan(moved, size, content, 40);
    });
  };
  const endDrag = () => {
    dragged.current = drag.current?.moved ?? false;
    drag.current = null;
  };

  if (current === undefined || graph === null)
    return (
      <div className="file-graph">
        <p className="graph-status empty">No recorded message touched a file yet.</p>
      </div>
    );

  const activeId = active === null ? null : `${active.sessionId}:${active.messageId}`;
  const lit = new Set<string>();
  if (activeId !== null && at.has(activeId)) {
    lit.add(activeId);
    for (const edge of graph.edges) if (edge.from === activeId) lit.add(edge.to);
  }
  const linkedFiles = nodes.filter((node) => node.kind === "file").length - 1;
  const messages = nodes.length - linkedFiles - 1;
  const click = (node: GraphNode) => {
    if (dragged.current) return;
    if (node.kind === "file") onFocus(node.id);
    else if (node.hit !== undefined)
      onSelect({ sessionId: node.hit.sessionId, messageId: node.hit.messageId });
  };

  const needle = query.trim().toLowerCase();
  const picks = [...list]
    .filter((file) => needle === "" || file.path.toLowerCase().includes(needle))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
  const roleOf = new Map(nodes.map((node) => [node.id, node.role]));

  return (
    <div className="file-graph">
      <nav className="file-graph-files" aria-label="Files">
        <input
          type="search"
          className="file-graph-search"
          placeholder="Find a file"
          aria-label="Find a file"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul>
          {picks.map((file) => {
            const role = roleOf.get(file.path);
            const slash = file.path.lastIndexOf("/");
            return (
              <li key={file.path}>
                <button
                  type="button"
                  className={`file-graph-file${role === "focus" ? " is-focus" : role ? " is-linked" : ""}`}
                  aria-current={role === "focus" ? "true" : undefined}
                  title={role && role !== "focus" ? `${file.path} · ${role}` : file.path}
                  onClick={() => onFocus(file.path)}
                >
                  <span className="file-graph-path">
                    <span className="file-graph-dir">{file.path.slice(0, slash + 1)}</span>
                    {file.path.slice(slash + 1)}
                  </span>
                  <span className="file-graph-count">{file.count}</span>
                </button>
              </li>
            );
          })}
          {picks.length === 0 ? <li className="file-graph-none">No file matches.</li> : null}
        </ul>
      </nav>
      <div className="file-graph-main">
        <div className="file-graph-bar">
          <span className="file-graph-focus">{current}</span>
          <span className="file-graph-meta">
            {links === undefined
              ? `${messages} message${messages === 1 ? "" : "s"}; no code graph, so no linked files`
              : `${linkedFiles} linked file${linkedFiles === 1 ? "" : "s"} · ${messages} message${messages === 1 ? "" : "s"}${
                  graph.hidden > 0 ? ` · ${graph.hidden} older on linked files not shown` : ""
                }`}
          </span>
        </div>
        <div
          ref={viewport}
          className="file-graph-viewport"
          role="presentation"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => {
            const size = box();
            if (size !== null) setView(fitView(size, content));
          }}
        >
          <svg className="file-graph-svg" role="img" aria-label={`Graph of ${current}`}>
            <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
              <g transform={`translate(${-bounds.minX} ${-bounds.minY})`}>
                {graph.edges.map((edge) => {
                  const a = at.get(edge.from);
                  const b = at.get(edge.to);
                  if (a === undefined || b === undefined) return null;
                  const core =
                    edge.kind === "import" && (edge.from === current || edge.to === current);
                  const on = activeId !== null && edge.from === activeId;
                  const direct = edge.kind === "touch" && edge.to === current;
                  return (
                    <line
                      key={`${edge.from}>${edge.to}`}
                      className={`fg-edge fg-${edge.kind}${core ? " is-core" : ""}${direct ? " is-direct" : ""}${on ? " is-on" : ""}`}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                    />
                  );
                })}
                {nodes.map((node) => (
                  <g
                    key={node.id}
                    className={`fg-node fg-${node.kind}${node.role === "focus" ? " is-focus" : ""}${
                      node.direct ? " is-direct" : ""
                    }${lit.has(node.id) ? " is-on" : ""}${activeId !== null && !lit.has(node.id) ? " is-faded" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => click(node)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") click(node);
                    }}
                  >
                    <title>
                      {node.kind === "file"
                        ? `${node.id} · ${node.count} message${node.count === 1 ? "" : "s"}${
                            node.role === "focus" ? "" : ` · ${node.role}`
                          }`
                        : `${node.hit?.title ?? ""}\n${node.hit?.sessionTitle ?? ""} · ${node.hit?.label ?? ""}`}
                    </title>
                    <circle cx={node.x} cy={node.y} r={node.r} />
                    {node.kind === "file" ? (
                      <text x={node.x} y={node.y - node.r - 6} textAnchor="middle">
                        {shortName(node.id)}
                      </text>
                    ) : null}
                  </g>
                ))}
              </g>
            </g>
          </svg>
          <div className="file-graph-legend">
            <span>
              <i className="lg-file" />
              file (size = messages)
            </span>
            <span>
              <i className="lg-message" />
              message
            </span>
            <span>
              <i className="lg-import" />
              imports
            </span>
            <span>click a file to move there · drag · wheel to zoom</span>
          </div>
        </div>
      </div>
    </div>
  );
}
