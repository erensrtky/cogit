/**
 * The Graph view's model and layout, pure so the tests need no browser. One
 * file is in focus; around it sit the recorded files it imports or is imported
 * by (from the code graph), and the messages that touched any of them hang off
 * the files they touched. The layout is a small force simulation with no
 * randomness, so the same record always draws the same picture.
 */
import { graphFiles } from "../../cli/src/view/code-files.js";
import type { ViewFile, ViewFileHit, ViewFileLink } from "../../cli/src/view/model.js";

/** Messages shown per linked file; the focus file shows all of its own. */
export const LINKED_MESSAGES = 6;

export type GraphNodeKind = "file" | "session" | "branch" | "message" | "commit";

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
  /**
   * Messages: the commits they landed on the shown files; files: the commits
   * of the shown messages that changed them. Short hashes.
   */
  commits?: string[];
  /**
   * Sessions, branches and messages: a colour from the map's lane palette, so
   * the parts of one opened session (or one branch, inside a session) match.
   */
  tone?: number;
  /** Sessions and branches: their title, drawn under the dot. */
  label?: string;
  /** Sessions and branches: the messages inside, as message node ids. */
  members?: string[];
  /** Sessions and branches peeled open: drawn as a small hub their parts hang from. */
  open?: boolean;
  /** Messages, sessions, branches: touched the focus file itself (one of their messages did). */
  direct?: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  /**
   * `import` between two files, `touch` from a message to a file, `share`
   * between two messages that touched the same files, `landed` from a message
   * to a commit it made, `changed` from a commit to a file it changed, `part`
   * from an opened session or branch to what it holds.
   */
  kind: "import" | "touch" | "share" | "landed" | "changed" | "part";
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

export { graphFiles, isNoiseFile } from "../../cli/src/view/code-files.js";

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
  // A message also links to every shown file it touched, even past a file's
  // limit, and both sides learn the commits that joined them.
  const fileNode = new Map(nodes.map((node) => [node.id, node]));
  const add = (node: GraphNode, hashes: readonly string[]) => {
    if (hashes.length > 0) node.commits = [...new Set([...(node.commits ?? []), ...hashes])];
  };
  for (const path of shown)
    for (const hit of byPath.get(path)?.hits ?? []) {
      const id = messageId(hit);
      const message = messages.get(id);
      if (message === undefined) continue;
      if (path === focus) message.direct = true;
      if (!edges.some((edge) => edge.from === id && edge.to === path))
        edges.push({ from: id, to: path, kind: "touch" });
      const short = hit.commits.map((hash) => hash.slice(0, 7));
      add(message, short);
      add(fileNode.get(path) as GraphNode, short);
    }
  return { nodes: [...nodes, ...messages.values()], edges, hidden };
}

/** Files the whole-project picture draws when the files are shown: the most discussed. */
export const PROJECT_FILES = 25;

/**
 * The whole project, with no file in focus: every message that touched one of
 * `files` (code files), tied to the files it touched, and the import links
 * among them. The onion then starts from all the sessions.
 */
export function buildProjectGraph(
  files: readonly ViewFile[],
  links: readonly ViewFileLink[] | undefined,
): FileGraph {
  const nodes: GraphNode[] = files.map((file) => ({
    id: file.path,
    kind: "file",
    x: 0,
    y: 0,
    r: 8 + Math.sqrt(file.count) * 3.5,
    count: file.count,
  }));
  const fileNode = new Map(nodes.map((node) => [node.id, node]));
  const edges: GraphEdge[] = (links ?? [])
    .filter((link) => fileNode.has(link.from) && fileNode.has(link.to))
    .map((link) => ({ from: link.from, to: link.to, kind: "import" as const }));
  const messages = new Map<string, GraphNode>();
  for (const file of files)
    for (const hit of file.hits) {
      const id = messageId(hit);
      const message = messages.get(id) ?? { id, kind: "message", x: 0, y: 0, r: 5, hit };
      messages.set(id, message);
      edges.push({ from: id, to: file.path, kind: "touch" });
      const short = hit.commits.map((hash) => hash.slice(0, 7));
      if (short.length === 0) continue;
      message.commits = [...new Set([...(message.commits ?? []), ...short])];
      const node = fileNode.get(file.path) as GraphNode;
      node.commits = [...new Set([...(node.commits ?? []), ...short])];
    }
  return { nodes: [...nodes, ...messages.values()], edges, hidden: 0 };
}

