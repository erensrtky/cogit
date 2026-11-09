import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ViewFile, ViewFileLink } from "../../cli/src/view/model.js";
import {
  buildFileGraph,
  defaultFocus,
  type GraphNode,
  graphBounds,
  graphFiles,
  layoutFileGraph,
  onionGraph,
  type Peeled,
  withCommits,
} from "./fileGraph.js";
import {
  clampPan,
  fitView,
  MIN_SCALE,
  PAN_PAD,
  type PanView,
  type Size,
  zoomAt,
} from "./panZoom.js";

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
/** A thought's title under its dot, short enough to leave room for its neighbours. */
const clip = (title: string): string => (title.length > 24 ? `${title.slice(0, 23)}…` : title);

export function FileGraphView({
  files,
  codeFiles,
  links,
  focus,
  active,
  onFocus,
  onSelect,
  filesAtStart = false,
  peeledAtStart,
}: {
  files: readonly ViewFile[] | undefined;
  /** The recorded files the code graph has as code; undefined without a graph. */
  codeFiles?: readonly string[] | undefined;
  links: readonly ViewFileLink[] | undefined;
  focus: string | null;
  active: GraphTarget | null;
  onFocus: (path: string) => void;
  onSelect: (target: GraphTarget) => void;
  /** Open with the files drawn; the view opens on the sessions alone otherwise. */
  filesAtStart?: boolean;
  /** Sessions and branches open from the start (tests, a link to a message). */
  peeledAtStart?: { sessions?: readonly string[]; branches?: readonly string[] };
}) {
  const list = useMemo(() => graphFiles(files ?? [], codeFiles), [files, codeFiles]);
  const current =
    focus !== null && list.some((file) => file.path === focus) ? focus : defaultFocus(list, links);
  // The files layer: the files the shown parts touched and which imports which.
  const [showFiles, setShowFiles] = useState(filesAtStart);
  // Peeled like an onion: sessions first, a click opens one into its branches,
  // a branch into its messages, and a click on an opened hub folds it again.
  const [peeled, setPeeled] = useState<Peeled>(() => ({
    sessions: new Set(peeledAtStart?.sessions ?? []),
    branches: new Set(peeledAtStart?.branches ?? []),
  }));
  // The commits layer: a square per commit, tied to the thought that landed it.
  const [showCommits, setShowCommits] = useState(false);
  const full = useMemo(
    () => (current === undefined ? null : buildFileGraph(list, links, current)),
    [list, links, current],
  );
  const graph = useMemo(() => {
    if (full === null || current === undefined) return null;
    const base = onionGraph(full, current, peeled, showFiles);
    return showCommits ? withCommits(base) : base;
  }, [full, current, peeled, showFiles, showCommits]);
  const nodes = useMemo(() => (graph === null ? [] : layoutFileGraph(graph)), [graph]);
  const bounds = useMemo(() => graphBounds(nodes), [nodes]);
  const at = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const viewport = useRef<HTMLDivElement>(null);
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
      if (size !== null) setView(fitView(size, content, PAN_PAD, MIN_SCALE));
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

  const openMessage = active === null ? null : `${active.sessionId}:${active.messageId}`;
  // The open message, or the folded session or branch that holds it.
  const activeId =
    openMessage === null || at.has(openMessage)
      ? openMessage
      : (nodes.find((node) => !node.open && node.members?.includes(openMessage))?.id ?? null);
  const lit = new Set<string>();
  if (activeId !== null && at.has(activeId)) {
    lit.add(activeId);
    for (const edge of graph.edges) {
      if (edge.from === activeId) lit.add(edge.to);
      if (edge.kind === "share" && edge.to === activeId) lit.add(edge.from);
    }
    // The files a lit commit changed light up with it.
    for (const edge of graph.edges) {
      if (edge.kind === "changed" && lit.has(edge.from)) lit.add(edge.to);
    }
  }
  const fileNodes = (full?.nodes ?? []).filter((node) => node.kind === "file");
  const linkedFiles = fileNodes.length - 1;
  const messages = (full?.nodes.length ?? 0) - fileNodes.length;
  const sessions = new Set(
    (full?.nodes ?? []).flatMap((node) => (node.hit === undefined ? [] : [node.hit.sessionId])),
  ).size;
  const toggle = (kind: "sessions" | "branches", key: string) =>
    setPeeled((now) => {
      const next = new Set(now[kind]);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...now, [kind]: next };
    });
  const click = (node: GraphNode) => {
    if (dragged.current) return;
    if (node.kind === "file") onFocus(node.id);
    else if (node.kind === "session") toggle("sessions", node.id.slice("session:".length));
    else if (node.kind === "branch") toggle("branches", node.id.slice("branch:".length));
    else if (node.kind === "commit") {
      // A commit opens the message that landed it, even from inside a folded layer.
      const hash = node.commits?.[0];
      const landed = (full?.nodes ?? []).find(
        (other) => other.kind === "message" && hash !== undefined && other.commits?.includes(hash),
      )?.hit;
      if (landed !== undefined)
        onSelect({ sessionId: landed.sessionId, messageId: landed.messageId });
    } else if (node.hit !== undefined)
      onSelect({ sessionId: node.hit.sessionId, messageId: node.hit.messageId });
  };

  return (
    <div className="file-graph">
      <div className="file-graph-main">
        <div className="file-graph-bar">
          <label
            className="file-graph-show"
            title="Draw the files the thoughts touched, and which file imports which"
          >
            <input
              type="checkbox"
              checked={showFiles}
              onChange={(event) => setShowFiles(event.target.checked)}
            />
            Show files
          </label>
          <label
            className="file-graph-show"
            title="Draw the commits the thoughts landed, each tied to its thought"
          >
            <input
              type="checkbox"
              checked={showCommits}
              onChange={(event) => setShowCommits(event.target.checked)}
            />
            Show commits
          </label>
          <span className="file-graph-focus">{current}</span>
          <span className="file-graph-meta">
            {links === undefined
              ? `${sessions} session${sessions === 1 ? "" : "s"} · ${messages} message${messages === 1 ? "" : "s"}; no code graph, so no linked files`
              : `${linkedFiles} linked file${linkedFiles === 1 ? "" : "s"} · ${sessions} session${sessions === 1 ? "" : "s"} · ${messages} message${messages === 1 ? "" : "s"}${
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
            if (size !== null) setView(fitView(size, content, PAN_PAD, MIN_SCALE));
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
                  const on =
                    activeId !== null &&
                    (edge.from === activeId ||
                      (edge.kind === "share" && edge.to === activeId) ||
                      (edge.kind === "changed" && lit.has(edge.from)));
                  const direct = edge.kind === "touch" && edge.to === current;
                  return (
                    <line
                      key={`${edge.from}>${edge.to}`}
                      className={`fg-edge fg-${edge.kind}${core ? " is-core" : ""}${direct ? " is-direct" : ""}${on ? " is-on" : ""}`}
                      style={
                        edge.kind === "share"
                          ? { strokeWidth: Math.min(4, 0.8 + (edge.weight ?? 1) * 0.6) }
                          : undefined
                      }
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
                    }${node.open ? " is-open" : ""}${lit.has(node.id) ? " is-on" : ""}${activeId !== null && !lit.has(node.id) ? " is-faded" : ""}`}
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
                        : node.kind === "commit"
                          ? `commit ${node.commits?.[0] ?? ""}`
                          : node.kind === "session" || node.kind === "branch"
                            ? `${node.label ?? ""}\n${node.kind} · ${node.members?.length ?? 0} message${
                                node.members?.length === 1 ? "" : "s"
                              } · click to ${node.open ? "fold" : "open"}${
                                node.commits?.length ? `\ncommits: ${node.commits.join(" ")}` : ""
                              }`
                            : `${node.hit?.title ?? ""}\n${node.hit?.sessionTitle ?? ""} · ${node.hit?.label ?? ""}${
                                node.commits?.length ? `\ncommits: ${node.commits.join(" ")}` : ""
                              }`}
                    </title>
                    {node.kind === "commit" ? (
                      <rect
                        x={node.x - node.r}
                        y={node.y - node.r}
                        width={node.r * 2}
                        height={node.r * 2}
                      />
                    ) : (
                      <circle cx={node.x} cy={node.y} r={node.r} />
                    )}
                    {node.kind !== "file" &&
                    node.kind !== "commit" &&
                    !node.open &&
                    node.commits?.length ? (
                      // A ring: this landed code.
                      <circle className="fg-ring" cx={node.x} cy={node.y} r={node.r + 3} />
                    ) : null}
                    {node.kind === "commit" ? (
                      lit.has(node.id) ? (
                        <text
                          className="fg-label"
                          x={node.x}
                          y={node.y + node.r + 11}
                          textAnchor="middle"
                        >
                          {node.commits?.[0]}
                        </text>
                      ) : null
                    ) : node.kind === "file" ? (
                      <text x={node.x} y={node.y - node.r - 6} textAnchor="middle">
                        {shortName(node.id)}
                      </text>
                    ) : node.kind === "session" || node.kind === "branch" ? (
                      // Sessions and branches always carry their title; an opened hub above it.
                      <text
                        className={`fg-label fg-label-${node.kind}`}
                        x={node.x}
                        y={node.open ? node.y - node.r - 6 : node.y + node.r + 12}
                        textAnchor="middle"
                      >
                        {clip(node.label ?? "")}
                      </text>
                    ) : !showFiles || lit.has(node.id) ? (
                      // Messages carry their title; with the files drawn, only the lit ones.
                      <text
                        className="fg-label"
                        x={node.x}
                        y={node.y + node.r + 11}
                        textAnchor="middle"
                      >
                        {clip(node.hit?.title ?? "")}
                      </text>
                    ) : null}
                  </g>
                ))}
              </g>
            </g>
          </svg>
          <div className="file-graph-legend">
            <span>
              <i className="lg-session" />
              session
            </span>
            <span>
              <i className="lg-branch" />
              branch
            </span>
            <span>
              <i className="lg-message lg-muted" />
              message
            </span>
            <span>
              <i className="lg-message" />
              touched {shortName(current)}
            </span>
            <span>
              <i className="lg-landed" />
              landed a commit
            </span>
            {showFiles ? (
              <>
                <span>
                  <i className="lg-file" />
                  file
                </span>
                <span>
                  <i className="lg-import" />
                  imports
                </span>
              </>
            ) : (
              <span>
                <i className="lg-import" />
                shared files (thicker = more)
              </span>
            )}
            <span>
              click a session or branch to open it, its hub to fold it · drag · wheel to zoom
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
