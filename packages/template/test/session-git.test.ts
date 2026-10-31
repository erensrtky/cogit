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
          onOpenMessage: () => {},
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

describe("captured work on the map (Story 15.2)", () => {
  it("marks the session row with its count while the first message is not drawn", () => {
    const model = modelOf(session);
    const render = (captured: Map<string, { count: number; messageId: string }> | undefined) =>
      renderToStaticMarkup(
        createElement(SessionMap, {
          model,
          graph: layoutSessionGraph(model),
          selectedSessionId: null,
          openIds: new Set<string>(),
          highlightSessionIds: new Set<string>(),
          captured,
          onOpen: () => {},
          onOpenMessage: () => {},
          onContinue: () => {},
        }),
      );
    const html = render(new Map([["s1", { count: 2, messageId: "h1" }]]));
    expect(html).toContain("session-capture");
    expect(html).toContain(">2<");
    expect(render(undefined)).not.toContain("session-capture");
  });

  it("lists the session's items in the first message's details, read-only", () => {
    const model: LineageViewModel = {
      ...modelOf(session),
      captures: [
        {
          id: "c00000001",
          text: "write the docs",
          state: "suggested",
          source: { sessionId: "s1" },
          createdAt: T0,
          updatedAt: T0,
        },
        {
          id: "c00000002",
          text: "ship it",
          state: "open",
          source: { sessionId: "s1" },
          createdAt: T0,
          updatedAt: T0,
        },
      ],
    };
    const html = renderToStaticMarkup(
      createElement(DrillDown, {
        model,
        selection: { type: "node", sessionId: "s1", nodeId: "h1" },
        onClose: () => {},
      }),
    );
    expect(html).toContain("Captured here");
    expect(html).toContain("write the docs");
    expect(html).toContain("To review");
    expect(html).toContain("Open");
    // Actions stay in the Captured list.
    expect(html).not.toContain(">Accept<");
  });

  it("shows the section only on the anchor, not on another message", () => {
    const two = {
      ...session,
      messages: [
        ...session.messages,
        { id: "h2", label: "m2", kind: "message", title: "Later", at: T0, parent: "h1" },
      ],
    } as ViewSession;
    const model: LineageViewModel = {
      ...modelOf(two),
      captures: [
        {
          id: "c00000001",
          text: "write the docs",
          state: "suggested",
          source: { sessionId: "s1" },
          createdAt: T0,
          updatedAt: T0,
        },
      ],
    };
    const html = renderToStaticMarkup(
      createElement(DrillDown, {
        model,
        selection: { type: "node", sessionId: "s1", nodeId: "h2" },
        onClose: () => {},
      }),
    );
    expect(html).not.toContain("Captured here");
  });
});
