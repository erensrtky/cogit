import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LineageViewModel, ViewSession } from "../../cli/src/view/model.js";
import { SessionMap } from "../src/SessionMap.js";
import { DrillDown } from "../src/SidePanel.js";
import { layoutSessionGraph } from "../src/sessionLayout.js";

const T0 = "2026-10-26T10:00:00.000Z";

const session: ViewSession = {
  sessionId: "s1",
  agent: "claude-code",
  title: "Session one",
  author: "Eren",
  startedAt: T0,
  updatedAt: T0,
  status: { goal: "", done: [], pending: [], next: "" },
  messages: [{ id: "h1", label: "m1", kind: "message", title: "A message", at: T0, parent: null }],
  // A clone has the record but not the raw chat.
  transcriptAvailable: false,
};

function modelOf(current: ViewSession): LineageViewModel {
  return {
    kind: "lineage",
    schema: 1,
    project: { name: "p", path: "/p", generatedAt: T0 },
    status: { goal: "", done: [], pending: [], next: "", lastActivity: T0 },
    sessions: [current],
  };
}

describe("Story 9.3 on the map", () => {
  it("shows the author on the session row only when several people recorded", () => {
    const render = (model: LineageViewModel): string =>
      renderToStaticMarkup(
        createElement(SessionMap, {
          model,
          graph: layoutSessionGraph(model),
          selectedSessionId: null,
          openIds: new Set<string>(),
          highlightSessionIds: new Set<string>(),
          onOpen: () => {},
          onOpenCard: () => {},
          onContinue: () => {},
        }),
      );
    expect(render(modelOf(session))).not.toContain("session-author");

    const two = modelOf(session);
    two.sessions.push({
      ...session,
      sessionId: "s2",
      author: "Ada",
      startedAt: "2026-10-26T11:00:00.000Z",
    });
    const html = render(two);
    expect(html).toContain('class="muted session-author"');
    expect(html).toContain("Eren");
    expect(html).toContain("Ada");
  });

  it("says a missing conversation lives on another machine", () => {
    const html = renderToStaticMarkup(
      createElement(DrillDown, {
        model: modelOf(session),
        selection: { type: "node", sessionId: "s1", nodeId: "h1" },
        onClose: () => {},
      }),
    );
    expect(html).toContain("This conversation is not on this machine");
  });

  it("shows the message's branch however the message was opened", () => {
    // The selection carries no branch: the outline and a map click open it alike.
    const html = renderToStaticMarkup(
      createElement(DrillDown, {
        model: modelOf(session),
        selection: { type: "node", sessionId: "s1", nodeId: "h1" },
        onClose: () => {},
      }),
    );
    expect(html).toContain('class="branch-detail fold"');
  });

  it("offers Resume and Fork for the session, disabled when its chat is gone", () => {
    const render = (current: ViewSession) =>
      renderToStaticMarkup(
        createElement(DrillDown, {
          model: modelOf(current),
          selection: { type: "node", sessionId: "s1", nodeId: "h1" },
          onClose: () => {},
        }),
      );
    const live = render({ ...session, transcriptAvailable: true });
    expect(live).toContain(">Resume</button>");
    expect(live).toContain(">Fork</button>");
    expect(live).toContain("claude --resume s1 --fork-session");
    expect(live).not.toContain("disabled");
    const gone = render(session);
    expect(gone).toContain("session no longer available");
    expect(gone.match(/class="resume-button" disabled/g)).toHaveLength(2);
  });
});

describe("the session row's capture badge (Story 15.3)", () => {
  const render = (captured?: ReadonlyMap<string, number>, openIds = new Set<string>()): string => {
    const model = modelOf(session);
    return renderToStaticMarkup(
      createElement(SessionMap, {
        model,
        graph: layoutSessionGraph(model),
        selectedSessionId: null,
        openIds,
        highlightSessionIds: new Set<string>(),
        captured,
        onOpen: () => {},
        onOpenCard: () => {},
        onContinue: () => {},
      }),
    );
  };

  it("always draws the count on the session row, expanded or folded", () => {
    const counts = new Map([["s1", 2]]);
    for (const openIds of [new Set<string>(), new Set(["s1"])]) {
      const html = render(counts, openIds);
      expect(html).toContain('class="capture-mark session-capture"');
      expect(html).toContain('title="2 captured items from this session"');
      expect(html).toContain(">2<");
    }
    // Empty store, or only done items: count nothing, mark nothing.
    expect(render(undefined)).not.toContain("capture-mark");
    expect(render(new Map())).not.toContain("capture-mark");
  });

  it("is a button inside the row, so its click cannot be the row's toggle", () => {
    const html = render(new Map([["s1", 1]]));
    // The row is not a button (a button may not nest one): the badge is the button.
    expect(html).toMatch(/<div[^>]*class="git-row session-row"[^>]*>/);
    expect(html).toContain('role="button"');
    expect(html).toMatch(/<button[^>]*class="capture-mark session-capture"/);
    expect(html.match(/<button/g)).toHaveLength(1);
  });
});

describe("the session card's Captured work (Story 15.3)", () => {
  const capture = (
    id: string,
    state: "suggested" | "open" | "done" | "dismissed",
    text: string,
  ) => ({
    id,
    text,
    state,
    source: { sessionId: "s1" },
    createdAt: T0,
    updatedAt: T0,
  });

  it("lists the session's items with their state and age, read-only", () => {
    const model: LineageViewModel = {
      ...modelOf(session),
      captures: [
        capture("c00000001", "suggested", "write the docs"),
        capture("c00000002", "open", "ship it"),
        capture("c00000003", "done", "close the release"),
        capture("c00000004", "dismissed", "gone"),
      ],
    };
    const html = renderToStaticMarkup(
      createElement(DrillDown, {
        model,
        selection: { type: "session", sessionId: "s1" },
        captureReveal: 1,
        onClose: () => {},
      }),
    );
    expect(html).toContain("Captured work");
    expect(html).toContain("write the docs");
    expect(html).toContain("To review");
    expect(html).toContain("Open");
    expect(html).toContain("Done");
    // A dismissed item is closed and stays out of the card, like the list.
    expect(html).not.toContain("gone");
    // Actions stay in the Captured list.
    expect(html).not.toContain(">Accept<");
    expect(html).not.toContain(">Dismiss<");
  });

  it("shows no section on a session with no captured work", () => {
    const html = renderToStaticMarkup(
      createElement(DrillDown, {
        model: modelOf(session),
        selection: { type: "session", sessionId: "s1" },
        onClose: () => {},
      }),
    );
    expect(html).not.toContain("Captured work");
  });
});