/**
 * The commits layer: one square per commit the shown thoughts landed, tied to
 * the thought that made it and, when the files are drawn, to the files it
 * changed among them.
 */
export function withCommits(graph: FileGraph): FileGraph {
  const commits = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const files = graph.nodes.filter((node) => node.kind === "file");
  for (const node of graph.nodes) {
    if (node.kind === "file" || node.kind === "commit" || node.open) continue;
    for (const hash of node.commits ?? []) {
      const id = `commit:${hash}`;
      if (!commits.has(id)) {
        commits.set(id, { id, kind: "commit", x: 0, y: 0, r: 4.5, commits: [hash] });
        for (const file of files)
          if (file.commits?.includes(hash)) edges.push({ from: id, to: file.id, kind: "changed" });
      }
      edges.push({ from: node.id, to: id, kind: "landed" });
    }
  }
  return {
    nodes: [...graph.nodes, ...commits.values()],
    edges: [...graph.edges, ...edges],
    hidden: graph.hidden,
  };
}

/** The strongest links each session, branch or message keeps. */
export const SHARED_LINKS = 3;

/** Which sessions and branches are peeled open in place, by session id and {@link branchKey}. */
export interface Peeled {
  sessions: ReadonlySet<string>;
  branches: ReadonlySet<string>;
}

/**
 * How the onion is shown: from inside one session (its branches) or one
 * branch (its messages), the rest hidden; or, opened in place, everything at
 * once with the `peeled` sessions and branches open as hubs.
 */
export interface OnionView {
  inside?: { session: string; branch?: string } | undefined;
  peeled?: Peeled | undefined;
}

/** A branch's key: its session and its title (messages before any branch share ""). */
export function branchKey(hit: ViewFileHit): string {
  return `${hit.sessionId}|${hit.branch ?? ""}`;
}

/** The name a branch-less group of messages goes by. */
export const NO_BRANCH = "Before any branch";

/**
 * The picture as layers, peeled like an onion. It starts from the sessions;
 * inside one it shows that session's branches, inside a branch its messages,
 * and the rest is hidden. Opened in place instead, an opened session or branch
 * stays as a small hub its parts hang from, so a click on it folds it again.
 *
 * Two shown parts are linked when they touched the same files. A file counts
 * for less the more parts touched it (`ln((n + 1) / parts touching it)`), so a
 * file everything touches links nothing and a rare one links strongly; the
 * focus file never counts. Each part keeps its {@link SHARED_LINKS} strongest
 * links. With `withFiles` the files, their imports and which part touched
 * which are drawn instead: the focus and its linked files, or with no focus
 * the {@link PROJECT_FILES} most discussed.
 */
