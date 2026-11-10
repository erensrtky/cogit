import { describe, expect, it } from "vitest";
import type { ViewFile, ViewFileHit, ViewFileLink } from "../../cli/src/view/model.js";
import {
  branchKey,
  buildFileGraph,
  buildProjectGraph,
  type FileGraph,
  type GraphEdge,
  type GraphNode,
  graphBounds,
  graphFiles,
  isNoiseFile,
  isTestPath,
  LINKED_MESSAGES,
  layoutFileGraph,
  NO_BRANCH,
  onionGraph,
  PROJECT_FILES,
  RELATED_BRANCHES,
  relatedBranches,
  touchedBy,
  withCommits,
} from "../src/fileGraph.js";

function hit(messageId: string, sessionId = "s1"): ViewFileHit {
  return {
    sessionId,
    sessionTitle: "Session",
    messageId,
    label: messageId,
    title: `Message ${messageId}`,
    commits: [],
  };
}

function file(path: string, hits: ViewFileHit[]): ViewFile {
  return { path, hits, count: hits.length };
}

const files: ViewFile[] = [
  file("src/thought.ts", [hit("m1"), hit("m2")]),
  file("src/git.ts", [hit("m2"), hit("m3")]),
  file("src/pr.ts", [hit("m4")]),
  file("src/far.ts", [hit("m5")]),
  file("test/thought.test.ts", [hit("m6")]),
];
const links: ViewFileLink[] = [
  { from: "src/thought.ts", to: "src/git.ts" },
  { from: "src/pr.ts", to: "src/thought.ts" },
  { from: "src/pr.ts", to: "src/git.ts" },
  { from: "test/thought.test.ts", to: "src/thought.ts" },
];

describe("the Graph view's model", () => {
  it("puts the focus with the files it imports and is imported by, and their messages", () => {
    const graph = buildFileGraph(files, links, "src/thought.ts");
    const fileNodes = graph.nodes.filter((node) => node.kind === "file");
    expect(fileNodes.map((node) => [node.id, node.role])).toEqual([
      ["src/thought.ts", "focus"],
      ["src/git.ts", "imports"],
      ["src/pr.ts", "imported-by"],
    ]);
    const messages = graph.nodes.filter((node) => node.kind === "message").map((node) => node.id);
    expect(messages).toEqual(["s1:m1", "s1:m2", "s1:m3", "s1:m4"]);
    // m2 touched both the focus and git.ts: one node, two edges, marked direct.
    const m2 = graph.nodes.find((node) => node.id === "s1:m2");
    expect(m2?.direct).toBe(true);
    expect(graph.edges.filter((edge) => edge.from === "s1:m2").map((edge) => edge.to)).toEqual([
      "src/thought.ts",
      "src/git.ts",
    ]);
    // Imports among the shown files, the focus's and the neighbours' own.
    expect(graph.edges.filter((edge) => edge.kind === "import")).toHaveLength(3);
  });

  it("leaves test files out unless one is in focus", () => {
    expect(isTestPath("test/thought.test.ts")).toBe(true);
    expect(isTestPath("src/__tests__/a.ts")).toBe(true);
    expect(isTestPath("src/a.spec.tsx")).toBe(true);
    expect(isTestPath("src/testing.ts")).toBe(false);
    const ids = buildFileGraph(files, links, "src/thought.ts").nodes.map((node) => node.id);
    expect(ids).not.toContain("test/thought.test.ts");
    const fromTest = buildFileGraph(files, links, "test/thought.test.ts");
    expect(fromTest.nodes.map((node) => node.id)).toContain("src/thought.ts");
  });

  it("shows the focus file alone when there is no code graph, or nothing for an unknown file", () => {
    const alone = buildFileGraph(files, undefined, "src/git.ts");
    expect(alone.nodes.map((node) => node.id)).toEqual(["src/git.ts", "s1:m2", "s1:m3"]);
    expect(buildFileGraph(files, links, "src/nowhere.ts")).toEqual({
      nodes: [],
      edges: [],
      hidden: 0,
    });
  });

  it("caps a linked file's messages and counts the rest", () => {
    const many = Array.from({ length: LINKED_MESSAGES + 3 }, (_, i) => hit(`n${i}`));
    const graph = buildFileGraph(
      [file("a.ts", [hit("m1")]), file("b.ts", many)],
      [{ from: "a.ts", to: "b.ts" }],
      "a.ts",
    );
    expect(graph.hidden).toBe(3);
    expect(graph.nodes.filter((node) => node.kind === "message")).toHaveLength(1 + LINKED_MESSAGES);
  });
});

