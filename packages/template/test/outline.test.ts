import { describe, expect, it } from "vitest";
import type { LineageViewModel, ViewNode, ViewSession } from "../../cli/src/view/model.js";
import { defaultExpanded, headOf, sessionGroupId } from "../src/graph.js";
import { outlinePath } from "../src/Outline.js";

const AT = "2026-10-21T10:00:00.000Z";

function message(id: string, at = AT, parent: string | null = null): ViewNode {
  return { id, kind: "message", title: id, at, parent };
}

function session(id: string, epoch: string | null, messages: ViewNode[]): ViewSession {
  return {
    sessionId: id,
    agent: "claude-code",
    title: id,
    epoch,
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
  epochs: [
    {
      id: "e1",
      title: "Epoch one",
      createdAt: AT,
      sessions: [
        session("s1", "e1", [message("m1"), message("m2", "2026-10-21T10:01:00.000Z", "m1")]),
      ],
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

  it("returns the epoch and session for a message row", () => {
    expect(outlinePath(model, "node:session:s1:m2")).toEqual(["epoch:e1", "session:s1"]);
  });

  it("places unassigned sessions under the unassigned group", () => {
    expect(outlinePath(model, "session:u1")).toEqual(["unassigned"]);
  });

  it("returns null for an id outside the model", () => {
    expect(outlinePath(model, "session:missing")).toBeNull();
    expect(outlinePath(model, "node:session:s1:gone")).toBeNull();
  });
});

describe("headOf", () => {
  const latest: LineageViewModel = {
    ...model,
    epochs: [
      {
        id: "e1",
        title: "Epoch one",
        createdAt: AT,
        sessions: [
          {
            ...session("s1", "e1", [
              message("m1"),
              message("m2", "2026-10-21T10:01:00.000Z", "m1"),
            ]),
            updatedAt: "2026-10-22T00:00:00.000Z",
          },
        ],
      },
    ],
  };

  it("marks the newest message of the most recently updated session", () => {
    expect(headOf(latest)).toEqual({
      sessionKey: "session:s1",
      sessionId: "s1",
      messageId: "m2",
      group: "epoch:e1",
    });
    expect(defaultExpanded(latest)).toEqual(new Set(["epoch:e1", "session:s1"]));
  });

  it("has no message for a session without any, and is null for an empty map", () => {
    expect(
      headOf({
        ...latest,
        epochs: [{ ...latest.epochs[0]!, sessions: [session("s2", "e1", [])] }],
      }),
    ).toMatchObject({ sessionKey: "session:s2", messageId: null });
    expect(headOf({ ...latest, epochs: [], unassigned: [] })).toBeNull();
  });

  it("finds the epoch group of a session", () => {
    expect(sessionGroupId(latest, "s1")).toBe("epoch:e1");
    expect(sessionGroupId(model, "u1")).toBe("unassigned");
    expect(sessionGroupId(latest, "gone")).toBeNull();
  });
});
