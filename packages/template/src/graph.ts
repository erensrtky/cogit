import type { Edge as FlowEdge, Node as FlowNode } from "@xyflow/react";
import ELK, {
  type ElkExtendedEdge,
  type ELK as ElkInstance,
  type ElkNode,
} from "elkjs/lib/elk.bundled.js";
import type { LineageViewModel, ViewNode, ViewSession } from "../../cli/src/view/model.js";
import { type GitLayout, layoutGitGraph } from "./gitLayout.js";

/**
 * Builds the nested map (epoch → session) and lays it out with ELK in the page.
 * What a session shows inside (its git graph) is laid out by `gitLayout.ts`;
 * only the groups are React Flow nodes, so a 500-message session costs ELK
 * nothing. ELK returns child coordinates relative to their parent, which is
 * what React Flow's `parentId` children expect.
 */

const GROUP_HEIGHT = 56;
const GROUP_WIDTH = 260;
const GROUP_PADDING = 24;
const GROUP_HEADER = 44;
/** Height of a session's header bar; its git graph starts right below. */
export const SESSION_GROUP_HEADER = GROUP_HEADER;
/** Inner padding of a group box. */
export const GROUP_INSET = GROUP_PADDING;
const ROOT_PADDING = 48;
/** Wide enough that a collapsed session shows a readable title. */
const SESSION_WIDTH = 380;

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
  /** Draw inside the session; only set while the session is open. */
  git?: GitLayout;
  /** User messages the record does not hold yet, while the catch-up is off. */
  unrecorded?: number;
};

/** Everything the drill-down panel shows about a message. */
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
  work?: ViewNode["work"];
  agentDecisions?: ViewNode["agentDecisions"];
  addedAt?: string;
  touchedAt?: string;
  parent?: string | null;
  links?: string[];
  /** A user message the record does not hold yet. */
  unsummarized?: true;
  /** Owning session, so the drill-down panel can show and resume it. */
  sessionId: string;
  /** The node's id in its session, which for a message is also its chat turn's id. */
  nodeId: string;
};

export function toNodeDetail(node: ViewNode, sessionId: string): NodeDetail {
  return { ...node, sessionId, nodeId: node.id };
}

export type SessionFlowNode = FlowNode<SessionData, "session">;
export type EpochFlowNode = FlowNode<EpochData, "epoch">;

export type GraphNode = EpochFlowNode | SessionFlowNode;

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
 * Node ids are flat per session: the outline and the map agree on the same id
 * when the outline highlights a message.
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

