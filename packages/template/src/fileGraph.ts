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

/**
 * Without a code graph to say which files are code, the files a project
 * rarely decides anything in, by name: lockfiles, config, dotfiles, version
 * and licence files, and dependency or build folders.
 */
export function isNoiseFile(path: string): boolean {
  const name = path.split("/").pop() ?? path;
  return (
    /(^|\/)(node_modules|dist|build|out|coverage|vendor)\//.test(path) ||
    path.split("/").some((part) => part.startsWith(".")) ||
    /\.(json|jsonc|ya?ml|toml|ini|lock|env|cfg|conf)$/i.test(name) ||
    /^(VERSION|LICEN[CS]E(\..*)?|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i.test(name)
  );
}

/**
 * The files the Graph view offers: the ones the code graph has as code, or,
 * without a graph, every file that is not noise by name.
 */
export function graphFiles(
  files: readonly ViewFile[],
  codeFiles: readonly string[] | undefined,
): ViewFile[] {
  if (codeFiles === undefined) return files.filter((file) => !isNoiseFile(file.path));
  const code = new Set(codeFiles);
  return files.filter((file) => code.has(file.path));
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
    if (node.kind === "file" || node.kind === "commit") return;
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
  // A commit starts beside the thought that landed it.
  for (const edge of graph.edges) {
    if (edge.kind !== "landed") continue;
    const message = nodes[index.get(edge.from) as number];
    const commit = nodes[index.get(edge.to) as number];
    if (message === undefined || commit === undefined || commit.x !== 0 || commit.y !== 0) continue;
    const angle = (index.get(edge.to) as number) * 2.399963;
    commit.x = message.x + Math.cos(angle) * 20;
    commit.y = message.y + Math.sin(angle) * 20;
  }

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
        const push = (alpha * room.charge * Math.sqrt(CHARGE[a.kind] * CHARGE[b.kind])) / d2;
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
    // Collision: no two circles overlap, and the focus never moves.
    for (let i = 0; i < nodes.length; i += 1)
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i] as (typeof nodes)[number];
        const b = nodes[j] as (typeof nodes)[number];
        const dx = b.x - a.x || 0.01;
        const dy = b.y - a.y || 0.01;
        const d = Math.sqrt(dx * dx + dy * dy);
        const gap = a.r + b.r + room.gap - d;
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