describe("which files the Graph view offers", () => {
  const recorded = [
    file("src/a.ts", [hit("m1")]),
    file("package.json", [hit("m2")]),
    file("CHANGELOG.md", [hit("m3")]),
  ];

  it("keeps only the files the code graph has as code", () => {
    expect(graphFiles(recorded, ["src/a.ts"]).map((f) => f.path)).toEqual(["src/a.ts"]);
  });

  it("leaves out config, lockfiles, dotfiles and build folders by name without a graph", () => {
    for (const path of [
      "package.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "tsconfig.json",
      ".github/workflows/ci.yml",
      ".env",
      "node_modules/x/index.js",
      "packages/cli/dist/cli.js",
      "VERSION",
      "LICENSE",
    ])
      expect(isNoiseFile(path), path).toBe(true);
    for (const path of ["src/a.ts", "CHANGELOG.md", "scripts/build.mjs"])
      expect(isNoiseFile(path), path).toBe(false);
    expect(graphFiles(recorded, undefined).map((f) => f.path)).toEqual([
      "src/a.ts",
      "CHANGELOG.md",
    ]);
  });
});

describe("the Graph view's layout", () => {
  const graph = buildFileGraph(files, links, "src/thought.ts");

  it("keeps the focus at the centre and draws the same picture every time", () => {
    const first = layoutFileGraph(graph);
    const again = layoutFileGraph(graph);
    expect(first).toEqual(again);
    expect(first[0]).toMatchObject({ id: "src/thought.ts", x: 0, y: 0 });
    for (const node of first) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
    // The input is left as it is.
    expect(graph.nodes.every((node) => node.x === 0 && node.y === 0)).toBe(true);
  });

  it("keeps what was drawn in place when a layer is turned on or off", () => {
    // Sessions around files, then the same picture with each session's commits.
    const base: FileGraph = { nodes: [], edges: [], hidden: 0 };
    for (let f = 0; f < 4; f += 1) base.nodes.push({ id: `f${f}`, kind: "file", x: 0, y: 0, r: 6 });
    for (let s = 0; s < 12; s += 1) {
      base.nodes.push({ id: `s${s}`, kind: "session", x: 0, y: 0, r: 8 });
      base.edges.push({ from: `s${s}`, to: `f${s % 4}`, kind: "touch" });
    }
    const more: FileGraph = { ...base, nodes: [...base.nodes], edges: [...base.edges] };
    for (let s = 0; s < 12; s += 1)
      for (let c = 0; c < 3; c += 1) {
        more.nodes.push({ id: `s${s}c${c}`, kind: "commit", x: 0, y: 0, r: 3 });
        more.edges.push({ from: `s${s}`, to: `s${s}c${c}`, kind: "landed" });
      }
    const placed = (nodes: GraphNode[]) => new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));

    const before = layoutFileGraph(base);
    const after = layoutFileGraph(more, placed(before));
    for (const node of before)
      expect(after.find((n) => n.id === node.id)).toMatchObject({ x: node.x, y: node.y });
    // The new commits settle near the session that landed them, clear of the rest.
    const touching: string[] = [];
    for (const node of after.filter((n) => n.kind === "commit")) {
      expect(Number.isFinite(node.x) && Number.isFinite(node.y)).toBe(true);
      const session = after.find((n) => n.id === node.id.replace(/c\d$/, "")) as GraphNode;
      expect(Math.hypot(node.x - session.x, node.y - session.y)).toBeLessThan(120);
      for (const other of after)
        if (other !== node && Math.hypot(node.x - other.x, node.y - other.y) <= node.r + other.r)
          touching.push(`${node.id} ${other.id}`);
    }
    expect(touching).toEqual([]);
    // Turned off again, nothing left moves.
    expect(layoutFileGraph(base, placed(after))).toEqual(before);
  });

  it("lays out a thousand nodes without overlaps", () => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    for (let f = 0; f < 100; f += 1) nodes.push({ id: `f${f}`, kind: "file", x: 0, y: 0, r: 6 });
    for (let s = 0; nodes.length < 1000; s += 1) {
      nodes.push({ id: `s${s}`, kind: "session", x: 0, y: 0, r: 8 });
      edges.push({ from: `s${s}`, to: `f${(s * 7) % 100}`, kind: "touch" });
      for (let c = 0; c < 3 && nodes.length < 1000; c += 1) {
        nodes.push({ id: `s${s}c${c}`, kind: "commit", x: 0, y: 0, r: 3 });
        edges.push({ from: `s${s}`, to: `s${s}c${c}`, kind: "landed" });
      }
    }
    const laid = layoutFileGraph({ nodes, edges, hidden: 0 });
    for (const node of laid) expect(Number.isFinite(node.x) && Number.isFinite(node.y)).toBe(true);
    let overlaps = 0;
    for (let i = 0; i < laid.length; i += 1)
      for (let j = i + 1; j < laid.length; j += 1) {
        const a = laid[i] as GraphNode;
        const b = laid[j] as GraphNode;
        if (Math.hypot(a.x - b.x, a.y - b.y) <= a.r + b.r) overlaps += 1;
      }
    expect(overlaps).toBe(0);
  });

  it("does not let two nodes overlap", () => {
    const nodes = layoutFileGraph(graph);
    for (let i = 0; i < nodes.length; i += 1)
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        if (a === undefined || b === undefined) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r);
      }
  });

  it("measures the drawing with room for the labels", () => {
    expect(graphBounds([])).toEqual({ minX: 0, minY: 0, width: 1, height: 1 });
    const box = graphBounds([{ id: "a", kind: "file", x: 0, y: 0, r: 10 }]);
    expect(box).toEqual({ minX: -50, minY: -68, width: 100, height: 132 });
  });
});

