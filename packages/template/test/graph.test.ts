import { describe, expect, it } from "vitest";
import type { LineageViewModel, ViewNode } from "../../cli/src/view/model.js";
import {
  absolutePosition,
  layoutGraph,
  messageNeighbors,
  sessionId,
  toNodeDetail,
} from "../src/graph.js";

const AT = "2026-10-21T10:00:00.000Z";

function message(id: string, at = AT, parent: string | null = null): ViewNode {
  return { id, kind: "message", title: id, at, parent };
}

const model: LineageViewModel = {
  kind: "lineage",
  schema: 1,
  project: { name: "p", path: "/tmp/p", generatedAt: AT },
  status: { goal: "", done: [], pending: [], next: "", lastActivity: null },
  epochs: [
    {
      id: "e1",
      title: "Epoch one",
      createdAt: AT,
      sessions: [
        {
          sessionId: "s1",
          agent: "claude-code",
          title: "One",
          epoch: "e1",
          startedAt: AT,
          updatedAt: AT,
          status: { goal: "", done: [], pending: [], next: "" },
          messages: [message("m1"), message("m2", "2026-10-21T10:01:00.000Z", "m1")],
          transcriptAvailable: true,
        },
        {
          sessionId: "s2",
          agent: "claude-code",
          title: "Two",
          epoch: "e1",
          startedAt: "2026-10-20T10:00:00.000Z",
          updatedAt: "2026-10-20T11:00:00.000Z",
          status: { goal: "", done: [], pending: [], next: "" },
          messages: [],
          transcriptAvailable: true,
        },
      ],
    },
  ],
  unassigned: [],
};

describe("layoutGraph", () => {
  it("gives an open session its git layout and leaves a closed one empty", async () => {
    const expanded = new Set(["epoch:e1", "session:s1"]);
    const layout = await layoutGraph(model, expanded);
    const session = layout.nodes.find((node) => node.id === "session:s1");
    const closed = layout.nodes.find((node) => node.id === "session:s2");
    expect(session?.type).toBe("session");
    if (session?.type === "session") {
      expect(session.data.git?.rows).toHaveLength(2);
      expect(session.width).toBeGreaterThanOrEqual(session.data.git?.width ?? 0);
      expect(session.height).toBeGreaterThan(56);
    }
    if (closed?.type === "session") {
      expect(closed.data.git).toBeUndefined();
      expect(closed.height).toBe(56);
    }
  });

  it("puts every session of an open epoch under it and emits no message nodes", async () => {
    const layout = await layoutGraph(model, new Set(["epoch:e1"]));
    expect(layout.nodes.map((node) => node.type)).toEqual(["epoch", "session", "session"]);
    expect(
      layout.nodes
        .filter((node) => node.type === "session")
        .every((n) => n.parentId === "epoch:e1"),
    ).toBe(true);
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
  const messages = [
    message("m1", "2026-01-01T01:00:00Z"),
    message("m2", "2026-01-01T02:00:00Z"),
    message("m3", "2026-01-01T03:00:00Z"),
  ];

  it("finds the messages before and after in send order", () => {
    const { previous, next } = messageNeighbors(messages, "m2");
    expect([previous?.id, next?.id]).toEqual(["m1", "m3"]);
    expect(messageNeighbors(messages, "m3").next).toBeNull();
    expect(messageNeighbors(messages, "m1").previous).toBeNull();
  });

  it("returns nothing for an id the session does not have", () => {
    expect(messageNeighbors(messages, "gone")).toEqual({ previous: null, next: null });
  });
});

describe("toNodeDetail", () => {
  it("keeps the node's own id next to its session", () => {
    expect(toNodeDetail(message("m1"), "s1")).toMatchObject({ nodeId: "m1", sessionId: "s1" });
  });
});

describe("sessionId", () => {
  it("prefixes the React Flow session group id", () => {
    expect(sessionId("abc")).toBe("session:abc");
  });
});
