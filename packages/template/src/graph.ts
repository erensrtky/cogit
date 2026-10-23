import type { Edge as FlowEdge, Node as FlowNode } from "@xyflow/react";
import ELK, {
  type ElkExtendedEdge,
  type ELK as ElkInstance,
  type ElkNode,
} from "elkjs/lib/elk.bundled.js";
import type { LineageViewModel, ViewNode, ViewSession } from "../../cli/src/view/model.js";
import { cardHeight } from "./cardHeight.js";
import { cardMeta, cardText, formatTime, itemsInside, kindLabel } from "./format.js";

/**
 * Builds the nested React Flow graph (epoch → session → node) and lays it out
 * with ELK in the page. ELK returns child coordinates relative to their parent,
 * which is what React Flow's `parentId` children expect, so no conversion is
 * needed for nested nodes.
 */

/** Fixed card sizes keep ELK fast: it never needs to measure DOM text. */
const NODE_WIDTH = 240;
/** Cards grow with their text (see cardHeight); this is the floor. */
const NODE_HEIGHT = 48;
const GROUP_HEIGHT = 56;
const GROUP_WIDTH = 260;
const GROUP_PADDING = 24;
const GROUP_HEADER = 44;

const ROOT_PADDING = 48;

/** Inside a topic column nodes read top to bottom, nested items indented below their topic. */
const INDENT = 32;
const ROW_GAP = 16;
const COLUMN_GAP = 24;
/** The "left off here" badge under the last touched card's title. */
const LEFT_OFF_BADGE = 20;
/** Wide enough that a collapsed session shows a readable title. */
const SESSION_WIDTH = 380;

/** Handle ids on lineage cards: the spine leaves at the bottom left and enters at the left side. */
export const TREE_OUT = "tree-out";
export const TREE_LEFT = "tree-left";

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

/** Everything the drill-down panel shows about a node. */
export type NodeDetail = {
  kind: ViewNode["kind"];
  title: string;
  summary?: string;
  why?: string;
  at?: string;
  decidedBy?: ViewNode["decidedBy"];
  alternatives?: ViewNode["alternatives"];
  commits?: string[];
  files?: string[];
  addedAt?: string;
  touchedAt?: string;
  /** Owning session, so the drill-down panel can show and resume it. */
  sessionId: string;
};

export function toNodeDetail(node: ViewNode, sessionId: string): NodeDetail {
  const { id: _id, children: _children, ...detail } = node;
  return { ...detail, sessionId };
}

