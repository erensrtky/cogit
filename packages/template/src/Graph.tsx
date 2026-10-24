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
import { SessionMap } from "./SessionMap.js";
import { DrillDown, type Selection } from "./SidePanel.js";
import { layoutSessionGraph, type SessionGraph } from "./sessionLayout.js";

/**
 * The project map (Story 8.7). Level one: the sessions as a git graph, one dot
 * each. Level two: the clicked session's messages as their git graph (8.2), in
 * place, with a back control. Both levels share the same layout engine.
 */

const GraphActions = createContext<{
  selection: Selection | null;
  openSession: (sessionId: string) => void;
  openNode: (sessionId: string, messageId: string, branchId?: string) => void;
  openContinue: (sessionId: string, messageId: string) => void;
  unfold: (segmentId: string) => void;
}>({
  selection: null,
  openSession: () => {},
  openNode: () => {},
  openContinue: () => {},
  unfold: () => {},
});

type ProjectData = { model: LineageViewModel; graph: SessionGraph };
type MessagesData = { session: ViewSession; git: GitLayout };

type ProjectFlowNode = Node<ProjectData, "project">;
type MessagesFlowNode = Node<MessagesData, "messages">;
type MapFlowNode = ProjectFlowNode | MessagesFlowNode;

function ProjectBox({ data }: NodeProps<ProjectFlowNode>) {
  const { openSession, openContinue, selection } = useContext(GraphActions);
  return (
    <div className="map-node">
      <SessionMap
        model={data.model}
        graph={data.graph}
        selectedSessionId={selection?.sessionId ?? null}
        onOpen={openSession}
        onContinue={openContinue}
      />
    </div>
  );
}