/** Where the work left off: the newest message of the most recently updated session. */
export interface Head {
  sessionKey: string;
  sessionId: string;
  messageId: string | null;
  /** Epoch group the session belongs to. */
  group: string;
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

export function headOf(model: LineageViewModel): Head | null {
  const latest = latestSession(model);
  if (!latest) return null;
  return {
    sessionKey: sessionId(latest.session.sessionId),
    sessionId: latest.session.sessionId,
    messageId: latest.session.messages[latest.session.messages.length - 1]?.id ?? null,
    group: latest.group,
  };
}

/**
 * The map opens on the most recently updated session, with its epoch expanded,
 * showing that session's git graph.
 */
export function defaultExpanded(model: LineageViewModel): Set<string> {
  const head = headOf(model);
  if (!head) return new Set();
  return new Set([head.group, head.sessionKey]);
}

/** The epoch group a session lives in, for the outline's reveal list. */
export function sessionGroupId(model: LineageViewModel, id: string): string | null {
  for (const epoch of model.epochs) {
    if (epoch.sessions.some((session) => session.sessionId === id)) return epochId(epoch.id);
  }
  if (model.unassigned.some((session) => session.sessionId === id)) return UNASSIGNED_EPOCH_ID;
  return null;
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

interface Sized {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SessionSize {
  width: number;
  height: number;
  git?: GitLayout;
}

function measureSession(open: boolean, git: GitLayout | null): SessionSize {
  if (!open || !git) return { width: SESSION_WIDTH, height: GROUP_HEIGHT };
  return {
    width: Math.max(SESSION_WIDTH, git.width + GROUP_PADDING * 2),
    height: GROUP_HEADER + 8 + git.height + GROUP_PADDING,
    git,
  };
}

function buildSession(
  session: ViewSession,
  expanded: ReadonlySet<string>,
  meta: Map<string, string | null>,
  parentId: string,
  headId: string | null,
  unfolded: ReadonlySet<string>,
  openAll: boolean,
): { node: ElkNode; git?: GitLayout } {
  const id = sessionId(session.sessionId);
  meta.set(id, parentId);
  const open = expanded.has(id) && session.messages.length > 0;
  const git = open ? layoutGitGraph(session.messages, { unfolded, openAll, headId }) : null;
  const size = measureSession(open, git);
  return {
    node: { id, width: size.width, height: size.height },
    ...(size.git ? { git: size.git } : {}),
  };
}

function buildEpoch(
  group: Group,
  expanded: ReadonlySet<string>,
  meta: Map<string, string | null>,
  head: Head | null,
  unfolded: ReadonlySet<string>,
  openAll: boolean,
  gits: Map<string, GitLayout>,
): ElkNode {
  meta.set(group.id, null);
  const showChildren = expanded.has(group.id) && group.sessions.length > 0;
  if (!showChildren) return { id: group.id, width: GROUP_WIDTH, height: GROUP_HEIGHT };

  const children = group.sessions.map((session) => {
    const built = buildSession(
      session,
      expanded,
      meta,
      group.id,
      head?.sessionId === session.sessionId ? head.messageId : null,
      unfolded,
      openAll,
    );
    if (built.git) gits.set(session.sessionId, built.git);
    return built.node;
  });
  const edges = chainEdges(children.map((child) => child.id));
  return { id: group.id, children, edges, layoutOptions: groupOptions() };
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

/** The messages just before and after a message in its session, by send order. */
export function messageNeighbors(
  messages: ViewNode[],
  id: string,
): { previous: ViewNode | null; next: ViewNode | null } {
  const index = messages.findIndex((message) => message.id === id);
  if (index < 0) return { previous: null, next: null };
  return { previous: messages[index - 1] ?? null, next: messages[index + 1] ?? null };
}

export interface GitLayoutPreferences {
  unfolded: ReadonlySet<string>;
  openAll: boolean;
}

/**
 * Lays out the whole map. Only expanded groups send their children to ELK, so
 * the default (collapsed) view costs one small box per epoch and session.
 */
export async function layoutGraph(
  model: LineageViewModel,
  expanded: ReadonlySet<string>,
  preferences: GitLayoutPreferences = { unfolded: new Set(), openAll: false },
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

  const head = headOf(model);
  const parents = new Map<string, string | null>();
  const gits = new Map<string, GitLayout>();
  const rootChildren = groups.map((group) =>
    buildEpoch(group, expanded, parents, head, preferences.unfolded, preferences.openAll, gits),
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
  const seenEdges = new Set<string>();
  const edges: FlowEdge[] = [];
  const addEdge = (edge: ElkExtendedEdge): void => {
    const flow = toFlowEdge(edge, seenEdges);
    if (flow) edges.push(flow);
  };
  for (const edge of rootEdges) addEdge(edge);
  for (const child of rootChildren) for (const edge of child.edges ?? []) addEdge(edge);

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
      const git = gits.get(session.sessionId);
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
          count: session.messages.length,
          expanded: sessionExpanded,
          hasChildren: session.messages.length > 0,
          ...(git ? { git } : {}),
          ...(session.unrecordedMessages ? { unrecorded: session.unrecordedMessages } : {}),
        },
      });
    }
  }

  return { nodes, edges, layoutMs };
}

/**
 * Where a node sits on the canvas: its own position plus every parent's, since
 * React Flow positions children relative to their `parentId`. Null when the
 * layout does not contain it.
 */
export function absolutePosition(
  nodes: { id: string; position: { x: number; y: number }; parentId?: string }[],
  id: string,
): { x: number; y: number } | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let node = byId.get(id);
  if (!node) return null;
  let x = 0;
  let y = 0;
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    x += node.position.x;
    y += node.position.y;
    node = node.parentId ? byId.get(node.parentId) : undefined;
  }
  return { x, y };
}
