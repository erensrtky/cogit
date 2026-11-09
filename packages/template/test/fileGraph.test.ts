import { describe, expect, it } from "vitest";
import type { ViewFile, ViewFileHit, ViewFileLink } from "../../cli/src/view/model.js";
import {
  buildFileGraph,
  defaultFocus,
  graphBounds,
  isTestPath,
  LINKED_MESSAGES,
  layoutFileGraph,
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
    expect(box).toEqual({ minX: -50, minY: -68, width: 100, height: 118 });
  });
});
