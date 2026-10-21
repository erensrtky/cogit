import type { Edge as FlowEdge, Node as FlowNode } from "@xyflow/react";
import ELK, {
  type ElkExtendedEdge,
  type ELK as ElkInstance,
  type ElkNode,
} from "elkjs/lib/elk.bundled.js";
import type { LineageViewModel, ViewNode, ViewSession } from "../../cli/src/view/model.js";

/**
 * Builds the nested React Flow graph (epoch → session → node) and lays it out
 * with ELK in the page. ELK returns child coordinates relative to their parent,
 * which is what React Flow's `parentId` children expect, so no conversion is
 * needed for nested nodes.
 */

/** Fixed card sizes keep ELK fast: it never needs to measure DOM text. */
const NODE_WIDTH = 220;
const NODE_HEIGHT = 64;
const GROUP_HEIGHT = 56;
const GROUP_WIDTH = 260;
const GROUP_PADDING = 24;
const GROUP_HEADER = 44;

const ROOT_PADDING = 48;

export type EpochData = {
  title: string;
  count: number;
  expanded: boolean;
  hasChildren: boolean;
};

export type SessionData = {
  title: string;
  sessionId: string;
  updatedAt: string;
  goal: string;
  count: number;
  expanded: boolean;
  hasChildren: boolean;
};

export type LineageData = {
  kind: ViewNode["kind"];
  title: string;
  summary?: string;
  why?: string;
  at?: string;
};

export type EpochFlowNode = FlowNode<EpochData, "epoch">;
export type SessionFlowNode = FlowNode<SessionData, "session">;
export type LineageFlowNode = FlowNode<LineageData, "lineage">;

export type GraphNode = EpochFlowNode | SessionFlowNode | LineageFlowNode;

export interface GraphLayout {
  nodes: GraphNode[];
  edges: FlowEdge[];
  /** Wall-clock time spent inside `elk.layout`, in milliseconds. */
  layoutMs: number;
}

export const UNASSIGNED_EPOCH_ID = "unassigned";

export function epochId(id: string): string {
  return `epoch:${id}`;
}

export function sessionId(id: string): string {
  return `session:${id}`;
}

function nodeId(sessionGroup: string, id: string): string {
  return `node:${sessionGroup}:${id}`;
}

const LAYOUT_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.spacing.nodeNode": "40",
  "elk.layered.spacing.nodeNodeBetweenLayers": "48",
  "elk.separateConnectedComponents": "true",
} as const;

function groupOptions() {
  return {
    ...LAYOUT_OPTIONS,
    "elk.padding": `[top=${GROUP_HEADER + 8},left=${GROUP_PADDING},bottom=${GROUP_PADDING},right=${GROUP_PADDING}]`,
  };
}

/** The map opens on the most recently updated session, with its epoch expanded. */
export function defaultExpanded(model: LineageViewModel): Set<string> {
  const candidates: { session: ViewSession; group: string }[] = [];
  for (const epoch of model.epochs) {
    for (const session of epoch.sessions) {
      candidates.push({ session, group: epochId(epoch.id) });
    }
  }
  for (const session of model.unassigned) {
    candidates.push({ session, group: UNASSIGNED_EPOCH_ID });
  }
  const latest = candidates.sort(
    (a, b) => Date.parse(b.session.updatedAt) - Date.parse(a.session.updatedAt),
  )[0];
  if (!latest) return new Set();
  return new Set([latest.group, sessionId(latest.session.sessionId)]);
}

interface Group {
  id: string;
  title: string;
  sessions: ViewSession[];
}

function toFlowEdge(edge: ElkExtendedEdge, existing: Set<string>): FlowEdge | null {
  if (existing.has(edge.id)) return null;
  existing.add(edge.id);
  const [source] = edge.sources;
  const [target] = edge.targets;
  if (!source || !target) return null;
  return { id: edge.id, source, target, type: "smoothstep" };
}

/** Links sibling boxes so the layered layout stacks them in model order. */
function chainEdges(ids: string[]): ElkExtendedEdge[] {
  const edges: ElkExtendedEdge[] = [];
  for (let i = 1; i < ids.length; i += 1) {
    const source = ids[i - 1];
    const target = ids[i];
    if (source && target) {
      edges.push({ id: `edge:${source}->${target}`, sources: [source], targets: [target] });
    }
  }
  return edges;
}

function collectNodeBoxes(
  nodes: ViewNode[],
  parent: string | null,
  sessionGroup: string,
  out: ElkNode[],
  edges: ElkExtendedEdge[],
  meta: Map<string, string | null>,
): void {
  for (const node of nodes) {
    const id = nodeId(sessionGroup, node.id);
    out.push({ id, width: NODE_WIDTH, height: NODE_HEIGHT });
    meta.set(id, sessionGroup);
    if (parent !== null) {
      edges.push({ id: `edge:${parent}->${id}`, sources: [parent], targets: [id] });
    }
    collectNodeBoxes(node.children, id, sessionGroup, out, edges, meta);
  }
}

function buildSession(
  session: ViewSession,
  expanded: ReadonlySet<string>,
  parentId: string,
  meta: Map<string, string | null>,
): ElkNode {
  const id = sessionId(session.sessionId);
  meta.set(id, parentId);
  const showChildren = expanded.has(id) && session.nodes.length > 0;
  if (!showChildren) return { id, width: GROUP_WIDTH, height: GROUP_HEIGHT };

  const children: ElkNode[] = [];
  const edges: ElkExtendedEdge[] = [];
  collectNodeBoxes(session.nodes, null, id, children, edges, meta);
  return { id, children, edges, layoutOptions: groupOptions() };
}

