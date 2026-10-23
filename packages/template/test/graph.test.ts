import { describe, expect, it } from "vitest";
import type { ViewNode } from "../../cli/src/view/model.js";
import { placeSessionNodes, TREE_LEFT, TREE_TOP } from "../src/graph.js";

function node(id: string, children: ViewNode[] = []): ViewNode {
  return { id, kind: "phase", title: id, children };
}

describe("placeSessionNodes", () => {
  const tree = [node("a", [node("a1"), node("a2", [node("a2x")])]), node("b", [node("b1")])];
  const { boxes, edges, width, height } = placeSessionNodes(tree, "s");
  const box = (id: string) => boxes.get(`node:s:${id}`);

  it("puts every node on its own row in recorded order", () => {
    const order = ["a", "a1", "a2", "a2x", "b", "b1"].map((id) => box(id)?.y ?? -1);
    expect(order).toEqual([...order].sort((x, y) => x - y));
    expect(new Set(order).size).toBe(order.length);
  });

  it("indents children under their parent and keeps phases in one column", () => {
    expect(box("a")?.x).toBe(box("b")?.x);
    expect(box("a1")?.x).toBeGreaterThan(box("a")?.x ?? 0);
    expect(box("a2x")?.x).toBeGreaterThan(box("a2")?.x ?? 0);
    expect(width).toBeGreaterThanOrEqual((box("a2x")?.x ?? 0) + (box("a2x")?.width ?? 0));
    expect(height).toBeGreaterThan((box("b1")?.y ?? 0) + (box("b1")?.height ?? 0));
  });

  it("chains phases along the spine and hangs items off their parent", () => {
    const link = (from: string, to: string) =>
      edges.find((e) => e.source === `node:s:${from}` && e.target === `node:s:${to}`);
    expect(link("a", "b")?.targetHandle).toBe(TREE_TOP);
    expect(link("a", "a1")?.targetHandle).toBe(TREE_LEFT);
    expect(link("a2", "a2x")?.targetHandle).toBe(TREE_LEFT);
    expect(link("a1", "a2")).toBeUndefined();
    expect(edges).toHaveLength(5);
  });
});
