import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ViewFile, ViewFileLink } from "../../cli/src/view/model.js";
import {
  branchKey,
  buildFileGraph,
  buildProjectGraph,
  type GraphNode,
  graphBounds,
  graphFiles,
  layoutFileGraph,
  NO_BRANCH,
  type OnionView,
  onionGraph,
  type Peeled,
  withCommits,
} from "./fileGraph.js";
import { LANE_COLORS } from "./gitLayout.js";
import {
  clampPan,
  fitView,
  MIN_SCALE,
  PAN_PAD,
  type PanView,
  type Size,
  zoomAt,
} from "./panZoom.js";
import { readViewMemory, rememberView } from "./viewMemory.js";

/**
 * The Graph view: the work recorded on the project's code, peeled like an
 * onion from sessions to branches to messages. With a file in focus it narrows
 * to the work on that file and the files it imports or is imported by. A
 * message click opens the same drill-down a dot click on the git view gives.
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
  filesAtStart,
  peeledAtStart,
  insideAtStart,
  memoryKey,
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
  /** Opened in place from the start, with these sessions and branches open (tests). */
  peeledAtStart?: { sessions?: readonly string[]; branches?: readonly string[] };
  /** Inside this session, or one of its branches, from the start (tests). */
  insideAtStart?: OnionView["inside"];
  /** The project's path: the view remembers its layers and place under it (viewMemory.ts). */
  memoryKey?: string;
}) {
  const list = useMemo(() => graphFiles(files ?? [], codeFiles), [files, codeFiles]);
  // No file in focus: the whole project.
  const current = focus !== null && list.some((file) => file.path === focus) ? focus : undefined;
  // Where the viewer left this view (viewMemory.ts), unless the caller says.
  const [memory] = useState(() => (memoryKey === undefined ? {} : readViewMemory(memoryKey)));
  // The files layer: the files the shown parts touched and which imports which.
  const [showFiles, setShowFiles] = useState(filesAtStart ?? memory.showFiles ?? false);
  // Peeled like an onion: sessions first, a click goes inside one (its
  // branches), then inside a branch (its messages); the trail or Esc goes back.
  const [inside, setInside] = useState<OnionView["inside"]>(
    insideAtStart ?? memory.inside ?? undefined,
  );
  // The other way: open in place, with an opened hub that folds on a click.
  const [inPlace, setInPlace] = useState(peeledAtStart !== undefined || (memory.inPlace ?? false));
  const [peeled, setPeeled] = useState<Peeled>(() => ({
    sessions: new Set(peeledAtStart?.sessions ?? memory.peeledSessions ?? []),
    branches: new Set(peeledAtStart?.branches ?? memory.peeledBranches ?? []),
  }));
  // The commits layer: a square per commit, tied to the thought that landed it.
  const [showCommits, setShowCommits] = useState(memory.showCommits ?? false);
  useEffect(() => {
    if (memoryKey === undefined) return;
    rememberView(memoryKey, {
      showFiles,
      showCommits,
      inPlace,
      inside: inside ?? null,
      peeledSessions: [...peeled.sessions],
      peeledBranches: [...peeled.branches],
    });
  }, [memoryKey, showFiles, showCommits, inPlace, inside, peeled]);
  const full = useMemo(
    () =>
      list.length === 0
        ? null
        : current === undefined
          ? buildProjectGraph(list, links)
          : buildFileGraph(list, links, current),
    [list, links, current],
  );
  // A remembered place whose session is gone from the picture falls back to the outside.
  const here = useMemo(
    () =>
      inside !== undefined &&
      (full?.nodes ?? []).some(
        (node) =>
          node.hit?.sessionId === inside.session &&
          (inside.branch === undefined || branchKey(node.hit) === inside.branch),
      )
        ? inside
        : undefined,
    [full, inside],
  );
  const graph = useMemo(() => {
    if (full === null) return null;
    const base = onionGraph(full, current, inPlace ? { peeled } : { inside: here }, showFiles);
    return showCommits ? withCommits(base) : base;
  }, [full, current, inPlace, here, peeled, showFiles, showCommits]);
  // A new file in focus starts from the outside again; the first render keeps
  // the place it was restored to.
  const shownFor = useRef(current);
  useEffect(() => {
    if (shownFor.current === current) return;
    shownFor.current = current;
    setInside(undefined);
  }, [current]);
  // Esc steps back out one layer.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || inPlace) return;
      setInside((now) => (now?.branch !== undefined ? { session: now.session } : undefined));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inPlace]);
  // Where each node was last drawn. A layer turned on or off (files, commits, a
  // part opened in place) keeps the rest where it was; a new focus file or a
  // step into a session or branch is a new picture and starts afresh.
  const picture = `${current ?? ""}\n${here?.session ?? ""}\n${here?.branch ?? ""}`;
  const placed = useRef<{ picture: string; at: Map<string, { x: number; y: number }> }>({
    picture: "",
    at: new Map(),
  });
  const nodes = useMemo(() => {
    if (graph === null) return [];
    const previous = placed.current.picture === picture ? placed.current.at : undefined;
    const laid = layoutFileGraph(graph, previous);
    placed.current = {
      picture,
      at: new Map(laid.map((node) => [node.id, { x: node.x, y: node.y }])),
    };
    return laid;
  }, [graph, picture]);
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

  if (graph === null)
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
  const linkedFiles = current === undefined ? fileNodes.length : fileNodes.length - 1;
  const messages = (full?.nodes.length ?? 0) - fileNodes.length;
  const sessions = new Set(
    (full?.nodes ?? []).flatMap((node) => (node.hit === undefined ? [] : [node.hit.sessionId])),
  ).size;
  // The trail's names: a session's title, or a branch's within it.
  const titleOf = (session: string, branch: string | undefined): string => {
    const hit = (full?.nodes ?? []).find(
      (node) =>
        node.hit?.sessionId === session && (branch === undefined || branchKey(node.hit) === branch),
    )?.hit;
    if (branch === undefined) return hit?.sessionTitle ?? session;
    return hit?.branch ?? NO_BRANCH;
  };
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
    else if (node.kind === "session") {
      const session = node.id.slice("session:".length);
      if (inPlace) toggle("sessions", session);
      else setInside({ session });
    } else if (node.kind === "branch") {
      const key = node.id.slice("branch:".length);
      if (inPlace) toggle("branches", key);
      else setInside({ session: key.slice(0, key.indexOf("|")), branch: key });
    } else if (node.kind === "commit") {
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
          {/* Only on the outermost layer: inside a session or branch it has nothing to open. */}
          {here === undefined ? (
            <label
              className="file-graph-show"
              title="Open sessions and branches where they are, keeping the others around them"
            >
              <input
                type="checkbox"
                checked={inPlace}
                onChange={(event) => setInPlace(event.target.checked)}
              />
              Open in place
            </label>
          ) : null}
          <span className="file-graph-focus">{current ?? "Whole project"}</span>
          <span className="file-graph-meta">
            {current === undefined
              ? `${linkedFiles} code file${linkedFiles === 1 ? "" : "s"} · ${sessions} session${sessions === 1 ? "" : "s"} · ${messages} message${messages === 1 ? "" : "s"}`
              : links === undefined
                ? `${sessions} session${sessions === 1 ? "" : "s"} · ${messages} message${messages === 1 ? "" : "s"}; no code graph, so no linked files`
                : `${linkedFiles} linked file${linkedFiles === 1 ? "" : "s"} · ${sessions} session${sessions === 1 ? "" : "s"} · ${messages} message${messages === 1 ? "" : "s"}${
                    graph.hidden > 0 ? ` · ${graph.hidden} older on linked files not shown` : ""
                  }`}
          </span>
        </div>
        {!inPlace ? (
          <nav className="file-graph-trail" aria-label="Where you are">
            <button
              type="button"
              aria-current={here === undefined ? "true" : undefined}
              onClick={() => setInside(undefined)}
            >
              All sessions
            </button>
            {here === undefined ? null : (
              <>
                <span aria-hidden="true">›</span>
                <button
                  type="button"
                  aria-current={here.branch === undefined ? "true" : undefined}
                  onClick={() => setInside({ session: here.session })}
                >
                  {titleOf(here.session, undefined)}
                </button>
              </>
            )}
            {here?.branch === undefined ? null : (
              <>
                <span aria-hidden="true">›</span>
                <button type="button" aria-current="true">
                  {titleOf(here.session, here.branch)}
                </button>
              </>
            )}
            {here === undefined ? null : <span className="file-graph-hint">Esc to step back</span>}
          </nav>
        ) : null}
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
          <svg
            className="file-graph-svg"
            role="img"
            aria-label={`Graph of ${current ?? "the whole project"}`}
          >
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
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={node.r}
                        // A session opened in place, or a branch inside one, keeps its lane colour.
                        style={
                          node.tone === undefined
                            ? undefined
                            : { fill: `var(--l${node.tone % LANE_COLORS})` }
                        }
                      />
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
            {current === undefined ? null : (
              <span>
                <i className="lg-focus" />
                touched {shortName(current)}
              </span>
            )}
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
              {inPlace
                ? "click a session or branch to open it, its hub to fold it"
                : "click a session or branch to go inside"}{" "}
              · drag · wheel to zoom
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