describe("the onion: sessions, branches, messages", () => {
  const closed = {};
  const inSession = (messageId: string, sessionId: string, branch?: string): ViewFileHit => ({
    ...hit(messageId, sessionId),
    sessionTitle: `Session ${sessionId}`,
    ...(branch === undefined ? {} : { branch }),
  });
  const recorded = [
    file("src/focus.ts", [inSession("m1", "s1", "Alpha"), inSession("m2", "s2")]),
    file("src/side.ts", [inSession("m3", "s1", "Beta"), inSession("m4", "s2")]),
    file("src/other.ts", [inSession("m3", "s1", "Beta"), inSession("m4", "s2")]),
  ];
  const links = [
    { from: "src/focus.ts", to: "src/side.ts" },
    { from: "src/focus.ts", to: "src/other.ts" },
  ];
  const full = buildFileGraph(recorded, links, "src/focus.ts");

  it("opens on the sessions, linked by the files they share besides the focus", () => {
    const graph = onionGraph(full, "src/focus.ts", closed, false);
    expect(graph.nodes.map((node) => [node.id, node.kind, node.label, node.members])).toEqual([
      ["session:s1", "session", "Session s1", ["s1:m1", "s1:m3"]],
      ["session:s2", "session", "Session s2", ["s2:m2", "s2:m4"]],
    ]);
    expect(graph.nodes.every((node) => node.direct)).toBe(true);
    // Both touched side.ts and other.ts, each touched by both of the two
    // sessions: ln(3/2) apiece.
    expect(graph.edges).toEqual([
      { from: "session:s1", to: "session:s2", kind: "share", weight: 0.81 },
    ]);
  });

  it("peels an opened session into its branches, and a branch into its messages", () => {
    const branches = onionGraph(
      full,
      "src/focus.ts",
      { peeled: { sessions: new Set(["s1"]), branches: new Set() } },
      false,
    );
    const hub = branches.nodes.find((node) => node.id === "session:s1");
    expect(hub).toMatchObject({ open: true, r: 5, tone: 0 });
    expect(
      branches.nodes.filter((node) => node.kind === "branch").map((node) => node.label),
    ).toEqual(["Alpha", "Beta"]);
    expect(branches.edges.filter((edge) => edge.kind === "part")).toEqual([
      { from: "session:s1", to: "branch:s1|Alpha", kind: "part" },
      { from: "session:s1", to: "branch:s1|Beta", kind: "part" },
    ]);

    const key = branchKey(inSession("m3", "s1", "Beta"));
    expect(key).toBe("s1|Beta");
    const messages = onionGraph(
      full,
      "src/focus.ts",
      { peeled: { sessions: new Set(["s1"]), branches: new Set([key]) } },
      false,
    );
    expect(messages.nodes.map((node) => node.id)).toEqual([
      "session:s1",
      "branch:s1|Beta",
      "branch:s1|Alpha",
      "s1:m3",
      "session:s2",
    ]);
    expect(messages.edges).toContainEqual({ from: "branch:s1|Beta", to: "s1:m3", kind: "part" });
    // A message without a branch sits in "Before any branch".
    const s2 = onionGraph(
      full,
      "src/focus.ts",
      { peeled: { sessions: new Set(["s2"]), branches: new Set() } },
      false,
    );
    expect(s2.nodes.find((node) => node.id === "branch:s2|")?.label).toBe("Before any branch");
  });

  it("draws the files and which part touched which when asked", () => {
    const graph = onionGraph(full, "src/focus.ts", closed, true);
    expect(graph.nodes.filter((node) => node.kind === "file")).toHaveLength(3);
    expect(graph.edges.filter((edge) => edge.kind === "share")).toEqual([]);
    expect(
      graph.edges.filter((edge) => edge.kind === "touch" && edge.from === "session:s1"),
    ).toEqual([
      { from: "session:s1", to: "src/focus.ts", kind: "touch" },
      { from: "session:s1", to: "src/side.ts", kind: "touch" },
      { from: "session:s1", to: "src/other.ts", kind: "touch" },
    ]);
  });

  it("keeps each part's strongest links only", () => {
    const many = ["a", "b", "c", "d", "e"].map((id) => hit(id, id));
    const crowd = buildFileGraph(
      [file("f.ts", [hit("z", "z")]), file("x.ts", many)],
      [{ from: "f.ts", to: "x.ts" }],
      "f.ts",
    );
    const graph = onionGraph(crowd, "f.ts", closed, false);
    // Ten session pairs share x.ts; each keeps three, so one pair (d–e) drops.
    expect(graph.edges).toHaveLength(9);
    expect(graph.edges.some((edge) => edge.from === "session:d" && edge.to === "session:e")).toBe(
      false,
    );
  });

  it("lays out the same every time, with nothing at the same spot", () => {
    const graph = onionGraph(
      full,
      "src/focus.ts",
      { peeled: { sessions: new Set(["s1", "s2"]), branches: new Set(["s1|Alpha"]) } },
      false,
    );
    const first = layoutFileGraph(graph);
    expect(first).toEqual(layoutFileGraph(graph));
    for (const node of first) expect(Number.isFinite(node.x) && Number.isFinite(node.y)).toBe(true);
    const spots = new Set(first.map((node) => `${Math.round(node.x)},${Math.round(node.y)}`));
    expect(spots.size).toBe(first.length);
  });
});