function MessagesBox({ data }: NodeProps<MessagesFlowNode>) {
  const { selection, openNode, openContinue, unfold } = useContext(GraphActions);
  const own = selection?.sessionId === data.session.sessionId;
  return (
    <div className="map-node">
      <GitGraph
        git={data.git}
        selectedId={selection?.type === "node" && own ? selection.nodeId : null}
        activeSegmentId={selection?.type === "node" && own ? (selection.branchId ?? null) : null}
        onSelect={(row) => openNode(data.session.sessionId, row.message.id, row.segmentId)}
        onUnfold={unfold}
        onContinue={(continues) => openContinue(continues.sessionId, continues.id)}
      />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  project: ProjectBox,
  messages: MessagesBox,
};

function findSession(model: LineageViewModel, id: string): ViewSession | undefined {
  for (const epoch of model.epochs) {
    const session = epoch.sessions.find((candidate) => candidate.sessionId === id);
    if (session) return session;
  }
  return model.unassigned.find((session) => session.sessionId === id);
}

function Flow({ model }: { model: LineageViewModel }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [unfolded, setUnfolded] = useState<Set<string>>(() => new Set());
  const [openAll, setOpenAll] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const { expanded: fullscreen, toggle: toggleFullscreen } = useFullscreen();
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const openSession = openId === null ? undefined : findSession(model, openId);
  const head = headOf(model);
  const sessionGraph = useMemo(() => layoutSessionGraph(model), [model]);

  const messageGit = useMemo(() => {
    if (!openSession) return null;
    return layoutGitGraph(openSession.messages, {
      unfolded,
      openAll,
      headId: head?.sessionId === openSession.sessionId ? head.messageId : null,
    });
  }, [openSession, head?.sessionId, head?.messageId, unfolded, openAll]);

  /** Row the view centres on when a session opens: its newest message (HEAD). */
  const focusRow = useMemo(() => {
    if (!openSession || !messageGit || head?.sessionId !== openSession.sessionId) return null;
    const row = messageGit.rows.find(
      (candidate) => candidate.kind === "message" && candidate.message.id === head.messageId,
    );
    return row ? { x: messageGit.graphWidth / 2, y: row.y } : null;
  }, [openSession, messageGit, head?.sessionId, head?.messageId]);

  const viewKey = openSession ? `session:${openSession.sessionId}` : "project";

  const openSessionAt = useCallback((sessionId: string) => {
    setOpenId(sessionId);
    setFocusedId(`session:${sessionId}`);
    setSelection({ type: "session", sessionId });
  }, []);
  const openNode = useCallback((sessionId: string, messageId: string, branchId?: string) => {
    setOpenId(sessionId);
    setFocusedId(`node:session:${sessionId}:${messageId}`);
    setSelection({
      type: "node",
      sessionId,
      nodeId: messageId,
      ...(branchId === undefined ? {} : { branchId }),
    });
  }, []);
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
  const back = useCallback(() => {
    setOpenId(null);
    setSelection(null);
    setFocusedId(null);
  }, []);
  const selectFromOutline = useCallback((target: OutlineTarget) => {
    setFocusedId(target.focusId);
    setOpenId(target.sessionId);
    setSelection(target.selection);
  }, []);

  const actions = useMemo(
    () => ({ selection, openSession: openSessionAt, openNode, openContinue, unfold }),
    [selection, openSessionAt, openNode, openContinue, unfold],
  );

  const nodes = useMemo<MapFlowNode[]>(() => {
    if (openSession && messageGit) {
      return [
        {
          id: viewKey,
          type: "messages",
          position: { x: 0, y: 0 },
          width: messageGit.width,
          height: messageGit.height,
          style: { width: messageGit.width, height: messageGit.height },
          draggable: false,
          connectable: false,
          selectable: false,
          data: { session: openSession, git: messageGit },
        },
      ];
    }
    return [
      {
        id: "project",
        type: "project",
        position: { x: 0, y: 0 },
        width: sessionGraph.git.width,
        height: sessionGraph.git.height,
        style: { width: sessionGraph.git.width, height: sessionGraph.git.height },
        draggable: false,
        connectable: false,
        selectable: false,
        data: { model, graph: sessionGraph },
      },
    ];
  }, [openSession, messageGit, model, sessionGraph, viewKey]);

  return (
    <GraphActions.Provider value={actions}>
      <div className={fullscreen ? "map-shell is-expanded" : "map-shell"}>
        <div className="map-toolbar">
          {openSession ? (
            <button type="button" className="outline-button" onClick={back}>
              ← All sessions
            </button>
          ) : null}
          <span className="map-title" title={openSession?.title}>
            {openSession
              ? openSession.title || openSession.sessionId
              : `${sessionGraph.git.rows.length} session${
                  sessionGraph.git.rows.length === 1 ? "" : "s"
                } · click a dot to open its messages`}
          </span>
          {openSession ? (
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
            {!openSession && sessionGraph.git.rows.length === 0 ? (
              <p className="graph-status empty">No sessions recorded yet.</p>
            ) : openSession && (messageGit?.rows.length ?? 0) === 0 ? (
              <p className="graph-status empty">No messages recorded in this session yet.</p>
            ) : (
              <MapCanvas key={viewKey} nodes={nodes} focusRow={focusRow} fitWhole={!openSession} />
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
 * One React Flow canvas per level (the `key` remounts it and reframes). A live
 * data swap keeps the level, so the viewport stays where the user left it.
 */
function MapCanvas({
  nodes,
  focusRow,
  fitWhole,
}: {
  nodes: MapFlowNode[];
  /** Point to centre on when a session opens; null fits the whole graph. */
  focusRow: { x: number; y: number } | null;
  /** Frame the whole graph instead of one row (the project level). */
  fitWhole: boolean;
}) {
  const { fitView, setViewport } = useReactFlow();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const canvas = document.querySelector(".react-flow")?.getBoundingClientRect();
      if (!fitWhole && focusRow && canvas) {
        const zoom = 0.9;
        void setViewport({
          zoom,
          x: canvas.width / 2 - focusRow.x * zoom,
          y: canvas.height / 2 - focusRow.y * zoom,
        });
        return;
      }
      void fitView({ padding: fitWhole ? 0.12 : 0.15, maxZoom: 1, duration: 200 });
    }, 80);
    return () => window.clearTimeout(timer);
    // Mount only: the component is keyed by level, and a model swap must not refit.
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