export function onionGraph(
  full: FileGraph,
  focus: string | undefined,
  view: OnionView,
  withFiles: boolean,
): FileGraph {
  const peeled = view.peeled ?? { sessions: new Set<string>(), branches: new Set<string>() };
  const all = full.nodes.filter((node) => node.kind === "message");
  // Branch colours follow the order branches appear in, inside or out.
  const branchTone = new Map<string, number>();
  const sessionBranches = new Map<string, string[]>();
  for (const message of all) {
    if (message.hit === undefined) continue;
    const key = branchKey(message.hit);
    const list = sessionBranches.get(message.hit.sessionId) ?? [];
    if (!list.includes(key)) {
      branchTone.set(key, list.length);
      sessionBranches.set(message.hit.sessionId, [...list, key]);
    }
  }
  const inside = view.inside;
  const messages = all.filter(
    (message) =>
      inside === undefined ||
      (message.hit?.sessionId === inside.session &&
        (inside.branch === undefined || branchKey(message.hit) === inside.branch)),
  );
  const touched = new Map<string, Set<string>>();
  for (const edge of full.edges)
    if (edge.kind === "touch")
      touched.set(edge.from, (touched.get(edge.from) ?? new Set()).add(edge.to));

  const hubs: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const parts: GraphNode[] = [];
  const toned = (node: GraphNode, tone: number | undefined): GraphNode =>
    tone === undefined ? node : { ...node, tone };
  const unit = (
    id: string,
    kind: "session" | "branch",
    label: string,
    members: GraphNode[],
    tone: number | undefined,
  ): GraphNode => {
    const commits = [...new Set(members.flatMap((member) => member.commits ?? []))];
    return toned(
      {
        id,
        kind,
        x: 0,
        y: 0,
        r: (kind === "session" ? 8 : 7) + Math.sqrt(members.length) * 2.5,
        label,
        members: members.map((member) => member.id),
        direct: members.some((member) => member.direct),
        ...(commits.length > 0 ? { commits } : {}),
      },
      tone,
    );
  };
  const hub = (node: GraphNode): GraphNode => ({ ...node, r: 5, open: true });
  const message = (node: GraphNode, tone: number | undefined): GraphNode =>
    toned({ ...node, r: node.direct ? 7 : 6 }, tone);

  const bySession = new Map<string, GraphNode[]>();
  for (const node of messages) {
    const sessionId = node.hit?.sessionId ?? "";
    bySession.set(sessionId, [...(bySession.get(sessionId) ?? []), node]);
  }
  let opened = 0;
  for (const [sessionId, inSession] of bySession) {
    const title = inSession[0]?.hit?.sessionTitle ?? sessionId;
    const byBranch = new Map<string, GraphNode[]>();
    for (const node of inSession) {
      const key = node.hit === undefined ? "" : branchKey(node.hit);
      byBranch.set(key, [...(byBranch.get(key) ?? []), node]);
    }
    const branchName = (list: GraphNode[]) => list[0]?.hit?.branch ?? NO_BRANCH;
    if (inside?.branch !== undefined) {
      // Inside a branch: its messages, in the branch's colour.
      for (const node of inSession) parts.push(message(node, branchTone.get(inside.branch)));
      continue;
    }
    if (inside !== undefined) {
      // Inside a session: its branches, each in its own colour.
      for (const [key, inBranch] of byBranch)
        parts.push(
          unit(`branch:${key}`, "branch", branchName(inBranch), inBranch, branchTone.get(key)),
        );
      continue;
    }
    if (!peeled.sessions.has(sessionId)) {
      parts.push(unit(`session:${sessionId}`, "session", title, inSession, undefined));
      continue;
    }
    // Opened in place: the session keeps a colour its parts share.
    const tone = opened;
    opened += 1;
    const session = unit(`session:${sessionId}`, "session", title, inSession, tone);
    hubs.push(hub(session));
    for (const [key, inBranch] of byBranch) {
      const branch = unit(`branch:${key}`, "branch", branchName(inBranch), inBranch, tone);
      edges.push({ from: session.id, to: branch.id, kind: "part" });
      if (!peeled.branches.has(key)) {
        parts.push(branch);
        continue;
      }
      hubs.push(hub(branch));
      for (const node of inBranch) {
        parts.push(message(node, tone));
        edges.push({ from: branch.id, to: node.id, kind: "part" });
      }
    }
  }

  // What each shown part touched: its own files, or its messages' files.
  const reach = new Map(
    parts.map((node) => [
      node.id,
      new Set((node.members ?? [node.id]).flatMap((id) => [...(touched.get(id) ?? [])])),
    ]),
  );
  const spread = new Map<string, number>();
  for (const files of reach.values())
    for (const file of files) spread.set(file, (spread.get(file) ?? 0) + 1);
  const rarity = (file: string) => Math.log((parts.length + 1) / (spread.get(file) ?? 1));
  const best = new Map<string, { other: string; weight: number }[]>();
  for (let i = 0; i < parts.length; i += 1)
    for (let j = i + 1; j < parts.length; j += 1) {
      const a = (parts[i] as GraphNode).id;
      const b = (parts[j] as GraphNode).id;
      const theirs = reach.get(b) as Set<string>;
      let weight = 0;
      for (const file of reach.get(a) as Set<string>)
        if (file !== focus && theirs.has(file)) weight += rarity(file);
      if (weight <= 0) continue;
      weight = Math.round(weight * 100) / 100;
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

  if (!withFiles)
    return { nodes: [...hubs, ...parts], edges: [...edges, ...kept.values()], hidden: full.hidden };
  const fileNodes = full.nodes.filter((node) => node.kind === "file");
  const shownFiles =
    focus === undefined
      ? [...fileNodes]
          .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.id.localeCompare(b.id))
          .slice(0, PROJECT_FILES)
      : fileNodes;
  const drawn = new Set(shownFiles.map((node) => node.id));
  const fileEdges: GraphEdge[] = full.edges.filter(
    (edge) => edge.kind === "import" && drawn.has(edge.from) && drawn.has(edge.to),
  );
  for (const part of parts)
    for (const file of reach.get(part.id) ?? [])
      if (drawn.has(file)) fileEdges.push({ from: part.id, to: file, kind: "touch" });
  return {
    nodes: [...shownFiles, ...hubs, ...parts],
    edges: [...fileEdges, ...edges],
    hidden: full.hidden,
  };
}

