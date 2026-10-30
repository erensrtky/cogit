import { describe, expect, it } from "vitest";
import type { LineageViewModel, ViewNode, ViewSession } from "../../cli/src/view/model.js";
import { outlinePath } from "../src/Outline.js";

const AT = "2026-10-21T10:00:00.000Z";

function message(id: string, at = AT, parent: string | null = null): ViewNode {
  return { id, kind: "message", title: id, at, parent };
}

function session(id: string, messages: ViewNode[]): ViewSession {
  return {
    sessionId: id,
    agent: "claude-code",
    title: id,
    startedAt: AT,
    updatedAt: AT,
    status: { goal: "", done: [], pending: [], next: "" },
    messages,
    transcriptAvailable: true,
  };
}

const model: LineageViewModel = {
  kind: "lineage",
  schema: 1,
  project: { name: "p", path: "/tmp/p", generatedAt: AT },
  status: { goal: "", done: [], pending: [], next: "", lastActivity: null },
  sessions: [
    session("s1", [message("m1"), message("m2", "2026-10-21T10:01:00.000Z", "m1")]),
    session("u1", []),
  ],
};

describe("outlinePath", () => {
  it("returns a session row alone", () => {
    expect(outlinePath(model, "session:s1")).toEqual(["session:s1"]);
    expect(outlinePath(model, "session:u1")).toEqual(["session:u1"]);
  });

  it("returns the session and then the message for a message row", () => {
    expect(outlinePath(model, "node:session:s1:m2")).toEqual(["session:s1", "node:session:s1:m2"]);
  });

  it("returns null for an id outside the model", () => {
    expect(outlinePath(model, "session:missing")).toBeNull();
    expect(outlinePath(model, "node:session:s1:gone")).toBeNull();
  });
});