describe("going inside the onion, and the whole project", () => {
  const inSession = (messageId: string, sessionId: string, branch?: string): ViewFileHit => ({
    ...hit(messageId, sessionId),
    sessionTitle: `Session ${sessionId}`,
    ...(branch === undefined ? {} : { branch }),
  });
  const recorded = [
    file("src/a.ts", [inSession("m1", "s1", "Alpha"), inSession("m2", "s1", "Beta")]),
    file("src/b.ts", [inSession("m2", "s1", "Beta"), inSession("m3", "s2")]),
    file("src/rare.ts", [inSession("m1", "s1", "Alpha"), inSession("m4", "s3")]),
  ];
  const project = buildProjectGraph(recorded, [{ from: "src/a.ts", to: "src/b.ts" }]);

  it("draws every code file's messages with no file in focus", () => {
    expect(project.nodes.filter((node) => node.kind === "file").map((node) => node.id)).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/rare.ts",
    ]);
    expect(project.nodes.filter((node) => node.kind === "message")).toHaveLength(4);
    expect(project.edges.filter((edge) => edge.kind === "import")).toHaveLength(1);
    const graph = onionGraph(project, undefined, {}, false);
    expect(graph.nodes.map((node) => node.id)).toEqual(["session:s1", "session:s2", "session:s3"]);
    expect(graph.nodes.some((node) => node.direct)).toBe(false);
  });

  it("goes inside a session to its branches, each in its own colour", () => {
    const graph = onionGraph(project, undefined, { inside: { session: "s1" } }, false);
    expect(graph.nodes.map((node) => [node.id, node.label, node.tone])).toEqual([
      ["branch:s1|Alpha", "Alpha", 0],
      ["branch:s1|Beta", "Beta", 1],
    ]);
    expect(graph.edges.some((edge) => edge.kind === "part")).toBe(false);
  });

  it("goes inside a branch to its messages, in the branch's colour", () => {
    const graph = onionGraph(
      project,
      undefined,
      { inside: { session: "s1", branch: "s1|Beta" } },
      false,
    );
    expect(graph.nodes.map((node) => [node.id, node.tone])).toEqual([["s1:m2", 1]]);
  });

  it("names messages before any branch, and leaves folded sessions uncoloured", () => {
    const inside = onionGraph(project, undefined, { inside: { session: "s2" } }, false);
    expect(inside.nodes[0]?.label).toBe(NO_BRANCH);
    const folded = onionGraph(project, undefined, {}, false);
    expect(folded.nodes.every((node) => node.tone === undefined)).toBe(true);
  });

  it("links through a rare file more strongly than through a common one", () => {
    const common = file("src/common.ts", [
      inSession("x1", "x"),
      inSession("y1", "y"),
      inSession("z1", "z"),
    ]);
    const rare = file("src/rare.ts", [inSession("x2", "x"), inSession("y2", "y")]);
    const graph = onionGraph(buildProjectGraph([common, rare], []), undefined, {}, false);
    const weight = (a: string, b: string) =>
      graph.edges.find((edge) => edge.from === `session:${a}` && edge.to === `session:${b}`)
        ?.weight;
    // common.ts: ln(4/3) = 0.29; rare.ts adds ln(4/2) = 0.69.
    expect(weight("x", "y")).toBe(0.98);
    expect(weight("x", "z")).toBe(0.29);
  });

  it("draws only the most discussed files of the whole project", () => {
    const many = Array.from({ length: PROJECT_FILES + 5 }, (_, i) =>
      file(`src/f${String(i).padStart(2, "0")}.ts`, [inSession(`m${i}`, "s1")]),
    );
    const graph = onionGraph(buildProjectGraph(many, []), undefined, {}, true);
    expect(graph.nodes.filter((node) => node.kind === "file")).toHaveLength(PROJECT_FILES);
  });
});

