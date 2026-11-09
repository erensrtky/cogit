/**
 * The Graph view's model and layout, pure so the tests need no browser. One
 * file is in focus; around it sit the recorded files it imports or is imported
 * by (from the code graph), and the messages that touched any of them hang off
 * the files they touched. The layout is a small force simulation with no
 * randomness, so the same record always draws the same picture.
 */
import type { ViewFile, ViewFileHit, ViewFileLink } from "../../cli/src/view/model.js";

/** Messages shown per linked file; the focus file shows all of its own. */
export const LINKED_MESSAGES = 6;

export type GraphNodeKind = "file" | "message";

export interface GraphNode {
  /** A file's path, or `sessionId:messageId` for a message. */
  id: string;
  kind: GraphNodeKind;
  x: number;
  y: number;
  r: number;
  /** Files: the focus or how it relates to it. */
  role?: "focus" | "imports" | "imported-by";
  /** Files: messages that touched it in the whole record. */
  count?: number;
  /** Messages: the hit it came from. */
  hit?: ViewFileHit;
  /** Messages: touched the focus file itself. */
  direct?: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  /**
   * `import` between two files, `touch` from a message to a file, `share`
   * between two messages that touched the same files.
   */
  kind: "import" | "touch" | "share";
  /** `share`: how many files the two messages have in common. */
  weight?: number;
}

export interface FileGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Messages left out because a linked file had more than {@link LINKED_MESSAGES}. */
  hidden: number;
}

/** Test files would crowd every source file's picture, so they only show when in focus. */
export function isTestPath(path: string): boolean {
  return /(^|\/)(test|tests|__tests__)\//.test(path) || /\.(test|spec)\.[a-z]+$/.test(path);
}

/**
 * Where the Graph view opens: the most discussed file the code graph links to
 * another, else the most discussed file, so it starts on a picture with
 * neighbours rather than on whatever was touched last.
 */
export function defaultFocus(
  files: readonly ViewFile[],
  links: readonly ViewFileLink[] | undefined,
): string | undefined {
  const linked = new Set((links ?? []).flatMap((link) => [link.from, link.to]));
  const rank = (pool: readonly ViewFile[]) =>
    [...pool].sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))[0]?.path;
  return (
    rank(files.filter((file) => linked.has(file.path) && !isTestPath(file.path))) ?? rank(files)
  );
}

const messageId = (hit: ViewFileHit): string => `${hit.sessionId}:${hit.messageId}`;

/** The focus file, its linked files and their messages, before layout. */
export function buildFileGraph(
  files: readonly ViewFile[],
  links: readonly ViewFileLink[] | undefined,
  focus: string,
): FileGraph {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const focused = byPath.get(focus);
  if (focused === undefined) return { nodes: [], edges: [], hidden: 0 };

  const role = new Map<string, NonNullable<GraphNode["role"]>>([[focus, "focus"]]);
  const keep = (path: string) => !isTestPath(path) || isTestPath(focus);
  for (const link of links ?? []) {
    if (link.from === focus && keep(link.to) && !role.has(link.to)) role.set(link.to, "imports");
    if (link.to === focus && keep(link.from) && !role.has(link.from))
      role.set(link.from, "imported-by");
  }
  const shown = [...role.keys()].filter((path) => byPath.has(path));
  const inView = new Set(shown);

  const nodes: GraphNode[] = shown.map((path) => {
    const count = byPath.get(path)?.count ?? 0;
    return {
      id: path,
      kind: "file",
      x: 0,
      y: 0,
      r: 8 + Math.sqrt(count) * 3.5,
      role: role.get(path) ?? "focus",
      count,
    };
  });
  const edges: GraphEdge[] = (links ?? [])
    .filter((link) => inView.has(link.from) && inView.has(link.to))
    .map((link) => ({ from: link.from, to: link.to, kind: "import" as const }));

  const messages = new Map<string, GraphNode>();
  let hidden = 0;
  for (const path of shown) {
    const hits = byPath.get(path)?.hits ?? [];
    const limit = path === focus ? hits.length : LINKED_MESSAGES;
    hidden += Math.max(0, hits.length - limit);
    for (const hit of hits.slice(0, limit)) {
      const id = messageId(hit);
      if (!messages.has(id))
        messages.set(id, { id, kind: "message", x: 0, y: 0, r: 5, hit, direct: false });
      edges.push({ from: id, to: path, kind: "touch" });
    }
  }
  // A message also links to every shown file it touched, even past a file's limit.
  for (const path of shown)
    for (const hit of byPath.get(path)?.hits ?? []) {
      const id = messageId(hit);
      if (!messages.has(id)) continue;
      if (path === focus) (messages.get(id) as GraphNode).direct = true;
      if (!edges.some((edge) => edge.from === id && edge.to === path))
        edges.push({ from: id, to: path, kind: "touch" });
    }
  return { nodes: [...nodes, ...messages.values()], edges, hidden };
}

