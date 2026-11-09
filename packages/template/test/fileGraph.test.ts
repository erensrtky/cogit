import { describe, expect, it } from "vitest";
import type { ViewFile, ViewFileHit, ViewFileLink } from "../../cli/src/view/model.js";
import {
  branchKey,
  buildFileGraph,
  defaultFocus,
  graphBounds,
  graphFiles,
  isNoiseFile,
  isTestPath,
  LINKED_MESSAGES,
  layoutFileGraph,
  onionGraph,
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

  it("opens on the most discussed linked source file", () => {
    // thought.ts and git.ts both have two messages: a tie goes by path.
    expect(defaultFocus(files, links)).toBe("src/git.ts");
    // A test file never opens the view, however discussed.
    const busyTest = file("test/thought.test.ts", [hit("a"), hit("b"), hit("c")]);
    expect(defaultFocus([...files.slice(0, 4), busyTest], links)).toBe("src/git.ts");
    // Without a graph: the most discussed file.
    expect(
      defaultFocus([file("x.ts", [hit("a")]), file("y.ts", [hit("b"), hit("c")])], undefined),
    ).toBe("y.ts");
    expect(defaultFocus([], undefined)).toBeUndefined();
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
  const closed = { sessions: new Set<string>(), branches: new Set<string>() };
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
    // Both touched side.ts and other.ts: one link, weight two.
    expect(graph.edges).toEqual([
      { from: "session:s1", to: "session:s2", kind: "share", weight: 2 },
    ]);
  });

  it("peels an opened session into its branches, and a branch into its messages", () => {
    const branches = onionGraph(
      full,
      "src/focus.ts",
      { sessions: new Set(["s1"]), branches: new Set() },
      false,
    );
    const hub = branches.nodes.find((node) => node.id === "session:s1");
    expect(hub).toMatchObject({ open: true, r: 5 });
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
      { sessions: new Set(["s1"]), branches: new Set([key]) },
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
      { sessions: new Set(["s2"]), branches: new Set() },
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
      { sessions: new Set(["s1", "s2"]), branches: new Set(["s1|Alpha"]) },
      false,
    );
    const first = layoutFileGraph(graph);
    expect(first).toEqual(layoutFileGraph(graph));
    for (const node of first) expect(Number.isFinite(node.x) && Number.isFinite(node.y)).toBe(true);
    const spots = new Set(first.map((node) => `${Math.round(node.x)},${Math.round(node.y)}`));
    expect(spots.size).toBe(first.length);
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
    const thoughts = withCommits(
      onionGraph(full, "src/a.ts", { sessions: new Set(), branches: new Set() }, false),
    );
    expect(thoughts.edges.some((edge) => edge.kind === "changed")).toBe(false);
    // Laid out beside their thought, the same every time.
    const nodes = layoutFileGraph(graph);
    expect(nodes).toEqual(layoutFileGraph(graph));
    for (const node of nodes) expect(Number.isFinite(node.x) && Number.isFinite(node.y)).toBe(true);
  });
});