describe("the commits layer", () => {
  const landed = (messageId: string, commits: string[]) => ({ ...hit(messageId), commits });
  const recorded = [
    file("src/a.ts", [landed("m1", ["aaaaaaa1234"]), landed("m2", [])]),
    file("src/b.ts", [landed("m1", ["aaaaaaa1234", "bbbbbbb"])]),
  ];
  const full = buildFileGraph(recorded, [{ from: "src/a.ts", to: "src/b.ts" }], "src/a.ts");

  it("knows which thoughts landed which commits, and which files they changed", () => {
    const m1 = full.nodes.find((node) => node.id === "s1:m1");
    expect(m1?.commits).toEqual(["aaaaaaa", "bbbbbbb"]);
    expect(full.nodes.find((node) => node.id === "s1:m2")?.commits).toBeUndefined();
    expect(full.nodes.find((node) => node.id === "src/b.ts")?.commits).toEqual([
      "aaaaaaa",
      "bbbbbbb",
    ]);
  });

  it("adds a square per commit, tied to its thought and the files it changed", () => {
    const graph = withCommits(full);
    expect(graph.nodes.filter((node) => node.kind === "commit").map((node) => node.id)).toEqual([
      "commit:aaaaaaa",
      "commit:bbbbbbb",
    ]);
    expect(graph.edges.filter((edge) => edge.kind === "landed")).toEqual([
      { from: "s1:m1", to: "commit:aaaaaaa", kind: "landed" },
      { from: "s1:m1", to: "commit:bbbbbbb", kind: "landed" },
    ]);
    expect(graph.edges.filter((edge) => edge.kind === "changed")).toEqual([
      { from: "commit:aaaaaaa", to: "src/a.ts", kind: "changed" },
      { from: "commit:aaaaaaa", to: "src/b.ts", kind: "changed" },
      { from: "commit:bbbbbbb", to: "src/b.ts", kind: "changed" },
    ]);
    // Without the files drawn there is nothing for a commit to point at but its thought.
    const thoughts = withCommits(onionGraph(full, "src/a.ts", {}, false));
    expect(thoughts.edges.some((edge) => edge.kind === "changed")).toBe(false);
    // Laid out beside their thought, the same every time.
    const nodes = layoutFileGraph(graph);
    expect(nodes).toEqual(layoutFileGraph(graph));
    for (const node of nodes) expect(Number.isFinite(node.x) && Number.isFinite(node.y)).toBe(true);
  });
});

