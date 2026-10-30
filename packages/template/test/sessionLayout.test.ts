import { describe, expect, it } from "vitest";
import type { LineageViewModel, ViewNode, ViewSession } from "../../cli/src/view/model.js";
import { allSessions, layoutSessionGraph, sessionParentOf } from "../src/sessionLayout.js";

/** Minutes after 2026-10-24T10:00Z, so spans are easy to read. */
function at(minutes: number): string {
  return new Date(Date.UTC(2026, 9, 24, 10, minutes)).toISOString();
}

function message(id: string, minutes: number, continues?: ViewNode["continues"]): ViewNode {
  return {
    id,
    kind: "message",
    title: id,
    at: at(minutes),
    ...(continues ? { parent: null, continues } : {}),
  };
}

function session(
  sessionId: string,
  startedAt: number,
  updatedAt: number,
  continues?: { sessionId: string; id: string; sessionTitle: string },
): ViewSession {
  return {
    sessionId,
    agent: "claude-code",
    title: `Session ${sessionId}`,
    epoch: "e1",
    startedAt: at(startedAt),
    updatedAt: at(updatedAt),
    status: { goal: "", done: [], pending: [], next: "" },
    messages: [
      message(
        "h1",
        updatedAt,
        continues
          ? {
              sessionId: continues.sessionId,
              sessionTitle: continues.sessionTitle,
              id: continues.id,
            }
          : undefined,
      ),
    ],
    transcriptAvailable: true,
  };
}

function modelOf(sessions: ViewSession[]): LineageViewModel {
  return {
    kind: "lineage",
    schema: 1,
    project: { name: "p", path: "/tmp/p", generatedAt: at(0) },
    status: { goal: "", done: [], pending: [], next: "", lastActivity: null },
    epochs: [{ id: "e1", title: "Epoch one", createdAt: at(0), sessions }],
    unassigned: [],
  };
}

describe("sessionParentOf", () => {
  it("hangs a session from the session its first message continues", () => {
    const earlier = session("a", 0, 60);
    const later = session("b", 120, 180, { sessionId: "a", id: "h1", sessionTitle: "Session a" });
    expect(sessionParentOf(later, new Set(["a", "b"]))).toBe("a");
    expect(sessionParentOf(earlier, new Set(["a", "b"]))).toBeNull();
  });

  it("is a root when the earlier session is not in the map", () => {
    const later = session("b", 120, 180, { sessionId: "gone", id: "h1", sessionTitle: "Gone" });
    expect(sessionParentOf(later, new Set(["b"]))).toBeNull();
  });
});

describe("layoutSessionGraph", () => {
  it("lists every session in start order across epochs and unassigned", () => {
    const model = modelOf([session("late", 60, 120), session("early", 0, 30)]);
    model.unassigned = [session("scratch", 30, 40)];
    expect(allSessions(model).map((session) => session.sessionId)).toEqual([
      "early",
      "scratch",
      "late",
    ]);
  });

  it("ends the session rows at the dragged map width", () => {
    const model = modelOf([session("a", 0, 60)]);
    expect(layoutSessionGraph(model).git.rowWidth).toBe(720);
    expect(layoutSessionGraph(model, undefined, 1020).git.rowWidth).toBe(1020);
  });

  it("runs a child session in the parent's lane", () => {
    const earlier = session("a", 0, 60);
    const later = session("b", 90, 120, { sessionId: "a", id: "h1", sessionTitle: "Session a" });
    const graph = layoutSessionGraph(modelOf([earlier, later]));
    expect(graph.parents.get("b")).toBe("a");
    expect(graph.git.segments.map((segment) => segment.ids)).toEqual([["a", "b"]]);
    expect(graph.git.laneX).toHaveLength(1);
  });

  it("gives sessions that run at the same time parallel lanes", () => {
    // b starts while a is still running and does not continue it.
    const graph = layoutSessionGraph(modelOf([session("a", 0, 90), session("b", 30, 60)]));
    expect(graph.git.segments.map((segment) => segment.lane)).toEqual([0, 1]);
    expect(graph.git.laneX).toHaveLength(2);
  });

  it("reuses a lane once the earlier session has stopped", () => {
    const graph = layoutSessionGraph(modelOf([session("a", 0, 30), session("b", 60, 90)]));
    expect(graph.git.segments.map((segment) => segment.lane)).toEqual([0, 0]);
  });

  it("never folds a chain of sessions: every session keeps its row", () => {
    const chain = [session("s1", 0, 10)];
    for (let n = 2; n <= 7; n += 1) {
      chain.push(
        session(`s${n}`, (n - 1) * 20, (n - 1) * 20 + 10, {
          sessionId: `s${n - 1}`,
          id: "h1",
          sessionTitle: `Session s${n - 1}`,
        }),
      );
    }
    const graph = layoutSessionGraph(modelOf(chain));
    expect(graph.git.rows).toHaveLength(7);
    expect(graph.git.rows.every((row) => row.kind === "message")).toBe(true);
  });

  it("ends a lane at its newest message, not at an edited record's updatedAt", () => {
    // a's record was touched at minute 200, but its only message was sent at 10.
    const edited: ViewSession = {
      ...session("a", 0, 200),
      messages: [message("h1", 10)],
    };
    const graph = layoutSessionGraph(modelOf([edited, session("b", 30, 60)]));
    // b started while a was still running only if the lane ran to 200; with the
    // message time the lane ends at 10 and b reuses it.
    expect(graph.git.segments.map((segment) => segment.lane)).toEqual([0, 0]);
  });

  it("marks the most recently updated session as HEAD", () => {
    const graph = layoutSessionGraph(modelOf([session("a", 0, 200), session("b", 60, 90)]));
    expect(graph.git.headId).toBe("a");
    const head = graph.git.rows.find((row) => row.kind === "message" && row.message.id === "a");
    expect(head?.head).toBe(true);
  });
});
