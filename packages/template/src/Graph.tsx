import {
  Background,
  Controls,
  Handle,
  MiniMap,
  type NodeProps,
  type NodeTypes,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { LineageViewModel } from "../../cli/src/view/model.js";
import { formatTime } from "./format.js";
import {
  defaultExpanded,
  type EpochFlowNode,
  type GraphNode,
  type LineageFlowNode,
  layoutGraph,
  type SessionFlowNode,
} from "./graph.js";

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
        <time className="muted" dateTime={data.updatedAt}>
          {formatTime(data.updatedAt)}
        </time>
      </div>
    </div>
  );
}

function LineageBox({ data }: NodeProps<LineageFlowNode>) {
  return (
    <div className={`lineage-box kind-${data.kind}`}>
      <AnchorHandles />
      <div className="lineage-head">
        <span className={`kind kind-${data.kind}`}>{data.kind}</span>
        <strong title={data.title}>{data.title}</strong>
      </div>
      {data.at ? (
        <time dateTime={data.at}>{formatTime(data.at)}</time>
      ) : data.summary ? (
        <p title={data.summary}>{data.summary}</p>
      ) : null}
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
  return "#1f2a3d";
}

function Flow({ model }: { model: LineageViewModel }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => defaultExpanded(model));
  const [layout, setLayout] = useState<Awaited<ReturnType<typeof layoutGraph>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { fitView } = useReactFlow();

  useEffect(() => {
    let cancelled = false;
    setError(null);
    layoutGraph(model, expanded)
      .then((result) => {
        if (cancelled) return;
        setLayout(result);
        // Survives into the single-file build so a 500-node run can be measured.
        document.documentElement.dataset.layoutMs = result.layoutMs.toFixed(1);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [model, expanded]);

  useEffect(() => {
    if (!layout) return;
    const timer = setTimeout(() => {
      void fitView({ padding: 0.15, duration: 200 });
    }, 60);
    return () => clearTimeout(timer);
  }, [layout, fitView]);

  const toggle = useCallback((id: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const actions = useMemo(() => ({ toggle }), [toggle]);

  if (error) return <p className="error graph-status">{error}</p>;
  if (!layout) return <p className="graph-status">Laying out the map…</p>;
  if (layout.nodes.length === 0) {
    return <p className="graph-status empty">No sessions recorded yet.</p>;
  }

  return (
    <GraphActions.Provider value={actions}>
      <ReactFlow
        nodes={layout.nodes}
        edges={layout.edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{ style: { stroke: "#4f5b74", strokeWidth: 1.5 } }}
        fitView
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
    </GraphActions.Provider>
  );
}

/** Nested epoch → session → node map; layout runs in the page from embedded data. */
export function Graph({ model }: { model: LineageViewModel }) {
  return (
    <section className="graph-wrap" aria-label="Project lineage graph">
      <ReactFlowProvider>
        <Flow model={model} />
      </ReactFlowProvider>
    </section>
  );
}
