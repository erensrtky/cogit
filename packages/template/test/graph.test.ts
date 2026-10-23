import { describe, expect, it } from "vitest";
import type { ViewNode } from "../../cli/src/view/model.js";
import {
  absolutePosition,
  messageNeighbors,
  placeSessionNodes,
  TREE_LEFT,
  toNodeDetail,
} from "../src/graph.js";

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

  it("makes room for the not-summarized badge, even on the last touched card", () => {
    const card: ViewNode = { id: "m1", kind: "message", title: "Hi", children: [] };
    const pending: ViewNode = { ...card, unsummarized: true, at: "2026-10-23T10:00:00.000Z" };
    const plainHeight = placeSessionNodes([card], "s").boxes.get("node:s:m1")?.height ?? 0;
    const pendingHeight = placeSessionNodes([pending], "s").boxes.get("node:s:m1")?.height ?? 0;
    expect(pendingHeight).toBeGreaterThan(plainHeight);
    const both = placeSessionNodes([pending], "s", undefined, new Set(["node:s:m1"]));
    expect(both.boxes.get("node:s:m1")?.height).toBeGreaterThan(pendingHeight);
  });
});

describe("absolutePosition", () => {
  const nodes = [
    { id: "epoch", position: { x: 10, y: 20 } },
    { id: "session", position: { x: 5, y: 40 }, parentId: "epoch" },
    { id: "card", position: { x: 1, y: 2 }, parentId: "session" },
    { id: "loop", position: { x: 1, y: 1 }, parentId: "loop" },
  ];

  it("adds up the positions of every parent", () => {
    expect(absolutePosition(nodes, "card")).toEqual({ x: 16, y: 62 });
    expect(absolutePosition(nodes, "epoch")).toEqual({ x: 10, y: 20 });
  });

  it("is null for a node the layout does not hold, and survives a parent loop", () => {
    expect(absolutePosition(nodes, "gone")).toBeNull();
    expect(absolutePosition(nodes, "loop")).toEqual({ x: 1, y: 1 });
  });
});

describe("messageNeighbors", () => {
  const message = (id: string, at?: string): ViewNode => ({
    id,
    kind: "message",
    title: id,
    children: [],
    ...(at ? { at } : {}),
  });
  const tree: ViewNode[] = [
    {
      ...node("a"),
      children: [message("m3", "2026-01-01T03:00:00Z"), message("m1", "2026-01-01T01:00:00Z")],
    },
    { ...node("b"), children: [message("m2", "2026-01-01T02:00:00Z"), message("mx")] },
  ];

  it("finds the messages before and after, by send time across topics", () => {
    const { previous, next } = messageNeighbors(tree, "m2");
    expect([previous?.id, next?.id]).toEqual(["m1", "m3"]);
    expect(messageNeighbors(tree, "m3").next).toBeNull();
  });

  it("returns nothing for a node that is not a message", () => {
    expect(messageNeighbors(tree, "a")).toEqual({ previous: null, next: null });
  });
});

describe("toNodeDetail", () => {
  it("keeps the node's own id next to its session", () => {
    expect(toNodeDetail(node("x"), "s1")).toMatchObject({ nodeId: "x", sessionId: "s1" });
  });
});
