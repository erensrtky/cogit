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
import { cardMeta, cardText, formatDate, formatTime, itemsInside, kindLabel } from "./format.js";
import { useFullscreen } from "./fullscreen.js";
import {
  absolutePosition,
  defaultExpanded,
  type EpochFlowNode,
  type GraphNode,
  type LineageFlowNode,
  lastTouched,
  layoutGraph,
  type SessionFlowNode,
  TREE_LEFT,
  TREE_OUT,
} from "./graph.js";
import { Outline, type OutlineTarget, outlinePath } from "./Outline.js";
import { DrillDown, type Selection } from "./SidePanel.js";

/** Toggle callback reaches the group headers without threading props through React Flow. */
const GraphActions = createContext<{ toggle: (id: string) => void }>({ toggle: () => {} });

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

/** Spine handles for the outline inside a topic column (see placeSessionNodes). */
function TreeHandles() {
  return (
    <>
      <Handle
        id={TREE_LEFT}
        type="target"
        position={Position.Left}
        className="flow-handle"
        isConnectable={false}
      />
      <Handle
        id={TREE_OUT}
        type="source"
        position={Position.Bottom}
        className="flow-handle tree-handle"
        isConnectable={false}
      />
    </>
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
  return (
    <div className="flow-group session-group" title={data.goal || data.title}>
      <AnchorHandles />
      <div className="group-head">
        <GroupToggle id={id} data={data} />
        <strong className="group-title">{data.title}</strong>
        <span className="muted">{data.count}</span>
        <time className="muted" dateTime={data.updatedAt} title={formatTime(data.updatedAt)}>
          {formatDate(data.updatedAt)}
        </time>
      </div>
    </div>
  );
}

function LineageBox({ id, data }: NodeProps<LineageFlowNode>) {
  return (
    <div className={`lineage-box kind-${data.kind}${data.isLast ? " is-last" : ""}`}>
      <TreeHandles />
      <div className="lineage-head">
        {data.hasChildren ? <GroupToggle id={id} data={data} /> : null}
        <span className={`kind kind-${data.kind}`}>{kindLabel(data.kind)}</span>
        <strong title={data.title}>{data.title}</strong>
      </div>
      {data.isLast ? <span className="left-off">left off here</span> : null}
      {data.hasChildren && !data.expanded ? (
        <p className="lineage-count">{itemsInside(data.count)}</p>
      ) : data.at && data.kind !== "message" ? (
        <time dateTime={data.at}>{formatTime(data.at)}</time>
      ) : cardText(data) ? (
        <p>{cardText(data)}</p>
      ) : null}
      {cardMeta(data) ? <p className="card-meta">{cardMeta(data)}</p> : null}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  epoch: EpochNode,
  session: SessionNode,
  lineage: LineageBox,
};

/** React Flow overlays get their colours from the node type, not the kind. */
function minimapColor(node: GraphNode): string {
  if (node.type === "epoch") return "#2b3446";
  if (node.type === "session") return "#243040";
  const kind = node.data.kind;
  if (kind === "decision") return "#4b3a72";
  if (kind === "question") return "#5a4526";
  if (kind === "message") return "#1f3a4a";
  return "#1f2a3d";
}

function Flow({ model }: { model: LineageViewModel }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => defaultExpanded(model));
  const [selection, setSelection] = useState<Selection | null>(null);
  const [layout, setLayout] = useState<Awaited<ReturnType<typeof layoutGraph>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOutline, setShowOutline] = useState(false);
  const { expanded: fullscreen, toggle: toggleFullscreen } = useFullscreen();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  /** Wait for the layout that contains this node, then centre on it. */
  // Open on the session where the work left off, framed around it.
  const pendingFocus = useRef<string | null>(lastTouched(model)?.sessionKey ?? null);
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

  useEffect(() => {
    let cancelled = false;
    setError(null);
    layoutGraph(model, expanded)
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
        const focus = pendingFocus.current;
        if (focus && result.nodes.some((node) => node.id === focus)) {
          pendingFocus.current = null;
          scheduleFocus(focus);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [model, expanded, scheduleFocus, getViewport, setViewport]);

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
  const actions = useMemo(() => ({ toggle }), [toggle]);
  const closePanel = useCallback(() => setSelection(null), []);
  const toggleOutline = useCallback(() => setShowOutline((value) => !value), []);
  const onNodeClick = useCallback<NodeMouseHandler<GraphNode>>((_event, node) => {
    setFocusedId(node.id);
    if (node.type === "lineage") {
      setSelection({ type: "node", node: node.data });
    } else if (node.type === "session") {
      setSelection({ type: "session", sessionId: node.data.sessionId });
    }
  }, []);

  /**
   * Selecting in the outline must reveal the target's group chain in the graph
   * first: a collapsed group has no flow node at all, so its child cannot be
   * focused until the next layout lands.
   */
  const selectFromOutline = useCallback(
    (target: OutlineTarget) => {
      // Open every layer above the target, including topics it is nested in.
      const reveal = [...target.expand, ...(outlinePath(model, target.focusId) ?? []).slice(0, -1)];
      const needsLayout = reveal.some((id) => !expanded.has(id));
      setExpanded((previous) => {
        const next = new Set(previous);
        for (const id of reveal) next.add(id);
        return next;
      });
      setSelection(target.selection);
      setFocusedId(target.focusId);
      lastFocusRequest.current = performance.now();
      if (needsLayout) {
        pendingFocus.current = target.focusId;
      } else {
        pendingFocus.current = null;
        scheduleFocus(target.focusId);
      }
    },
    [expanded, model, scheduleFocus],
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

/** Nested epoch → session → node map; layout runs in the page from embedded data. */
export function Graph({ model }: { model: LineageViewModel }) {
  return (
    <section className="lineage-map" aria-label="Project lineage graph">
      <ReactFlowProvider>
        <Flow model={model} />
      </ReactFlowProvider>
    </section>
  );
}