function buildEpoch(
  group: Group,
  expanded: ReadonlySet<string>,
  meta: Map<string, string | null>,
): ElkNode {
  meta.set(group.id, null);
  const showChildren = expanded.has(group.id) && group.sessions.length > 0;
  if (!showChildren) return { id: group.id, width: GROUP_WIDTH, height: GROUP_HEIGHT };

  const children = group.sessions.map((session) => buildSession(session, expanded, group.id, meta));
  const edges = chainEdges(children.map((child) => child.id));
  return { id: group.id, children, edges, layoutOptions: groupOptions() };
}

interface Sized {
  x: number;
  y: number;
  width: number;
  height: number;
}

function collectSizes(elk: ElkNode, out: Map<string, Sized>): void {
  for (const child of elk.children ?? []) {
    out.set(child.id, {
      x: child.x ?? 0,
      y: child.y ?? 0,
      width: child.width ?? GROUP_WIDTH,
      height: child.height ?? GROUP_HEIGHT,
    });
    collectSizes(child, out);
  }
}

function countNodes(nodes: ViewNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countNodes(node.children), 0);
}

/**
 * Lays out the whole map. Only expanded groups send their children to ELK, so
 * the default (collapsed) view costs one small box per epoch and session.
 */
export async function layoutGraph(
  model: LineageViewModel,
  expanded: ReadonlySet<string>,
  elk: ElkInstance = new ELK(),
): Promise<GraphLayout> {
  const groups: Group[] = model.epochs.map((epoch) => ({
    id: epochId(epoch.id),
    title: epoch.title,
    sessions: epoch.sessions,
  }));
  if (model.unassigned.length > 0) {
    groups.push({ id: UNASSIGNED_EPOCH_ID, title: "Unassigned", sessions: model.unassigned });
  }

  const parents = new Map<string, string | null>();
  const rootChildren = groups.map((group) => buildEpoch(group, expanded, parents));
  const rootEdges = chainEdges(rootChildren.map((child) => child.id));

  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      ...LAYOUT_OPTIONS,
      "elk.padding": `[top=${ROOT_PADDING},left=${ROOT_PADDING},bottom=${ROOT_PADDING},right=${ROOT_PADDING}]`,
    },
    children: rootChildren,
    edges: rootEdges,
  };

  const started = performance.now();
  const result = await elk.layout(graph);
  const layoutMs = performance.now() - started;

  const sizes = new Map<string, Sized>();
  collectSizes(result, sizes);
  const seenEdges = new Set<string>();
  const edges: FlowEdge[] = [];
  const addEdge = (edge: ElkExtendedEdge): void => {
    const flow = toFlowEdge(edge, seenEdges);
    if (flow) edges.push(flow);
  };
  for (const edge of rootEdges) addEdge(edge);
  for (const child of rootChildren) {
    for (const edge of child.edges ?? []) addEdge(edge);
    for (const session of child.children ?? []) {
      for (const edge of session.edges ?? []) addEdge(edge);
    }
  }

  const nodes: GraphNode[] = [];
  const box = (id: string): Sized =>
    sizes.get(id) ?? { x: 0, y: 0, width: GROUP_WIDTH, height: GROUP_HEIGHT };

  for (const group of groups) {
    const epochExpanded = expanded.has(group.id);
    const epochSize = box(group.id);
    nodes.push({
      id: group.id,
      type: "epoch",
      position: { x: epochSize.x, y: epochSize.y },
      width: epochSize.width,
      height: epochSize.height,
      style: { width: epochSize.width, height: epochSize.height },
      draggable: false,
      connectable: false,
      selectable: false,
      data: {
        title: group.title,
        count: group.sessions.length,
        expanded: epochExpanded,
        hasChildren: group.sessions.length > 0,
      },
    });
    if (!epochExpanded) continue;

    for (const session of group.sessions) {
      const id = sessionId(session.sessionId);
      const sessionExpanded = expanded.has(id);
      const sessionSize = box(id);
      nodes.push({
        id,
        type: "session",
        parentId: parents.get(id) ?? group.id,
        position: { x: sessionSize.x, y: sessionSize.y },
        width: sessionSize.width,
        height: sessionSize.height,
        style: { width: sessionSize.width, height: sessionSize.height },
        draggable: false,
        connectable: false,
        selectable: false,
        data: {
          title: session.title || session.sessionId,
          sessionId: session.sessionId,
          updatedAt: session.updatedAt,
          goal: session.status.goal,
          count: countNodes(session.nodes),
          expanded: sessionExpanded,
          hasChildren: session.nodes.length > 0,
        },
      });
      if (!sessionExpanded) continue;
      collectFlowNodes(session.nodes, id, nodes, sizes);
    }
  }

  return { nodes, edges, layoutMs };
}

function collectFlowNodes(
  nodes: ViewNode[],
  parent: string,
  out: GraphNode[],
  sizes: Map<string, Sized>,
): void {
  for (const node of nodes) {
    const id = nodeId(parent, node.id);
    const size = sizes.get(id) ?? { x: 0, y: 0, width: NODE_WIDTH, height: NODE_HEIGHT };
    out.push({
      id,
      type: "lineage",
      parentId: parent,
      position: { x: size.x, y: size.y },
      width: size.width,
      height: size.height,
      style: { width: size.width, height: size.height },
      draggable: false,
      connectable: false,
      selectable: false,
      data: {
        kind: node.kind,
        title: node.title,
        ...(node.summary === undefined ? {} : { summary: node.summary }),
        ...(node.why === undefined ? {} : { why: node.why }),
        ...(node.at === undefined ? {} : { at: node.at }),
      },
    });
    collectFlowNodes(node.children, parent, out, sizes);
  }
}
