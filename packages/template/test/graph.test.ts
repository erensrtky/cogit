import { describe, expect, it } from "vitest";
import type { LineageViewModel, ViewNode } from "../../cli/src/view/model.js";
import {
  CENTRE_MARGIN,
  centreViewport,
  headOf,
  messageNeighbors,
  nodeId,
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
      ],
    },
  ],
  unassigned: [],
};

describe("headOf", () => {
  it("marks the newest message", () => {
    expect(headOf(model)).toEqual({ sessionId: "s1", messageId: "m2" });
  });

  it("has no message for a session without any, and is null for an empty map", () => {
    const empty: LineageViewModel = {
      ...model,
      epochs: [
        {
          ...model.epochs[0]!,
          sessions: [{ ...model.epochs[0]!.sessions[0]!, messages: [] }],
        },
      ],
    };
    expect(headOf(empty)).toEqual({ sessionId: "s1", messageId: null });
    expect(headOf({ ...model, epochs: [], unassigned: [] })).toBeNull();
  });

  it("follows the newest message, not the most recently updated record", () => {
    const fixedLater: LineageViewModel = {
      ...model,
      unassigned: [
        {
          ...model.epochs[0]!.sessions[0]!,
          sessionId: "u1",
          // Its record was touched last (say, an old pending item was fixed),
          // but its message is older than s1's newest one.
          updatedAt: "2026-10-23T00:00:00.000Z",
          messages: [message("m9")],
        },
      ],
    };
    expect(headOf(fixedLater)).toEqual({ sessionId: "s1", messageId: "m2" });

    const newerMessage: LineageViewModel = {
      ...fixedLater,
      unassigned: [
        { ...fixedLater.unassigned[0]!, messages: [message("m9", "2026-10-22T00:00:00.000Z")] },
      ],
    };
    expect(headOf(newerMessage)).toEqual({ sessionId: "u1", messageId: "m9" });
  });

  it("falls back to the most recently updated session when messages carry no time", () => {
    const untimed: LineageViewModel = {
      ...model,
      epochs: [
        {
          ...model.epochs[0]!,
          sessions: [
            {
              ...model.epochs[0]!.sessions[0]!,
              messages: [{ id: "m1", kind: "message", title: "m1", parent: null }],
            },
          ],
        },
      ],
    };
    expect(headOf(untimed)).toEqual({ sessionId: "s1", messageId: "m1" });
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

describe("ids", () => {
  it("prefixes the outline and map keys", () => {
    expect(sessionId("abc")).toBe("session:abc");
    expect(nodeId("session:abc", "m1")).toBe("node:session:abc:m1");
  });
});

describe("centreViewport", () => {
  const canvas = { width: 800, height: 400 };

  it("centres the whole row, not only its dot", () => {
    // Row from 100 to 700 at zoom 1: its middle (400) lands on the canvas middle.
    expect(centreViewport({ x: 130, y: 50, left: 100, right: 700 }, canvas, 1)).toEqual({
      zoom: 1,
      x: 0,
      y: 150,
    });
  });

  it("starts a row wider than the canvas at the left margin", () => {
    expect(centreViewport({ x: 130, y: 50, left: 100, right: 1100 }, canvas, 1)).toEqual({
      zoom: 1,
      x: CENTRE_MARGIN - 100,
      y: 150,
    });
  });

  it("centres a bare point when the row span is unknown", () => {
    expect(centreViewport({ x: 100, y: 100 }, canvas, 0.5)).toEqual({ zoom: 0.5, x: 350, y: 150 });
  });
});
