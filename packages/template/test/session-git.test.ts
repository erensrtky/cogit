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
  epoch: "e1",
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
    epochs: [{ id: "e1", title: "E", createdAt: T0, sessions: [current] }],
    unassigned: [],
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
          onContinue: () => {},
        }),
      );
    expect(render(modelOf(session))).not.toContain("session-author");

    const two = modelOf(session);
    two.unassigned = [
      { ...session, sessionId: "s2", author: "Ada", startedAt: "2026-10-26T11:00:00.000Z" },
    ];
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
});
