import {
  Background,
  Controls,
  MiniMap,
  type Node,
  type NodeProps,
  type NodeTypes,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { LineageViewModel, ViewSession } from "../../cli/src/view/model.js";
import { useFullscreen } from "./fullscreen.js";
import { GitGraph } from "./GitGraph.js";
import { type GitLayout, layoutGitGraph } from "./gitLayout.js";
import { headOf } from "./graph.js";
import { Outline, type OutlineTarget } from "./Outline.js";
import { OPEN_LINK_DROP, SessionMap } from "./SessionMap.js";
import { DrillDown, type Selection } from "./SidePanel.js";
import { layoutSessionGraph, type SessionGraph } from "./sessionLayout.js";

/**
 * The project map (Story 8.7). The sessions are a git graph, one dot each;
 * clicking a session opens its messages as their own git graph (8.2) right below
 * its row, accordion-style: the other sessions stay where they are and the ones
 * below move down. Several sessions can be open; clicking again closes one.
 * Both levels share the same layout engine.
 */

/** Gap between a session row and its opened messages, and below them. */
const OPEN_TOP = OPEN_LINK_DROP - 12;
const OPEN_BOTTOM = 20;
/** Room for the "no messages yet" line of an opened session with none. */
const OPEN_EMPTY = 36;

const GraphActions = createContext<{
  selection: Selection | null;
  openIds: ReadonlySet<string>;
  openSession: (sessionId: string) => void;
  openNode: (sessionId: string, messageId: string, branchId?: string) => void;
  openContinue: (sessionId: string, messageId: string) => void;
  unfold: (segmentId: string) => void;
}>({
  selection: null,
  openIds: new Set(),
  openSession: () => {},
  openNode: () => {},
  openContinue: () => {},
  unfold: () => {},
});

/** An opened session: its message graph and where it sits on the canvas. */
type Opening = { session: ViewSession; git: GitLayout; top: number; left: number };
type ProjectData = { model: LineageViewModel; graph: SessionGraph; openings: Opening[] };

type ProjectFlowNode = Node<ProjectData, "project">;
type MapFlowNode = ProjectFlowNode;

function SessionMessages({ session, git }: { session: ViewSession; git: GitLayout }) {
  const { selection, openNode, openContinue, unfold } = useContext(GraphActions);
  const own = selection?.sessionId === session.sessionId;
  if (git.rows.length === 0)
    return <p className="graph-status empty">No messages recorded in this session yet.</p>;
  return (
    <GitGraph
      git={git}
      selectedId={selection?.type === "node" && own ? selection.nodeId : null}
      activeSegmentId={selection?.type === "node" && own ? (selection.branchId ?? null) : null}
      onSelect={(row) => openNode(session.sessionId, row.message.id, row.segmentId)}
      onUnfold={unfold}
      onContinue={(continues) => openContinue(continues.sessionId, continues.id)}
    />
  );
}

function ProjectBox({ data }: NodeProps<ProjectFlowNode>) {
  const { openSession, openContinue, selection, openIds } = useContext(GraphActions);
  return (
    <div className="map-node">
      <SessionMap
        model={data.model}
        graph={data.graph}
        selectedSessionId={selection?.sessionId ?? null}
        openIds={openIds}
        onOpen={openSession}
        onContinue={openContinue}
      />
      {data.openings.map((opening) => (
        <div
          key={opening.session.sessionId}
          className="session-open"
          style={{ top: opening.top, left: opening.left }}
        >
          <SessionMessages session={opening.session} git={opening.git} />
        </div>
      ))}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  project: ProjectBox,
};

/**
 * The place a URL asks for. `#s=<sessionId>&m=<messageId>` (Story 8.8:
 * `codelineage blame` prints such a URL) opens that session and message;
 * `#focus=head` is what the project switcher uses (8.12) — the newest message,
 * i.e. where the work left off. The session opens and the message's drill-down
 * is shown; a message id the record no longer holds opens the session.
 */
type Target = { sessionId: string; messageId?: string; quiet?: boolean };

/** "Left off here": the newest session and its newest message. */
function headTarget(model: LineageViewModel, quiet: boolean): Target | null {
  const head = headOf(model);
  if (head === null) return null;
  const target: Target =
    head.messageId === null
      ? { sessionId: head.sessionId }
      : { sessionId: head.sessionId, messageId: head.messageId };
  return quiet ? { ...target, quiet } : target;
}

/**
 * With no hash the map opens where the work left off: the newest session
 * unfolds and the view centres on its newest message, without opening the
 * side panel (`quiet`).
 */
function readTarget(model: LineageViewModel): Target | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (!params.has("focus") && !params.has("s")) return headTarget(model, true);
  if (params.get("focus") === "head") {
    const head = headOf(model);
    if (head === null) return null;
    return head.messageId === null
      ? { sessionId: head.sessionId }
      : { sessionId: head.sessionId, messageId: head.messageId };
  }
  const sessionId = params.get("s");
  if (sessionId === null || sessionId === "") return null;
  const session = findSession(model, sessionId);
  if (session === undefined) return null;
  const messageId = params.get("m");
  if (messageId !== null && session.messages.some((message) => message.id === messageId))
    return { sessionId, messageId };
  return { sessionId };
}

function findSession(model: LineageViewModel, id: string): ViewSession | undefined {
  for (const epoch of model.epochs) {
    const session = epoch.sessions.find((candidate) => candidate.sessionId === id);
    if (session) return session;
  }
  return model.unassigned.find((session) => session.sessionId === id);
}

function Flow({ model }: { model: LineageViewModel }) {
  // Read once: a live data swap must not move the page back to the hash target.
  const [initial] = useState(() => readTarget(model));
  useEffect(() => {
    // Land on the map, not on the page header, when it opens at a message.
    if (initial?.messageId !== undefined)
      document.querySelector(".lineage-map")?.scrollIntoView({ block: "start" });
  }, [initial]);
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(
    () => new Set(initial === null ? [] : [initial.sessionId]),
  );
  const [selection, setSelection] = useState<Selection | null>(() => {
    if (initial === null || initial.quiet) return null;
    if (initial.messageId === undefined) return { type: "session", sessionId: initial.sessionId };
    return { type: "node", sessionId: initial.sessionId, nodeId: initial.messageId };
  });
  const [unfolded, setUnfolded] = useState<Set<string>>(() => new Set());
  const [openAll, setOpenAll] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const { expanded: fullscreen, toggle: toggleFullscreen } = useFullscreen();
  const [focusedId, setFocusedId] = useState<string | null>(() => {
    if (initial === null) return null;
    if (initial.messageId === undefined) return `session:${initial.sessionId}`;
    return `node:session:${initial.sessionId}:${initial.messageId}`;
  });

  const head = headOf(model);

  /** The open drill-down's message, if any. */
  const target = selection?.type === "node" ? selection : null;

  /** Message graph of every open session. */
  const messageGits = useMemo(() => {
    const out = new Map<string, GitLayout>();
    for (const sessionId of openIds) {
      const session = findSession(model, sessionId);
      if (!session) continue;
      const options = {
        unfolded,
        openAll,
        headId: head?.sessionId === sessionId ? head.messageId : null,
      };
      let layout = layoutGitGraph(session.messages, options);
      const targetId = target?.sessionId === sessionId ? target.nodeId : null;
      if (
        targetId !== null &&
        !layout.rows.some((row) => row.kind === "message" && row.message.id === targetId)
      ) {
        // A deep link (`blame` prints one) may point inside a folded branch: open it
        // rather than letting the page land on a row the user cannot see.
        const segment = layout.segments.find((candidate) => candidate.ids.includes(targetId));
        if (segment !== undefined)
          layout = layoutGitGraph(session.messages, {
            ...options,
            unfolded: new Set([...unfolded, segment.id]),
          });
      }
      out.set(sessionId, layout);
    }
    return out;
  }, [
    model,
    openIds,
    unfolded,
    openAll,
    head?.sessionId,
    head?.messageId,
    target?.sessionId,
    target?.nodeId,
  ]);

  /** Room under each open session's row for its messages. */
  const spaceAfter = useMemo(() => {
    const out = new Map<string, number>();
    for (const [sessionId, git] of messageGits)
      out.set(
        sessionId,
        OPEN_TOP + (git.rows.length === 0 ? OPEN_EMPTY : git.height) + OPEN_BOTTOM,
      );
    return out;
  }, [messageGits]);

  const sessionGraph = useMemo(() => layoutSessionGraph(model, spaceAfter), [model, spaceAfter]);

  const openings = useMemo(() => {
    const out: Opening[] = [];
    for (const row of sessionGraph.git.rows) {
      if (row.kind !== "message" || row.spaceTop === undefined) continue;
      const session = sessionGraph.sessions.get(row.message.id);
      const git = messageGits.get(row.message.id);
      if (!session || !git) continue;
      out.push({
        session,
        git,
        top: row.spaceTop + OPEN_TOP,
        left: sessionGraph.git.graphWidth + 8,
      });
    }
    return out;
  }, [sessionGraph, messageGits]);

  /** Canvas point of a message in an open session, or null when it is not drawn. */
  const pointOf = useCallback(
    (sessionId: string, messageId: string | undefined) => {
      if (messageId === undefined) return null;
      const opening = openings.find((candidate) => candidate.session.sessionId === sessionId);
      const row = opening?.git.rows.find(
        (candidate) => candidate.kind === "message" && candidate.message.id === messageId,
      );
      if (!opening || !row) return null;
      return { x: opening.left + opening.git.graphWidth / 2, y: opening.top + row.y };
    },
    [openings],
  );

  /** Where the view centres on load: the target message, else the whole map. */
  const focusRow = useMemo(
    () => (initial === null ? null : pointOf(initial.sessionId, initial.messageId)),
    [initial, pointOf],
  );

  /** "Left off here" button: a request to centre on HEAD, re-sent on every click. */
  const [jumps, setJumps] = useState(0);
  const leftOff = useMemo(() => headTarget(model, true), [model]);
  const jump = useMemo(
    () =>
      jumps === 0 || leftOff === null
        ? null
        : { key: jumps, point: pointOf(leftOff.sessionId, leftOff.messageId) },
    [jumps, leftOff, pointOf],
  );

  const ensureOpen = useCallback((sessionId: string) => {
    setOpenIds((previous) =>
      previous.has(sessionId) ? previous : new Set([...previous, sessionId]),
    );
  }, []);
  const toggleSession = useCallback(
    (sessionId: string) => {
      if (openIds.has(sessionId)) {
        const next = new Set(openIds);
        next.delete(sessionId);
        setOpenIds(next);
        setSelection((previous) => (previous?.sessionId === sessionId ? null : previous));
        return;
      }
      // Opening only unfolds the accordion; the side panel waits for a message click
      // so it does not cover the messages that just opened.
      setOpenIds(new Set([...openIds, sessionId]));
      setFocusedId(`session:${sessionId}`);
    },
    [openIds],
  );
  const openNode = useCallback(
    (sessionId: string, messageId: string, branchId?: string) => {
      ensureOpen(sessionId);
      setFocusedId(`node:session:${sessionId}:${messageId}`);
      setSelection({
        type: "node",
        sessionId,
        nodeId: messageId,
        ...(branchId === undefined ? {} : { branchId }),
      });
    },
    [ensureOpen],
  );
  const openContinue = useCallback(
    (sessionId: string, messageId: string) => openNode(sessionId, messageId),
    [openNode],
  );
  const unfold = useCallback((segmentId: string) => {
    setUnfolded((previous) => {
      const next = new Set(previous);
      next.add(segmentId);
      return next;
    });
  }, []);
  const selectFromOutline = useCallback(
    (target: OutlineTarget) => {
      setFocusedId(target.focusId);
      if (target.sessionId !== null) ensureOpen(target.sessionId);
      setSelection(target.selection);
    },
    [ensureOpen],
  );

  const actions = useMemo(
    () => ({ selection, openIds, openSession: toggleSession, openNode, openContinue, unfold }),
    [selection, openIds, toggleSession, openNode, openContinue, unfold],
  );

  const nodes = useMemo<MapFlowNode[]>(() => {
    const width = Math.max(
      sessionGraph.git.width,
      ...openings.map((opening) => opening.left + opening.git.width),
    );
    return [
      {
        id: "project",
        type: "project",
        position: { x: 0, y: 0 },
        width,
        height: sessionGraph.git.height,
        style: { width, height: sessionGraph.git.height },
        draggable: false,
        connectable: false,
        selectable: false,
        data: { model, graph: sessionGraph, openings },
      },
    ];
  }, [model, sessionGraph, openings]);

  return (
    <GraphActions.Provider value={actions}>
      <div className={fullscreen ? "map-shell is-expanded" : "map-shell"}>
        <div className="map-toolbar">
          <span className="map-title">
            {`${sessionGraph.git.rows.length} session${
              sessionGraph.git.rows.length === 1 ? "" : "s"
            } · click a session to open or close its messages`}
          </span>
          {leftOff ? (
            <button
              type="button"
              className="outline-button"
              title="Open the newest session and go to its newest message"
              onClick={() => {
                ensureOpen(leftOff.sessionId);
                setJumps((value) => value + 1);
                document.querySelector(".lineage-map")?.scrollIntoView({ block: "start" });
              }}
            >
              ↧ Left off here
            </button>
          ) : null}
          {openIds.size > 0 ? (
            <button
              type="button"
              className="outline-button"
              aria-pressed={openAll}
              onClick={() => {
                setOpenAll((value) => !value);
                setUnfolded(new Set());
              }}
            >
              {openAll ? "Fold all" : "Unfold all"}
            </button>
          ) : null}
          <button
            type="button"
            className="outline-button"
            aria-pressed={fullscreen}
            onClick={toggleFullscreen}
          >
            {fullscreen ? "Exit full screen" : "Full screen"}
          </button>
          <button
            type="button"
            className="outline-button"
            aria-pressed={showOutline}
            onClick={() => setShowOutline((value) => !value)}
          >
            {showOutline ? "Hide outline" : "Show outline"}
          </button>
        </div>
        <div className="graph-wrap">
          {showOutline ? (
            <Outline
              model={model}
              activeId={focusedId}
              onSelect={selectFromOutline}
              onClose={() => setShowOutline(false)}
            />
          ) : null}
          <div className="graph-canvas">
            {sessionGraph.git.rows.length === 0 ? (
              <p className="graph-status empty">No sessions recorded yet.</p>
            ) : (
              <MapCanvas nodes={nodes} focusRow={focusRow} jump={jump} />
            )}
            <DrillDown
              model={model}
              selection={selection}
              onClose={() => setSelection(null)}
              onNavigate={selectFromOutline}
            />
          </div>
        </div>
      </div>
    </GraphActions.Provider>
  );
}

/**
 * One React Flow canvas for the whole map. It frames the map once on load (or
 * centres a deep-linked message); opening or closing a session and live data
 * swaps leave the viewport where the user put it.
 */
function MapCanvas({
  nodes,
  focusRow,
  jump,
}: {
  nodes: MapFlowNode[];
  /** Point to centre on at load; null fits the whole graph. */
  focusRow: { x: number; y: number } | null;
  /** A user request to centre on a point; a new `key` moves the view again. */
  jump: { key: number; point: { x: number; y: number } | null } | null;
}) {
  const { fitView, setViewport } = useReactFlow();

  const jumpKey = jump?.key ?? 0;
  const jumpX = jump?.point?.x;
  const jumpY = jump?.point?.y;
  useEffect(() => {
    if (jumpKey === 0 || jumpX === undefined || jumpY === undefined) return;
    const canvas = document.querySelector(".react-flow")?.getBoundingClientRect();
    if (!canvas) return;
    const zoom = 0.9;
    void setViewport(
      { zoom, x: canvas.width / 2 - jumpX * zoom, y: canvas.height / 2 - jumpY * zoom },
      { duration: 300 },
    );
    // Only a new click moves the view; a live data swap must not.
  }, [jumpKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const canvas = document.querySelector(".react-flow")?.getBoundingClientRect();
      if (focusRow && canvas) {
        const zoom = 0.9;
        void setViewport({
          zoom,
          x: canvas.width / 2 - focusRow.x * zoom,
          y: canvas.height / 2 - focusRow.y * zoom,
        });
        return;
      }
      void fitView({ padding: 0.12, maxZoom: 1, duration: 200 });
    }, 80);
    return () => window.clearTimeout(timer);
    // Mount only: opening a session or a model swap must not refit.
  }, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={[]}
      nodeTypes={nodeTypes}
      fitView
      panOnScroll
      minZoom={0.05}
      maxZoom={2}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      colorMode="dark"
    >
      <Background gap={24} size={1} color="#242a36" />
      <MiniMap pannable zoomable nodeColor={() => "#243040"} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

/** The project map: sessions at the top, a session's messages in place. */
export function Graph({ model }: { model: LineageViewModel }) {
  return (
    <section className="lineage-map" aria-label="Project lineage graph">
      <ReactFlowProvider>
        <Flow model={model} />
      </ReactFlowProvider>
    </section>
  );
}