/** The strongest links each thought keeps in the thoughts-only picture. */
export const SHARED_LINKS = 3;

/**
 * The same picture without files: only the thoughts, two of them linked when
 * they touched the same files, weighted by how many. The focus file is left
 * out of the count, since every thought on it would link to every other; each
 * thought keeps its {@link SHARED_LINKS} strongest links so it stays readable.
 */
export function thoughtGraph(graph: FileGraph, focus: string): FileGraph {
  const touched = new Map<string, Set<string>>();
  for (const edge of graph.edges)
    if (edge.kind === "touch" && edge.to !== focus)
      touched.set(edge.from, (touched.get(edge.from) ?? new Set()).add(edge.to));
  const messages = graph.nodes.filter((node) => node.kind === "message");
  const best = new Map<string, { other: string; weight: number }[]>();
  for (let i = 0; i < messages.length; i += 1)
    for (let j = i + 1; j < messages.length; j += 1) {
      const a = (messages[i] as GraphNode).id;
      const b = (messages[j] as GraphNode).id;
      const mine = touched.get(a);
      const theirs = touched.get(b);
      if (mine === undefined || theirs === undefined) continue;
      const weight = [...mine].filter((file) => theirs.has(file)).length;
      if (weight === 0) continue;
      best.set(a, [...(best.get(a) ?? []), { other: b, weight }]);
      best.set(b, [...(best.get(b) ?? []), { other: a, weight }]);
    }
  const kept = new Map<string, GraphEdge>();
  for (const [id, list] of best)
    for (const { other, weight } of [...list]
      .sort((x, y) => y.weight - x.weight || x.other.localeCompare(y.other))
      .slice(0, SHARED_LINKS)) {
      const [from, to] = id < other ? [id, other] : [other, id];
      kept.set(`${from}|${to}`, { from, to, kind: "share", weight });
    }
  return {
    nodes: messages.map((node) => ({ ...node, r: node.direct ? 7 : 6 })),
    edges: [...kept.values()],
    hidden: graph.hidden,
  };
}

const ITERATIONS = 300;
const CHARGE = { file: 1400, message: 90 } as const;
const LINK = {
  import: { distance: 200, strength: 0.4 },
  touch: { distance: 60, strength: 0.35 },
  share: { distance: 70, strength: 0.15 },
} as const;

/**
 * Places the nodes: the focus at the origin, the linked files on a ring, the
 * messages near the files they touched, then settles them with a force
 * simulation (repulsion, springs, collision) like d3-force's, with no
 * randomness. Returns new nodes; the input is left as it is.
 */