describe("the layout under load", () => {
  it("stays on the page with one session tied to many commits, files and commits drawn", () => {
    // The whole-project picture with files and commits on: one session holds
    // forty messages, each landing its own commit on one of thirty files.
    const busy = Array.from({ length: 30 }, (_, f) =>
      file(
        `src/f${f}.ts`,
        Array.from({ length: 40 }, (_, m) => m)
          .filter((m) => m % 30 === f)
          .map((m) => ({ ...hit(`m${m}`, "busy"), commits: [`c${String(m).padStart(6, "0")}`] })),
      ),
    ).filter((entry) => entry.hits.length > 0);
    const quiet = file("src/quiet.ts", [hit("q", "quiet")]);
    const project = buildProjectGraph([...busy, quiet], []);
    for (const view of [
      {},
      { peeled: { sessions: new Set<string>(), branches: new Set<string>() } },
    ]) {
      const graph = withCommits(onionGraph(project, undefined, view, true));
      const nodes = layoutFileGraph(graph);
      expect(nodes.filter((node) => node.kind === "commit")).toHaveLength(40);
      for (const node of nodes) {
        expect(Number.isFinite(node.x) && Number.isFinite(node.y)).toBe(true);
        expect(Math.abs(node.x)).toBeLessThan(5000);
        expect(Math.abs(node.y)).toBeLessThan(5000);
      }
    }
  });

  it("keeps a part with no link near the others instead of flinging it away", () => {
    // With the files drawn, a session that touched none of the most discussed
    // files has no line at all (as in this project's map, where one flew off).
    const busy = Array.from({ length: PROJECT_FILES + 5 }, (_, f) =>
      file(`src/f${f}.ts`, [hit(`a${f}`, `s${f % 8}`), hit(`b${f}`, `s${(f + 3) % 8}`)]),
    );
    const project = buildProjectGraph([...busy, file("src/alone.ts", [hit("z", "z")])], []);
    const nodes = layoutFileGraph(onionGraph(project, undefined, {}, true));
    const nearest = nodes.map((node) =>
      Math.min(
        ...nodes
          .filter((other) => other !== node)
          .map((other) => Math.hypot(node.x - other.x, node.y - other.y)),
      ),
    );
    const median = [...nearest].sort((a, b) => a - b)[Math.floor(nearest.length / 2)] as number;
    const alone = nearest[nodes.findIndex((node) => node.id === "session:z")] as number;
    expect(alone).toBeLessThan(median * 4);
  });
});