const ITERATIONS = 300;
/** The furthest a node moves in one step of the layout. */
const MAX_STEP = 40;
const CHARGE = { file: 1400, session: 260, branch: 160, message: 90, commit: 40 } as const;
const LINK = {
  import: { distance: 200, strength: 0.4 },
  touch: { distance: 60, strength: 0.35 },
  share: { distance: 70, strength: 0.15 },
  landed: { distance: 26, strength: 0.6 },
  changed: { distance: 90, strength: 0.05 },
  part: { distance: 55, strength: 0.6 },
} as const;

/** Barnes-Hut: a cell this much smaller than its distance counts as one body. */
const THETA = 0.9;

interface Cell {
  x: number;
  y: number;
  size: number;
  /** Summed charge root and the charge-weighted centre of what the cell holds. */
  q: number;
  cx: number;
  cy: number;
  bodies: number[];
  kids?: (Cell | undefined)[];
}

/**
 * A quadtree over the nodes, so the repulsion of a far group is one sum instead
 * of one per node: the layout costs n log n a step, not n², and a project with
 * a thousand parts no longer freezes the page.
 */
function quadtree(xs: number[], ys: number[], qs: number[]): Cell {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < xs.length; i += 1) {
    minX = Math.min(minX, xs[i] as number);
    minY = Math.min(minY, ys[i] as number);
    maxX = Math.max(maxX, xs[i] as number);
    maxY = Math.max(maxY, ys[i] as number);
  }
  const root: Cell = {
    x: minX,
    y: minY,
    size: Math.max(maxX - minX, maxY - minY, 1),
    q: 0,
    cx: 0,
    cy: 0,
    bodies: [],
  };
  const insert = (cell: Cell, i: number): void => {
    const q = qs[i] as number;
    cell.cx = (cell.cx * cell.q + (xs[i] as number) * q) / (cell.q + q);
    cell.cy = (cell.cy * cell.q + (ys[i] as number) * q) / (cell.q + q);
    cell.q += q;
    // Bodies on the same spot, or cells too small to split further, share a leaf.
    if (cell.kids === undefined && (cell.bodies.length === 0 || cell.size < 1)) {
      cell.bodies.push(i);
      return;
    }
    if (cell.kids === undefined) {
      cell.kids = [];
      const held = cell.bodies;
      cell.bodies = [];
      for (const j of held) place(cell, j);
    }
    place(cell, i);
  };
  const place = (cell: Cell, i: number): void => {
    const half = cell.size / 2;
    const right = (xs[i] as number) >= cell.x + half ? 1 : 0;
    const down = (ys[i] as number) >= cell.y + half ? 1 : 0;
    const kids = cell.kids as (Cell | undefined)[];
    const slot = down * 2 + right;
    let kid = kids[slot];
    if (kid === undefined) {
      kid = {
        x: cell.x + right * half,
        y: cell.y + down * half,
        size: half,
        q: 0,
        cx: 0,
        cy: 0,
        bodies: [],
      };
      kids[slot] = kid;
    }
    insert(kid, i);
  };
  for (let i = 0; i < xs.length; i += 1) insert(root, i);
  return root;
}