export function layoutFileGraph(graph: FileGraph): GraphNode[] {
  const nodes = graph.nodes.map((node) => ({ ...node, vx: 0, vy: 0 }));
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const files = nodes.filter((node) => node.kind === "file");
  const ring = files.filter((node) => node.role !== "focus");
  ring.forEach((node, i) => {
    const angle = (i / Math.max(1, ring.length)) * 2 * Math.PI;
    node.x = Math.cos(angle) * 220;
    node.y = Math.sin(angle) * 220;
  });
  const touches = graph.edges.filter((edge) => edge.kind === "touch");
  nodes.forEach((node, i) => {
    if (node.kind !== "message") return;
    const own = touches.filter((edge) => edge.from === node.id);
    const at = own.map((edge) => nodes[index.get(edge.to) as number]);
    const cx = at.reduce((sum, file) => sum + (file?.x ?? 0), 0) / Math.max(1, at.length);
    const cy = at.reduce((sum, file) => sum + (file?.y ?? 0), 0) / Math.max(1, at.length);
    // The golden angle spreads siblings evenly without a random start.
    const angle = i * 2.399963;
    // With no file to start from (the thoughts-only picture), a spiral.
    const radius = at.length === 0 ? 18 * Math.sqrt(i + 1) : 60;
    node.x = cx + Math.cos(angle) * radius;
    node.y = cy + Math.sin(angle) * radius;
  });

  const springs: { a: number; b: number; distance: number; strength: number }[] = [];
  for (const edge of graph.edges) {
    const a = index.get(edge.from);
    const b = index.get(edge.to);
    if (a === undefined || b === undefined) continue;
    const link = LINK[edge.kind];
    // A thought pair sharing more files pulls harder.
    const strength = Math.min(0.6, link.strength * (edge.weight ?? 1));
    springs.push({ a, b, distance: link.distance, strength });
  }
  const fixed = (node: (typeof nodes)[number]) => node.role === "focus";
  // Without the focus file in the picture, its thoughts gather in the middle.
  const centre = !nodes.some(fixed);

  for (let step = 0; step < ITERATIONS; step += 1) {
    const alpha = (1 - step / ITERATIONS) ** 2;
    for (let i = 0; i < nodes.length; i += 1)
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i] as (typeof nodes)[number];
        const b = nodes[j] as (typeof nodes)[number];
        const dx = b.x - a.x || 0.01;
        const dy = b.y - a.y || 0.01;
        const d2 = Math.max(dx * dx + dy * dy, 25);
        const push = (alpha * Math.sqrt(CHARGE[a.kind] * CHARGE[b.kind])) / d2;
        a.vx -= dx * push;
        a.vy -= dy * push;
        b.vx += dx * push;
        b.vy += dy * push;
      }
    for (const spring of springs) {
      const a = nodes[spring.a] as (typeof nodes)[number];
      const b = nodes[spring.b] as (typeof nodes)[number];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const pull = ((d - spring.distance) / d) * spring.strength * alpha * 0.5;
      a.vx += dx * pull;
      a.vy += dy * pull;
      b.vx -= dx * pull;
      b.vy -= dy * pull;
    }
    for (const node of nodes) {
      if (fixed(node)) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      const gravity = centre && node.direct ? 0.04 : 0.01;
      node.vx -= node.x * gravity * alpha;
      node.vy -= node.y * gravity * alpha;
      node.vx *= 0.6;
      node.vy *= 0.6;
      node.x += node.vx;
      node.y += node.vy;
    }
    // Collision: no two circles overlap, and the focus never moves.
    for (let i = 0; i < nodes.length; i += 1)
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i] as (typeof nodes)[number];
        const b = nodes[j] as (typeof nodes)[number];
        const dx = b.x - a.x || 0.01;
        const dy = b.y - a.y || 0.01;
        const d = Math.sqrt(dx * dx + dy * dy);
        const gap = a.r + b.r + 3 - d;
        if (gap <= 0) continue;
        const share = fixed(a) ? [0, 1] : fixed(b) ? [1, 0] : [0.5, 0.5];
        a.x -= (dx / d) * gap * (share[0] as number);
        a.y -= (dy / d) * gap * (share[0] as number);
        b.x += (dx / d) * gap * (share[1] as number);
        b.y += (dy / d) * gap * (share[1] as number);
      }
  }
  return nodes.map(({ vx: _vx, vy: _vy, ...node }) => node);
}

/** The box the laid-out nodes fill, with room for the file labels above them. */
export function graphBounds(nodes: readonly GraphNode[]): {
  minX: number;
  minY: number;
  width: number;
  height: number;
} {
  if (nodes.length === 0) return { minX: 0, minY: 0, width: 1, height: 1 };
  const pad = 40;
  const xs = nodes.flatMap((node) => [node.x - node.r, node.x + node.r]);
  const ys = nodes.flatMap((node) => [node.y - node.r - 18, node.y + node.r]);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  return {
    minX,
    minY,
    width: Math.max(...xs) + pad - minX,
    height: Math.max(...ys) + pad - minY,
  };
}