describe("relatedBranches", () => {
  const at = (h: ViewFileHit, branch: string | undefined, time: string): ViewFileHit => ({
    ...h,
    ...(branch === undefined ? {} : { branch }),
    at: time,
  });
  const me = at(hit("m1", "s1"), "Build", "2026-01-01");
  const rareOther = at(hit("m7", "s2"), "Fix", "2026-01-03");
  const rareOtherOlder = at(hit("m6", "s2"), "Fix", "2026-01-02");
  const common = (id: string, session: string) => at(hit(id, session), "Common", "2026-01-01");
  const project: ViewFile[] = [
    file("src/rare.ts", [me, rareOther, rareOtherOlder]),
    file("src/everywhere.ts", [me, rareOther, common("m2", "s3"), common("m3", "s4")]),
    file("src/other.ts", [rareOther, common("m4", "s5")]),
    file("package.json", [me, common("m5", "s3")]),
    file("src/mine.ts", [me, at(hit("m8", "s1"), "Build", "2026-01-01")]),
  ];

  it("names other branches by the rare files they share, strongest first", () => {
    const related = relatedBranches(project, undefined, "s1", "m1");
    expect(related.map((entry) => [entry.sessionId, entry.branch])).toEqual([
      ["s2", "Fix"],
      ["s3", "Common"],
      ["s4", "Common"],
    ]);
    expect(related[0]?.files).toEqual(["src/rare.ts", "src/everywhere.ts"]);
    // Both s2 messages touched one shared file; the newer one is the way in.
    expect(related[0]?.hit.messageId).toBe("m7");
    // Noise files and the message's own branch relate nothing.
    expect(related.some((entry) => entry.files.includes("package.json"))).toBe(false);
    expect(related.some((entry) => entry.sessionId === "s1")).toBe(false);
  });

  it("goes in at the message that touched most of the shared files", () => {
    const deep = at(hit("m9", "s2"), "Fix", "2026-01-01");
    const withDeep: ViewFile[] = [
      file("src/a.ts", [me, deep, rareOther]),
      file("src/b.ts", [me, deep]),
    ];
    expect(relatedBranches(withDeep, undefined, "s1", "m1")[0]?.hit.messageId).toBe("m9");
  });

  it("follows the code graph's files and is empty for a message with none", () => {
    expect(relatedBranches(project, ["src/mine.ts"], "s1", "m1")).toEqual([]);
    expect(relatedBranches(project, undefined, "s9", "m1")).toEqual([]);
  });

  it("keeps the strongest few", () => {
    const many: ViewFile[] = [
      file("src/x.ts", [
        me,
        ...Array.from({ length: 6 }, (_, i) => at(hit(`n${i}`, `t${i}`), "B", "2026-01-01")),
      ]),
      file("src/pad.ts", [at(hit("p", "pad"), "Pad", "2026-01-01")]),
    ];
    expect(relatedBranches(many, undefined, "s1", "m1")).toHaveLength(RELATED_BRANCHES);
  });
});

describe("touchedBy", () => {
  it("groups the messages that touched a file by session", () => {
    const touched = touchedBy(
      [
        file("src/a.ts", [hit("m1", "s1"), hit("m2", "s1"), hit("m3", "s2")]),
        file("src/b.ts", [hit("m4", "s3")]),
      ],
      "src/a.ts",
    );
    expect([...touched.keys()]).toEqual(["s1", "s2"]);
    expect([...(touched.get("s1") ?? [])]).toEqual(["m1", "m2"]);
    expect(touched.has("s3")).toBe(false);
  });

  it("is empty for a file nobody touched", () => {
    expect(touchedBy(files, "src/none.ts").size).toBe(0);
  });
});
