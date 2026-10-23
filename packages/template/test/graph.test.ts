import { describe, expect, it } from "vitest";
import type { ViewNode } from "../../cli/src/view/model.js";
import { placeSessionNodes, TREE_LEFT } from "../src/graph.js";

function node(id: string, children: ViewNode[] = []): ViewNode {
  return { id, kind: "phase", title: id, children };
}

describe("placeSessionNodes", () => {
  const tree = [node("a", [node("a1"), node("a2", [node("a2x")])]), node("b", [node("b1")])];
  const { boxes, edges, width, height } = placeSessionNodes(tree, "s");
  const box = (id: string) => boxes.get(`node:s:${id}`);

  it("puts top-level topics side by side in one row", () => {
    expect(box("a")?.y).toBe(box("b")?.y);
    expect(box("b")?.x).toBeGreaterThan((box("a2x")?.x ?? 0) + (box("a2x")?.width ?? 0));
  });

  it("lists a topic's items below it in recorded order, indented by depth", () => {
    const column = ["a", "a1", "a2", "a2x"].map((id) => box(id)?.y ?? -1);
    expect(column).toEqual([...column].sort((x, y) => x - y));
    expect(new Set(column).size).toBe(column.length);
    expect(box("a1")?.x).toBeGreaterThan(box("a")?.x ?? 0);
    expect(box("a2x")?.x).toBeGreaterThan(box("a2")?.x ?? 0);
    expect(width).toBeGreaterThan((box("b1")?.x ?? 0) + (box("b1")?.width ?? 0));
    expect(height).toBeGreaterThan((box("a2x")?.y ?? 0) + (box("a2x")?.height ?? 0));
  });

  it("hangs items off their parent and never links parallel topics", () => {
    const link = (from: string, to: string) =>
      edges.find((e) => e.source === `node:s:${from}` && e.target === `node:s:${to}`);
    expect(link("a", "a1")?.targetHandle).toBe(TREE_LEFT);
    expect(link("a2", "a2x")?.targetHandle).toBe(TREE_LEFT);
    expect(link("a", "b")).toBeUndefined();
    expect(edges).toHaveLength(4);
  });

  it("hides the children of a closed topic and narrows its column", () => {
    const closed = placeSessionNodes(tree, "s", (id) => id !== "node:s:a");
    expect(closed.boxes.has("node:s:a1")).toBe(false);
    expect(closed.boxes.has("node:s:b1")).toBe(true);
    expect(closed.boxes.get("node:s:b")?.x).toBeLessThan(box("b")?.x ?? 0);
    expect(closed.edges.map((e) => e.target)).toEqual(["node:s:b1"]);
  });

  it("gives an empty session a minimal box", () => {
    expect(placeSessionNodes([], "s").boxes.size).toBe(0);
  });

  it("makes room for the left-off badge on the last touched card", () => {
    const marked = placeSessionNodes(tree, "s", undefined, new Set(["node:s:a1"]));
    expect(marked.boxes.get("node:s:a1")?.height).toBeGreaterThan(box("a1")?.height ?? 0);
  });
});