export type LineageData = NodeDetail & {
  /** Nodes nested below this one, at any depth. */
  count: number;
  expanded: boolean;
  hasChildren: boolean;
  /** One of the nodes the last write added or changed: where the work left off. */
  isLast: boolean;
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

/**
 * Node ids are flat per session (not per parent): the outline and the graph
 * must agree on the same id to focus each other's items.
 */
export function nodeId(sessionGroup: string, id: string): string {
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

export interface LastTouched {
  sessionKey: string;
  /** Every node the last write added or changed: they share the newest touch time. */
  nodeKeys: string[];
  /** Epoch, session and every topic above those nodes, outermost first. */
  ancestors: string[];
}

/**
 * Where the work left off: the nodes touched by the last write of the most recently
 * updated session. One write stamps all its nodes at once, so they are all marked
 * rather than guessing which of them came last.
 */
export function lastTouched(model: LineageViewModel): LastTouched | null {
  const latest = latestSession(model);
  if (!latest) return null;
  const sessionKey = sessionId(latest.session.sessionId);
  let newest = "";
  const found: { key: string; ancestors: string[]; at: string }[] = [];
  const visit = (nodes: ViewNode[], ancestors: string[]): void => {
    for (const node of nodes) {
      const key = nodeId(sessionKey, node.id);
      if (node.touchedAt) {
        found.push({ key, ancestors, at: node.touchedAt });
        if (node.touchedAt > newest) newest = node.touchedAt;
      }
      visit(node.children, [...ancestors, key]);
    }
  };
  visit(latest.session.nodes, []);
  const last = found.filter((entry) => entry.at === newest);
  if (last.length === 0) return null;
  const ancestors = new Set([latest.group, sessionKey]);
  for (const entry of last) for (const key of entry.ancestors) ancestors.add(key);
  return { sessionKey, nodeKeys: last.map((entry) => entry.key), ancestors: [...ancestors] };
}

function latestSession(
  model: LineageViewModel,
): { session: ViewSession; group: string } | undefined {
  const candidates: { session: ViewSession; group: string }[] = [];
  for (const epoch of model.epochs) {
    for (const session of epoch.sessions) candidates.push({ session, group: epochId(epoch.id) });
  }
  for (const session of model.unassigned) candidates.push({ session, group: UNASSIGNED_EPOCH_ID });
  return candidates.sort(
    (a, b) => Date.parse(b.session.updatedAt) - Date.parse(a.session.updatedAt),
  )[0];
}

/**
 * The map opens on the most recently updated session, with its epoch expanded,
 * showing that session's top-level topics and the branch to the last touched node;
 * deeper layers open on click.
 */
export function defaultExpanded(model: LineageViewModel): Set<string> {
  const latest = latestSession(model);
  if (!latest) return new Set();
  // Also open the branch that leads to where the work left off.
  const last = lastTouched(model);
  return new Set([latest.group, sessionId(latest.session.sessionId), ...(last?.ancestors ?? [])]);
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

interface Placement {
  boxes: Map<string, Sized>;
  edges: FlowEdge[];
  width: number;
  height: number;
}

/** Tall enough for the card's whole title and the line below it, as the card renders them. */
function nodeHeight(node: ViewNode, open: boolean): number {
  const hasChildren = node.children.length > 0;
  const body =
    hasChildren && !open
      ? itemsInside(countNodes(node.children))
      : node.at
        ? formatTime(node.at)
        : cardText(node);
  const meta = cardMeta(node);
  return Math.max(
    NODE_HEIGHT,
    cardHeight(
      {
        kindLabel: kindLabel(node.kind),
        title: node.title,
        hasToggle: hasChildren,
        ...(body ? { body } : {}),
        ...(meta ? { meta } : {}),
      },
      NODE_WIDTH,
    ),
  );
}

function treeEdge(source: string, target: string, targetHandle: string): FlowEdge {
  return {
    id: `edge:${source}->${target}`,
    source,
    target,
    sourceHandle: TREE_OUT,
    targetHandle,
    type: "smoothstep",
  };
}

/**
 * Places a session's nodes: top-level topics side by side as columns (they run in
 * parallel, so their order matters little), and inside each column an indented,
 * top-to-bottom outline of what the topic holds, in recorded order. Time runs
 * down the map across sessions; topics run across.
 */
export function placeSessionNodes(
  nodes: ViewNode[],
  sessionGroup: string,
  isOpen: (id: string) => boolean = () => true,
  lastKeys: ReadonlySet<string> = new Set(),
): Placement {
  const boxes = new Map<string, Sized>();
  const edges: FlowEdge[] = [];
  const top = GROUP_HEADER + 8;
  let columnX = GROUP_PADDING;
  let bottom = top;
  for (const root of nodes) {
    let y = top;
    let columnWidth = NODE_WIDTH;
    const visit = (node: ViewNode, parent: string | null, depth: number): void => {
      const id = nodeId(sessionGroup, node.id);
      const open = isOpen(id);
      const height = nodeHeight(node, open) + (lastKeys.has(id) ? LEFT_OFF_BADGE : 0);
      boxes.set(id, { x: columnX + depth * INDENT, y, width: NODE_WIDTH, height });
      y += height + ROW_GAP;
      columnWidth = Math.max(columnWidth, depth * INDENT + NODE_WIDTH);
      if (parent !== null) edges.push(treeEdge(parent, id, TREE_LEFT));
      if (open) for (const child of node.children) visit(child, id, depth + 1);
    };
    visit(root, null, 0);
    bottom = Math.max(bottom, y - ROW_GAP);
    columnX += columnWidth + COLUMN_GAP;
  }
  return {
    boxes,
    edges,
    width: Math.max(columnX - COLUMN_GAP, GROUP_PADDING) + GROUP_PADDING,
    height: bottom + GROUP_PADDING,
  };
}

function buildSession(
  session: ViewSession,
  expanded: ReadonlySet<string>,
  parentId: string,
  meta: Map<string, string | null>,
  placements: Map<string, Placement>,
  lastKeys: ReadonlySet<string>,
): ElkNode {
  const id = sessionId(session.sessionId);
  meta.set(id, parentId);
  const showChildren = expanded.has(id) && session.nodes.length > 0;
  if (!showChildren) return { id, width: SESSION_WIDTH, height: GROUP_HEIGHT };

  // ELK sizes the session box; its contents are placed by hand.
  const placement = placeSessionNodes(
    session.nodes,
    id,
    (nodeKey) => expanded.has(nodeKey),
    lastKeys,
  );
  placements.set(id, placement);
  return { id, width: Math.max(SESSION_WIDTH, placement.width), height: placement.height };
}

function buildEpoch(
  group: Group,
  expanded: ReadonlySet<string>,
  meta: Map<string, string | null>,
  placements: Map<string, Placement>,
  lastKeys: ReadonlySet<string>,
): ElkNode {
  meta.set(group.id, null);
  const showChildren = expanded.has(group.id) && group.sessions.length > 0;
  if (!showChildren) return { id: group.id, width: GROUP_WIDTH, height: GROUP_HEIGHT };

  const children = group.sessions.map((session) =>
    buildSession(session, expanded, group.id, meta, placements, lastKeys),
  );
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

export function countNodes(nodes: ViewNode[]): number {
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

  const lastKeys: ReadonlySet<string> = new Set(lastTouched(model)?.nodeKeys ?? []);
  const parents = new Map<string, string | null>();
  const placements = new Map<string, Placement>();
  const rootChildren = groups.map((group) =>
    buildEpoch(group, expanded, parents, placements, lastKeys),
  );
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
  for (const placement of placements.values()) {
    for (const [id, box] of placement.boxes) sizes.set(id, box);
  }
  const seenEdges = new Set<string>();
  const edges: FlowEdge[] = [];
  const addEdge = (edge: ElkExtendedEdge): void => {
    const flow = toFlowEdge(edge, seenEdges);
    if (flow) edges.push(flow);
  };
  for (const edge of rootEdges) addEdge(edge);
  for (const child of rootChildren) {
    for (const edge of child.edges ?? []) addEdge(edge);
  }
  for (const placement of placements.values()) edges.push(...placement.edges);

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
      collectFlowNodes(session.nodes, id, session.sessionId, nodes, sizes, expanded, lastKeys);
    }
  }

  return { nodes, edges, layoutMs };
}

function collectFlowNodes(
  nodes: ViewNode[],
  parent: string,
  sessionId: string,
  out: GraphNode[],
  sizes: Map<string, Sized>,
  expanded: ReadonlySet<string>,
  lastKeys: ReadonlySet<string>,
): void {
  for (const node of nodes) {
    const id = nodeId(parent, node.id);
    const open = expanded.has(id);
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
        ...toNodeDetail(node, sessionId),
        count: countNodes(node.children),
        expanded: open,
        hasChildren: node.children.length > 0,
        isLast: lastKeys.has(id),
      },
    });
    if (open) collectFlowNodes(node.children, parent, sessionId, out, sizes, expanded, lastKeys);
  }
}
