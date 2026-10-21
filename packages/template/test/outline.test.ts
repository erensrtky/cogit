import { describe, expect, it } from "vitest";
import type { LineageViewModel, ViewNode, ViewSession } from "../../cli/src/view/model.js";
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
