import { describe, expect, it } from "vitest";
import type { LineageViewModel, ViewNode, ViewSession } from "../../cli/src/view/model.js";
import { defaultExpanded, lastTouched } from "../src/graph.js";
import { outlinePath } from "../src/Outline.js";

const AT = "2026-10-21T10:00:00.000Z";

function node(id: string, title: string, children: ViewNode[] = []): ViewNode {
  return { id, kind: "step", title, children };
}

function session(id: string, epoch: string | null, nodes: ViewNode[]): ViewSession {
  return {
    sessionId: id,
    agent: "claude-code",
    title: id,
    epoch,
    startedAt: AT,
    updatedAt: AT,
    status: { goal: "", done: [], pending: [], next: "" },
    nodes,
    transcriptAvailable: true,
  };
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
      sessions: [session("s1", "e1", [node("n1", "A", [node("n2", "B")]), node("n3", "C")])],
    },
  ],
  unassigned: [session("u1", null, [])],
};

describe("outlinePath", () => {
  it("returns the epoch for an epoch row", () => {
    expect(outlinePath(model, "epoch:e1")).toEqual(["epoch:e1"]);
  });

  it("returns the owning epoch for a session row", () => {
    expect(outlinePath(model, "session:s1")).toEqual(["epoch:e1"]);
  });

  it("returns every ancestor of a nested node, including the node itself", () => {
    expect(outlinePath(model, "node:session:s1:n2")).toEqual([
      "epoch:e1",
      "session:s1",
      "node:session:s1:n1",
      "node:session:s1:n2",
    ]);
  });

  it("places unassigned sessions under the unassigned group", () => {
    expect(outlinePath(model, "session:u1")).toEqual(["unassigned"]);
  });

  it("returns null for an id outside the model", () => {
    expect(outlinePath(model, "session:missing")).toBeNull();
  });
});

describe("lastTouched", () => {
  const touched = (n: ViewNode, at: string): ViewNode => ({ ...n, touchedAt: at });
  const withTouches: LineageViewModel = {
    ...model,
    epochs: [
      {
        id: "e1",
        title: "Epoch one",
        createdAt: AT,
        sessions: [
          {
            ...session("s1", "e1", [
              touched(node("n1", "A", [touched(node("n2", "B"), "2026-10-21T12:00:00.000Z")]), AT),
              touched(node("n3", "C"), "2026-10-21T11:00:00.000Z"),
            ]),
            updatedAt: "2026-10-22T00:00:00.000Z",
          },
        ],
      },
    ],
  };

  it("finds the newest touched node in the latest session, with the branch above it", () => {
    expect(lastTouched(withTouches)).toEqual({
      sessionKey: "session:s1",
      nodeKeys: ["node:session:s1:n2"],
      ancestors: ["epoch:e1", "session:s1", "node:session:s1:n1"],
    });
    expect(defaultExpanded(withTouches).has("node:session:s1:n1")).toBe(true);
  });

  it("marks every node of the last write when several share the newest time", () => {
    const tie = structuredClone(withTouches);
    const s1 = tie.epochs[0]?.sessions[0];
    if (s1?.nodes[1]) s1.nodes[1].touchedAt = "2026-10-21T12:00:00.000Z";
    expect(lastTouched(tie)?.nodeKeys).toEqual(["node:session:s1:n2", "node:session:s1:n3"]);
  });

  it("is empty when nothing has a touch time yet", () => {
    expect(lastTouched(model)).toBeNull();
    expect(lastTouched({ ...model, epochs: [], unassigned: [] })).toBeNull();
  });
});
