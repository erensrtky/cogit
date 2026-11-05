import { describe, expect, it } from "vitest";
import type { LineageViewModel, ViewNode } from "../../cli/src/view/model.js";
import {
  BAND_STEP,
  CENTRE_MARGIN,
  centreViewport,
  headOf,
  inBand,
  messageNeighbors,
  nodeId,
  sessionId,
  toNodeDetail,
  visibleBand,
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
  sessions: [
    {
      sessionId: "s1",
      agent: "claude-code",
      title: "One",
      startedAt: AT,
      updatedAt: AT,
      status: { goal: "", done: [], pending: [], next: "" },
      messages: [message("m1"), message("m2", "2026-10-21T10:01:00.000Z", "m1")],
      transcriptAvailable: true,
    },
  ],
};

describe("headOf", () => {
  it("marks the newest message", () => {
    expect(headOf(model)).toEqual({ sessionId: "s1", messageId: "m2" });
  });

  it("has no message for a session without any, and is null for an empty map", () => {
    const empty: LineageViewModel = {
      ...model,
      sessions: [{ ...model.sessions[0]!, messages: [] }],
    };
    expect(headOf(empty)).toEqual({ sessionId: "s1", messageId: null });
    expect(headOf({ ...model, sessions: [] })).toBeNull();
  });

  it("follows the newest message, not the most recently updated record", () => {
    const fixedLater: LineageViewModel = {
      ...model,
      sessions: [
        ...model.sessions,
        {
          ...model.sessions[0]!,
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
      sessions: [
        ...model.sessions,
        { ...fixedLater.sessions[1]!, messages: [message("m9", "2026-10-22T00:00:00.000Z")] },
      ],
    };
    expect(headOf(newerMessage)).toEqual({ sessionId: "u1", messageId: "m9" });
  });

  it("falls back to the most recently updated session when messages carry no time", () => {
    const untimed: LineageViewModel = {
      ...model,
      sessions: [
        {
          ...model.sessions[0]!,
          messages: [{ id: "m1", kind: "message", title: "m1", parent: null }],
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

describe("the band of open sessions worth drawing", () => {
  it("covers the viewport plus a screen either side, in whole steps", () => {
    // Viewport at canvas y 4000..4800 (zoom 1, 800 tall).
    const band = visibleBand([0, -4000, 1], 800);
    expect(band).toEqual([3200, 5600]);
    expect((band?.[0] ?? 1) % BAND_STEP).toBe(0);
    // Zoomed out to a half, the same screen shows twice the canvas.
    expect(visibleBand([0, -4000, 0.5], 800)).toEqual([6400, 11200]);
  });

  it("draws everything until the canvas has a height", () => {
    expect(visibleBand([0, 0, 1], 0)).toBeNull();
    expect(inBand(99_999, 10, null)).toBe(true);
  });

  it("keeps a block that reaches into the band and drops one wholly outside", () => {
    expect(inBand(3000, 300, [3200, 5600])).toBe(true);
    expect(inBand(5600, 100, [3200, 5600])).toBe(true);
    expect(inBand(2000, 300, [3200, 5600])).toBe(false);
    expect(inBand(5601, 100, [3200, 5600])).toBe(false);
  });
});
