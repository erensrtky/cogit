import {
  Background,
  Controls,
  Handle,
  MiniMap,
  type NodeMouseHandler,
  type NodeProps,
  type NodeTypes,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { LineageViewModel } from "../../cli/src/view/model.js";
import { formatDate, formatTime } from "./format.js";
import { useFullscreen } from "./fullscreen.js";
import { GitGraph } from "./GitGraph.js";
import type { GitMessageRow } from "./gitLayout.js";
import {
  absolutePosition,
  defaultExpanded,
  type EpochFlowNode,
  GROUP_INSET,
  type GraphNode,
  headOf,
  layoutGraph,
  nodeId,
  SESSION_GROUP_HEADER,
  type SessionFlowNode,
  sessionId as sessionKey,
} from "./graph.js";
import { Outline, type OutlineTarget, outlinePath } from "./Outline.js";
import { DrillDown, type Selection } from "./SidePanel.js";

/** Row clicks and group toggles reach the shared state without prop threading. */
const GraphActions = createContext<{
  toggle: (id: string) => void;
  openRow: (sessionId: string, messageId: string, segmentId: string) => void;
  /** Opens another session at one of its messages (a "continues" mark, 8.6). */
  openContinue: (sessionId: string, messageId: string) => void;
  unfold: (segmentId: string) => void;
  selection: Selection | null;
}>({
  toggle: () => {},
  openRow: () => {},
  openContinue: () => {},
  unfold: () => {},
  selection: null,
});

function GroupToggle({
  id,
  data,
}: {
  id: string;
  data: { expanded: boolean; hasChildren: boolean };
}) {
  const { toggle } = useContext(GraphActions);
  if (!data.hasChildren) return <span className="group-toggle is-empty">·</span>;
  return (
    <button
      type="button"
      className="group-toggle"
      aria-expanded={data.expanded}
      aria-label={data.expanded ? "Collapse" : "Expand"}
      onClick={(event) => {
        event.stopPropagation();
        toggle(id);
      }}
    >
      {data.expanded ? "▾" : "▸"}
    </button>
  );
}

/** Edges need handles; they are invisible because the layout owns the geometry. */
function AnchorHandles() {
  return (
    <>
      <Handle type="target" position={Position.Top} className="flow-handle" isConnectable={false} />
      <Handle
        type="source"
        position={Position.Bottom}
        className="flow-handle"
        isConnectable={false}
      />
    </>
  );
}

function EpochNode({ id, data }: NodeProps<EpochFlowNode>) {
  return (
    <div className="flow-group epoch-group">
      <AnchorHandles />
      <div className="group-head">
        <GroupToggle id={id} data={data} />
        <strong className="group-title">{data.title}</strong>
        <span className="muted">
          {data.count} session{data.count === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

function SessionNode({ id, data }: NodeProps<SessionFlowNode>) {
  const { selection, openRow, openContinue, unfold } = useContext(GraphActions);
  const selectedId =
    selection?.type === "node" && selection.sessionId === data.sessionId ? selection.nodeId : null;
  const activeSegmentId =
    selection?.type === "node" && selection.sessionId === data.sessionId
      ? (selection.branchId ?? null)
      : null;
  return (
    <div className="flow-group session-group" title={data.goal || data.title}>
      <AnchorHandles />
      <div className="group-head">
        <GroupToggle id={id} data={data} />
        <strong className="group-title">{data.title}</strong>
        <span className="muted">{data.count}</span>
        {data.unrecorded ? (
          <span className="muted unrecorded" title="The SessionEnd catch-up is off">
            {data.unrecorded} not recorded
          </span>
        ) : null}
        <time className="muted" dateTime={data.updatedAt} title={formatTime(data.updatedAt)}>
          {formatDate(data.updatedAt)}
        </time>
      </div>
      {data.git ? (
        <GitGraph
          git={data.git}
          selectedId={selectedId}
          activeSegmentId={activeSegmentId}
          onSelect={(row: GitMessageRow) => openRow(data.sessionId, row.message.id, row.segmentId)}
          onUnfold={unfold}
          onContinue={(target) => openContinue(target.sessionId, target.id)}
        />
      ) : null}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  epoch: EpochNode,
  session: SessionNode,
};

/** React Flow overlays get their colours from the node type, not the kind. */
function minimapColor(node: GraphNode): string {
  return node.type === "epoch" ? "#2b3446" : "#243040";
}

function Flow({ model }: { model: LineageViewModel }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => defaultExpanded(model));
  const [selection, setSelection] = useState<Selection | null>(null);
  const [unfolded, setUnfolded] = useState<Set<string>>(() => new Set());
  const [openAll, setOpenAll] = useState(false);
  const [layout, setLayout] = useState<Awaited<ReturnType<typeof layoutGraph>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOutline, setShowOutline] = useState(false);
  const { expanded: fullscreen, toggle: toggleFullscreen } = useFullscreen();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // Open on the session where the work left off, framed around it.
  const pendingFocus = useRef<string | null>(headOf(model)?.sessionKey ?? null);
  const focusTimer = useRef<number | null>(null);
  /** Outline selection just re-fitted the view; don't let the generic fit undo it. */
  const lastFocusRequest = useRef(
    pendingFocus.current ? performance.now() : Number.NEGATIVE_INFINITY,
  );
  /** The first run belongs to mount; only React to the user toggling the outline. */
  const firstOutlineToggle = useRef(true);
  const { fitView, getViewport, setViewport } = useReactFlow();
  /** The box the user just opened or closed, and where it was, so it stays put on screen. */
  const anchor = useRef<{ id: string; at: { x: number; y: number } } | null>(null);
  /** Only the first layout frames the whole map; later ones keep the user's zoom. */
  const framed = useRef(false);

  const scheduleFocus = useCallback(
    (id: string) => {
      if (focusTimer.current !== null) window.clearTimeout(focusTimer.current);
      focusTimer.current = window.setTimeout(() => {
        focusTimer.current = null;
        void fitView({ nodes: [{ id }], padding: 0.6, duration: 300, maxZoom: 1.2 });
      }, 80);
    },
    [fitView],
  );

  useEffect(
    () => () => {
      if (focusTimer.current !== null) window.clearTimeout(focusTimer.current);
    },
    [],
  );

  /** A message row picked in the outline, to centre once its layout lands. */
  const pendingRow = useRef<{ sessionKey: string; messageId: string } | null>(null);

  /**
   * Centres one message row of a laid-out session at a readable zoom (0.9).
   * Fitting the whole session would shrink a long history to illegible text.
   */
  const centerRow = useCallback(
    (
      result: Awaited<ReturnType<typeof layoutGraph>>,
      sessionKeyValue: string,
      messageId: string,
      delay = 0,
    ): boolean => {
      const node = result.nodes.find((candidate) => candidate.id === sessionKeyValue);
      if (node?.type !== "session" || !node.data.git) return false;
      const { git } = node.data;
      const row = git.rows.find(
        (candidate) => candidate.kind === "message" && candidate.message.id === messageId,
      );
      const at = absolutePosition(result.nodes, sessionKeyValue);
      if (!row || !at) return false;
      const zoom = 0.9;
      const apply = (): void => {
        const canvas = document.querySelector(".react-flow")?.getBoundingClientRect();
        if (!canvas) return;
        void setViewport({
          zoom,
          x: canvas.width / 2 - (at.x + GROUP_INSET + git.graphWidth / 2) * zoom,
          y: canvas.height / 2 - (at.y + SESSION_GROUP_HEADER + row.y) * zoom,
        });
      };
      if (delay > 0) {
        // After React Flow has mounted its canvas and run its own initial fit,
        // or either would overwrite this.
        if (focusTimer.current !== null) window.clearTimeout(focusTimer.current);
        focusTimer.current = window.setTimeout(() => {
          focusTimer.current = null;
          apply();
        }, delay);
      } else {
        apply();
      }
      return true;
    },
    [setViewport],
  );

  /** Opening the map frames the newest message, so HEAD is readable at once. */
  const focusInitial = useCallback(
    (result: Awaited<ReturnType<typeof layoutGraph>>, id: string) => {
      const head = headOf(model);
      if (
        head?.messageId &&
        id === head.sessionKey &&
        centerRow(result, head.sessionKey, head.messageId, 120)
      ) {
        return;
      }
      scheduleFocus(id);
    },
    [centerRow, model, scheduleFocus],
  );

  useEffect(() => {
    let cancelled = false;
    setError(null);
    layoutGraph(model, expanded, { unfolded, openAll })
      .then((result) => {
        if (cancelled) return;
        setLayout(result);
        const held = anchor.current;
        anchor.current = null;
        const now = held ? absolutePosition(result.nodes, held.id) : null;
        if (held && now) {
          // Shift the view by as much as the box moved, so content opens below it.
          const { x, y, zoom } = getViewport();
          void setViewport({
            x: x - (now.x - held.at.x) * zoom,
            y: y - (now.y - held.at.y) * zoom,
            zoom,
          });
        }
        // Survives into the single-file build so a 500-node run can be measured.
        document.documentElement.dataset.layoutMs = result.layoutMs.toFixed(1);
        const row = pendingRow.current;
        if (row && result.nodes.some((node) => node.id === row.sessionKey)) {
          pendingRow.current = null;
          pendingFocus.current = null;
          if (!centerRow(result, row.sessionKey, row.messageId)) {
            focusInitial(result, row.sessionKey);
          }
          return;
        }
        const focus = pendingFocus.current;
        if (focus && result.nodes.some((node) => node.id === focus)) {
          pendingFocus.current = null;
          focusInitial(result, focus);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [model, expanded, unfolded, openAll, centerRow, focusInitial, getViewport, setViewport]);

  useEffect(() => {
    if (!layout || framed.current) return;
    framed.current = true;
    if (performance.now() - lastFocusRequest.current < 1000) return;
    const timer = setTimeout(() => {
      void fitView({ padding: 0.15, duration: 200 });
    }, 60);
    return () => clearTimeout(timer);
  }, [layout, fitView]);

  // Opening or closing the outline changes the canvas width, so re-frame the map.
  useEffect(() => {
    if (firstOutlineToggle.current) {
      firstOutlineToggle.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void fitView({ padding: 0.15, duration: 200 });
    }, 80);
    return () => clearTimeout(timer);
  }, [showOutline, fitView]);

  const toggle = useCallback(
    (id: string) => {
      const at = layout ? absolutePosition(layout.nodes, id) : null;
      anchor.current = at ? { id, at } : null;
      setExpanded((previous) => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [layout],
  );
  const openRow = useCallback((sessionIdValue: string, messageId: string, segmentId: string) => {
    setFocusedId(nodeId(sessionKey(sessionIdValue), messageId));
    setSelection({
      type: "node",
      sessionId: sessionIdValue,
      nodeId: messageId,
      branchId: segmentId,
    });
  }, []);
  const unfold = useCallback((segmentId: string) => {
    setUnfolded((previous) => {
      const next = new Set(previous);
      next.add(segmentId);
      return next;
    });
  }, []);
  const toggleUnfoldAll = useCallback(() => {
    setOpenAll((value) => !value);
    setUnfolded(new Set());
  }, []);
  const closePanel = useCallback(() => setSelection(null), []);
  const toggleOutline = useCallback(() => setShowOutline((value) => !value), []);
  const onNodeClick = useCallback<NodeMouseHandler<GraphNode>>((_event, node) => {
    setFocusedId(node.id);
    if (node.type === "session") {
      setSelection({ type: "session", sessionId: node.data.sessionId });
    }
  }, []);

  /**
   * Selecting in the outline must reveal the target's group chain in the map
   * first: a collapsed group has no flow node at all, so its child cannot be
   * focused until the next layout lands.
   */
  const selectFromOutline = useCallback(
    (target: OutlineTarget) => {
      const reveal = [...target.expand, ...(outlinePath(model, target.focusId) ?? []).slice(0, -1)];
      const needsLayout = reveal.some((id) => !expanded.has(id));
      // A message row belongs to its session's group, which is what gets framed.
      const focusId =
        target.selection?.type === "node" ? sessionKey(target.selection.sessionId) : target.focusId;
      setExpanded((previous) => {
        const next = new Set(previous);
        for (const id of reveal) next.add(id);
        return next;
      });
      setSelection(target.selection);
      setFocusedId(target.focusId);
      lastFocusRequest.current = performance.now();
      const rowTarget =
        target.selection?.type === "node"
          ? {
              sessionKey: sessionKey(target.selection.sessionId),
              messageId: target.selection.nodeId,
            }
          : null;
      if (needsLayout) {
        pendingFocus.current = rowTarget ? null : focusId;
        pendingRow.current = rowTarget;
      } else {
        pendingFocus.current = null;
        pendingRow.current = null;
        const centered =
          rowTarget !== null &&
          layout !== null &&
          centerRow(layout, rowTarget.sessionKey, rowTarget.messageId);
        if (!centered) scheduleFocus(focusId);
      }
    },
    [centerRow, expanded, layout, model, scheduleFocus],
  );

  /** A "↑ continues …" mark opens the earlier session, revealed and centred. */
  const openContinue = useCallback(
    (targetSessionId: string, messageId: string) => {
      const focus = nodeId(sessionKey(targetSessionId), messageId);
      selectFromOutline({
        focusId: focus,
        expand: outlinePath(model, focus) ?? [sessionKey(targetSessionId)],
        selection: { type: "node", sessionId: targetSessionId, nodeId: messageId },
      });
    },
    [model, selectFromOutline],
  );

  const actions = useMemo(
    () => ({ toggle, openRow, openContinue, unfold, selection }),
    [toggle, openRow, openContinue, unfold, selection],
  );

  let content: ReactNode;
  if (error) {
    content = <p className="error graph-status">{error}</p>;
  } else if (!layout) {
    content = <p className="graph-status">Laying out the map…</p>;
  } else if (layout.nodes.length === 0) {
    content = <p className="graph-status empty">No sessions recorded yet.</p>;
  } else {
    content = (
      <ReactFlow
        nodes={layout.nodes}
        edges={layout.edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{ style: { stroke: "#4f5b74", strokeWidth: 1.5 } }}
        onNodeClick={onNodeClick}
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
        <MiniMap pannable zoomable nodeColor={minimapColor} />
        <Controls showInteractive={false} />
      </ReactFlow>
    );
  }

  return (
    <GraphActions.Provider value={actions}>
      <div className={fullscreen ? "map-shell is-expanded" : "map-shell"}>
        <div className="map-toolbar">
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
            aria-pressed={openAll}
            onClick={toggleUnfoldAll}
          >
            {openAll ? "Fold all" : "Unfold all"}
          </button>
          <button
            type="button"
            className="outline-button"
            aria-pressed={showOutline}
            onClick={toggleOutline}
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
              onClose={toggleOutline}
            />
          ) : null}
          <div className="graph-canvas">
            {content}
            <DrillDown
              model={model}
              selection={selection}
              onClose={closePanel}
              onNavigate={selectFromOutline}
            />
          </div>
        </div>
      </div>
    </GraphActions.Provider>
  );
}

/** Epoch → session map; each session draws its messages as a git graph. */
export function Graph({ model }: { model: LineageViewModel }) {
  return (
    <section className="lineage-map" aria-label="Project lineage graph">
      <ReactFlowProvider>
        <Flow model={model} />
      </ReactFlowProvider>
    </section>
  );
}