/**
 * Places the nodes: the focus at the origin, the linked files on a ring, the
 * messages near the files they touched, then settles them with a force
 * simulation (repulsion, springs, collision) like d3-force's, with no
 * randomness. Returns new nodes; the input is left as it is.
 *
 * `previous` holds where nodes were last drawn: those keep their place, and only
 * the new ones settle around them, so turning a layer on or off does not move
 * what was already on the screen.
 */
export function layoutFileGraph(
  graph: FileGraph,
  previous?: ReadonlyMap<string, { x: number; y: number }>,
): GraphNode[] {
  const nodes = graph.nodes.map((node) => ({ ...node, vx: 0, vy: 0 }));
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const kept = new Set<string>();
  for (const node of nodes) {
    const was = previous?.get(node.id);
    if (was === undefined) continue;
    node.x = was.x;
    node.y = was.y;
    kept.add(node.id);
  }
  const listed = <T>(map: Map<string, T[]>, key: string, value: T): void => {
    const list = map.get(key);
    if (list === undefined) map.set(key, [value]);
    else list.push(value);
  };
  const neighbours = new Map<string, string[]>();
  for (const edge of graph.edges) {
    listed(neighbours, edge.from, edge.to);
    listed(neighbours, edge.to, edge.from);
  }
  const files = nodes.filter((node) => node.kind === "file");
  const ring = files.filter((node) => node.role !== "focus" && !kept.has(node.id));
  ring.forEach((node, i) => {
    const angle = (i / Math.max(1, ring.length)) * 2 * Math.PI;
    node.x = Math.cos(angle) * 220;
    node.y = Math.sin(angle) * 220;
  });
  const touchedBy = new Map<string, string[]>();
  for (const edge of graph.edges) if (edge.kind === "touch") listed(touchedBy, edge.from, edge.to);
  nodes.forEach((node, i) => {
    if (node.kind === "file" || node.kind === "commit" || kept.has(node.id)) return;
    const at = (touchedBy.get(node.id) ?? []).map((id) => nodes[index.get(id) as number]);
    const cx = at.reduce((sum, file) => sum + (file?.x ?? 0), 0) / Math.max(1, at.length);
    const cy = at.reduce((sum, file) => sum + (file?.y ?? 0), 0) / Math.max(1, at.length);
    // The golden angle spreads siblings evenly without a random start.
    const angle = i * 2.399963;
    // With no file to start from (the thoughts-only picture), a spiral.
    const radius = at.length === 0 ? 18 * Math.sqrt(i + 1) : 60;
    node.x = cx + Math.cos(angle) * radius;
    node.y = cy + Math.sin(angle) * radius;
  });
  // A commit starts beside the thought that landed it.
  for (const edge of graph.edges) {
    if (edge.kind !== "landed") continue;
    const message = nodes[index.get(edge.from) as number];
    const commit = nodes[index.get(edge.to) as number];
    if (message === undefined || commit === undefined || kept.has(commit.id)) continue;
    if (commit.x !== 0 || commit.y !== 0) continue;
    const angle = (index.get(edge.to) as number) * 2.399963;
    commit.x = message.x + Math.cos(angle) * 20;
    commit.y = message.y + Math.sin(angle) * 20;
  }
  // A node new to a picture that was already drawn starts beside what it links to.
  if (kept.size > 0)
    nodes.forEach((node, i) => {
      if (kept.has(node.id)) return;
      const anchors = (neighbours.get(node.id) ?? []).filter((id) => kept.has(id));
      if (anchors.length === 0) return;
      const at = anchors.map((id) => nodes[index.get(id) as number] as (typeof nodes)[number]);
      const angle = i * 2.399963;
      node.x = at.reduce((sum, n) => sum + n.x, 0) / at.length + Math.cos(angle) * 40;
      node.y = at.reduce((sum, n) => sum + n.y, 0) / at.length + Math.sin(angle) * 40;
    });

  // Thoughts alone carry a title under each dot, so they keep more room.
  const thoughtsOnly = !nodes.some((node) => node.kind === "file");
  const room = thoughtsOnly
    ? { charge: 4, distance: 1.7, gap: 22 }
    : { charge: 1, distance: 1, gap: 3 };
  const springs: { a: number; b: number; distance: number; strength: number }[] = [];
  const degree = nodes.map(() => 0);
  for (const edge of graph.edges) {
    const a = index.get(edge.from);
    const b = index.get(edge.to);
    if (a === undefined || b === undefined) continue;
    const link = LINK[edge.kind];
    // A thought pair sharing more files pulls harder.
    const strength = Math.min(0.6, link.strength * (edge.weight ?? 1));
    springs.push({ a, b, distance: link.distance * room.distance, strength });
    degree[a] = (degree[a] as number) + 1;
    degree[b] = (degree[b] as number) + 1;
  }
  const fixed = (node: (typeof nodes)[number]) => node.role === "focus" || kept.has(node.id);
  // A node with no link has nothing holding it, so the others push it far off
  // the page; after the layout it is set down beside its nearest linked node.
  const lonely = new Set(nodes.filter((node, i) => degree[i] === 0 && !kept.has(node.id)));
  // Without the focus file in the picture, its thoughts gather in the middle.
  const centre = !nodes.some((node) => node.role === "focus");
  const charge = nodes.map((node) => Math.sqrt(CHARGE[node.kind]));
  const reach = Math.max(1, ...nodes.map((node) => node.r)) * 2 + room.gap;

  const steps = nodes.every(fixed) ? 0 : ITERATIONS;
  for (let step = 0; step < steps; step += 1) {
    const alpha = (1 - step / ITERATIONS) ** 2;
    const xs = nodes.map((node) => node.x);
    const ys = nodes.map((node) => node.y);
    const tree = quadtree(xs, ys, charge);
    nodes.forEach((a, i) => {
      if (fixed(a)) return;
      const qa = (charge[i] as number) * alpha * room.charge;
      const visit = (cell: Cell): void => {
        const dx = cell.cx - a.x || 0.01;
        const dy = cell.cy - a.y || 0.01;
        const d2 = dx * dx + dy * dy;
        if (cell.kids === undefined || (cell.size * cell.size) / d2 < THETA * THETA) {
          // A leaf, or a cell far enough to stand for everything in it.
          let q = cell.q;
          if (cell.kids === undefined && cell.bodies.includes(i)) {
            q -= charge[i] as number;
            if (q <= 0) return;
          }
          const push = (qa * q) / Math.max(d2, 25);
          a.vx -= dx * push;
          a.vy -= dy * push;
          return;
        }
        for (const kid of cell.kids) if (kid !== undefined) visit(kid);
      };
      visit(tree);
    });
    for (const spring of springs) {
      const a = nodes[spring.a] as (typeof nodes)[number];
      const b = nodes[spring.b] as (typeof nodes)[number];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const pull = ((d - spring.distance) / d) * spring.strength * alpha;
      // As in d3-force, the end with more links moves less: a session tied to
      // forty commits would otherwise be yanked forty ways at once and the
      // layout would swing further on every step until it flew apart.
      const share =
        (degree[spring.a] as number) /
        ((degree[spring.a] as number) + (degree[spring.b] as number));
      a.vx += dx * pull * (1 - share);
      a.vy += dy * pull * (1 - share);
      b.vx -= dx * pull * share;
      b.vy -= dy * pull * share;
    }
    for (const node of nodes) {
      if (fixed(node)) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      const gravity = centre && node.direct ? 0.15 : 0.01;
      node.vx -= node.x * gravity * alpha;
      node.vy -= node.y * gravity * alpha;
      // A last guard: no step moves a node further than this.
      node.vx = Math.max(-MAX_STEP, Math.min(MAX_STEP, node.vx * 0.6));
      node.vy = Math.max(-MAX_STEP, Math.min(MAX_STEP, node.vy * 0.6));
      node.x += node.vx;
      node.y += node.vy;
    }
    // Collision: no two circles overlap, and a fixed node never moves. Only
    // nodes in the same or a neighbouring grid cell can touch.
    const grid = new Map<string, number[]>();
    nodes.forEach((node, i) => {
      listed(grid, `${Math.floor(node.x / reach)},${Math.floor(node.y / reach)}`, i);
    });
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i] as (typeof nodes)[number];
      const gx = Math.floor(a.x / reach);
      const gy = Math.floor(a.y / reach);
      for (let ox = -1; ox <= 1; ox += 1)
        for (let oy = -1; oy <= 1; oy += 1)
          for (const j of grid.get(`${gx + ox},${gy + oy}`) ?? []) {
            if (j <= i) continue;
            const b = nodes[j] as (typeof nodes)[number];
            const dx = b.x - a.x || 0.01;
            const dy = b.y - a.y || 0.01;
            const d = Math.sqrt(dx * dx + dy * dy);
            const gap = a.r + b.r + room.gap - d;
            if (gap <= 0 || (fixed(a) && fixed(b))) continue;
            const share = fixed(a) ? [0, 1] : fixed(b) ? [1, 0] : [0.5, 0.5];
            a.x -= (dx / d) * gap * (share[0] as number);
            a.y -= (dy / d) * gap * (share[0] as number);
            b.x += (dx / d) * gap * (share[1] as number);
            b.y += (dy / d) * gap * (share[1] as number);
          }
    }
  }
  // Each lonely node goes just outside its nearest linked node, on the side
  // away from the middle, clear of anything already there.
  const settled = nodes.filter((node) => !lonely.has(node));
  if (settled.length > 0) {
    const cx = settled.reduce((sum, node) => sum + node.x, 0) / settled.length;
    const cy = settled.reduce((sum, node) => sum + node.y, 0) / settled.length;
    for (const node of lonely) {
      let near = settled[0] as (typeof nodes)[number];
      for (const other of settled)
        if (
          Math.hypot(other.x - node.x, other.y - node.y) <
          Math.hypot(near.x - node.x, near.y - node.y)
        )
          near = other;
      const dx = near.x - cx || 1;
      const dy = near.y - cy;
      const length = Math.hypot(dx, dy);
      let gap = near.r + node.r + room.gap + 8;
      const at = () => ({ x: near.x + (dx / length) * gap, y: near.y + (dy / length) * gap });
      const clear = () =>
        settled.every((other) => {
          const spot = at();
          return Math.hypot(other.x - spot.x, other.y - spot.y) >= other.r + node.r + room.gap;
        });
      for (let tries = 0; tries < 20 && !clear(); tries += 1) gap += node.r * 2 + room.gap;
      ({ x: node.x, y: node.y } = at());
      settled.push(node);
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
  const ys = nodes.flatMap((node) => [node.y - node.r - 18, node.y + node.r + 14]);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  return {
    minX,
    minY,
    width: Math.max(...xs) + pad - minX,
    height: Math.max(...ys) + pad - minY,
  };
}

/** The most other branches a message's card names as related. */
export const RELATED_BRANCHES = 3;

/** Another branch that worked on the same rare code files as a message. */
export interface RelatedBranch {
  sessionId: string;
  sessionTitle: string;
  /** The branch's title; undefined for messages before any branch. */
  branch: string | undefined;
  /** The shared files, rarest first. */
  files: string[];
  weight: number;
  /** The branch's message that touched most of them, newest on a tie. */
  hit: ViewFileHit;
}

/**
 * The other branches, in any session, that touched the same code files as one
 * message, strongest first. A file weighs as in {@link onionGraph}, counted
 * over branches: `ln((branches + 1) / branches touching it)`, so a file every
 * branch touches relates almost nothing. Keeps {@link RELATED_BRANCHES}.
 */
export function relatedBranches(
  files: readonly ViewFile[],
  codeFiles: readonly string[] | undefined,
  sessionId: string,
  messageId: string,
): RelatedBranch[] {
  const code = graphFiles(files, codeFiles);
  const own = code.filter((file) =>
    file.hits.some((hit) => hit.sessionId === sessionId && hit.messageId === messageId),
  );
  const ownHit = own[0]?.hits.find(
    (hit) => hit.sessionId === sessionId && hit.messageId === messageId,
  );
  if (ownHit === undefined) return [];
  const ownBranch = branchKey(ownHit);
  const touching = new Map(
    code.map((file) => [file.path, new Set(file.hits.map((hit) => branchKey(hit)))]),
  );
  const branches = new Set([...touching.values()].flatMap((keys) => [...keys]));
  const rarity = (path: string) => Math.log((branches.size + 1) / (touching.get(path)?.size ?? 1));
  type Found = { files: string[]; weight: number; hits: Map<string, ViewFileHit[]> };
  const found = new Map<string, Found>();
  for (const file of own)
    for (const hit of file.hits) {
      const key = branchKey(hit);
      if (key === ownBranch) continue;
      const entry: Found = found.get(key) ?? { files: [], weight: 0, hits: new Map() };
      if (!entry.files.includes(file.path)) {
        entry.files.push(file.path);
        entry.weight += rarity(file.path);
      }
      entry.hits.set(hit.messageId, [...(entry.hits.get(hit.messageId) ?? []), hit]);
      found.set(key, entry);
    }
  const byNewest = (a: ViewFileHit, b: ViewFileHit) => (b.at ?? "").localeCompare(a.at ?? "");
  return [...found.values()]
    .filter((entry) => entry.weight > 0)
    .map((entry) => {
      const hit = [...entry.hits.values()]
        .sort((a, b) => b.length - a.length || byNewest(a[0] as ViewFileHit, b[0] as ViewFileHit))
        .map((list) => list[0] as ViewFileHit)[0] as ViewFileHit;
      return {
        sessionId: hit.sessionId,
        sessionTitle: hit.sessionTitle,
        branch: hit.branch,
        files: [...entry.files].sort((a, b) => rarity(b) - rarity(a) || a.localeCompare(b)),
        weight: Math.round(entry.weight * 100) / 100,
        hit,
      };
    })
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        byNewest(a.hit, b.hit) ||
        `${a.sessionId}|${a.branch ?? ""}`.localeCompare(`${b.sessionId}|${b.branch ?? ""}`),
    )
    .slice(0, RELATED_BRANCHES);
}

/** The messages that touched `path`, by session; empty when no file has that path. */
export function touchedBy(
  files: readonly ViewFile[],
  path: string,
): Map<string, ReadonlySet<string>> {
  const touched = new Map<string, Set<string>>();
  for (const hit of files.find((file) => file.path === path)?.hits ?? [])
    touched.set(hit.sessionId, (touched.get(hit.sessionId) ?? new Set()).add(hit.messageId));
  return touched;
}
