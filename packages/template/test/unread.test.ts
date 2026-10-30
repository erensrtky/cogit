import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  LineageViewModel,
  PanelViewModel,
  ViewNode,
  ViewSession,
} from "../../cli/src/view/model.js";
import { GitGraph } from "../src/GitGraph.js";
import { layoutGitGraph } from "../src/gitLayout.js";
import { Panel } from "../src/Panel.js";
import { DrillDown } from "../src/SidePanel.js";
import { UnreadView } from "../src/UnreadView.js";

const T0 = "2026-10-26T10:00:00.000Z";

const BIG = { added: 1200, removed: 40, files: 14 };
const SMALL = { added: 6, removed: 2, files: 1 };

function message(id: string, extra: Partial<ViewNode> = {}): ViewNode {
  return {
    id,
    label: id === "h1" ? "m1" : "m2",
    kind: "message",
    title: `Message ${id}`,
    at: T0,
    parent: null,
    ...extra,
  };
}

const session: ViewSession = {
  sessionId: "s1",
  agent: "claude-code",
  title: "Session one",
  startedAt: T0,
  updatedAt: T0,
  status: { goal: "", done: [], pending: [], next: "" },
  messages: [
    message("h1", { change: BIG, commits: ["a".repeat(40)] }),
    message("h2", { change: SMALL, commits: ["b".repeat(40)] }),
    message("h3"),
  ],
  transcriptAvailable: false,
};

function modelOf(current: ViewSession): LineageViewModel {
  return {
    kind: "lineage",
    schema: 1,
    project: { name: "p", path: "/p", generatedAt: T0 },
    status: { goal: "", done: [], pending: [], next: "", lastActivity: T0 },
    sessions: [current],
    read: [],
    settings: {
      recorder: "mixed",
      language: "auto",
      updateEveryTurns: 15,
      sideEveryTurns: 5,
      sessionEndCatchUp: true,
      sideModel: "haiku",
      messageSummaries: false,
      startupContext: true,
      shareConversations: false,
      recordCommit: "ask",
      gitPolicy: "ignore",
      agents: ["claude-code"],
      bigChangeLines: 300,
    },
  };
}

function renderGraph(readIds: ReadonlySet<string>): string {
  return renderToStaticMarkup(
    createElement(GitGraph, {
      git: layoutGitGraph(session.messages),
      selectedId: null,
      highlightIds: undefined,
      activeHitId: null,
      readIds,
      bigChangeLines: 300,
      onSelect: () => {},
      onUnfold: () => {},
      onContinue: () => {},
    }),
  );
}

describe("how much code landed on the map (10.3)", () => {
  it("puts a numstat chip on rows that have commits", () => {
    const html = renderGraph(new Set());
    expect(html).toContain('class="git-change"');
    expect(html).toContain("+1 200 −40 · 14 files");
    expect(html).toContain("+6 −2 · 1 file");
    // No commits: no chip, not a zero.
    expect(html.match(/class="git-change"/g)).toHaveLength(2);
  });

  it("marks an unread row above the threshold, and drops it once read", () => {
    expect(renderGraph(new Set())).toContain("is-unread-big");
    // The small unread message is not big; a read big one is no longer marked.
    const readBig = renderGraph(new Set(["h1"]));
    expect(readBig).not.toContain("is-unread-big");
  });

  it("keeps the threshold a setting, not a verdict", () => {
    const html = renderToStaticMarkup(
      createElement(GitGraph, {
        git: layoutGitGraph(session.messages),
        selectedId: null,
        highlightIds: undefined,
        activeHitId: null,
        readIds: new Set(),
        bigChangeLines: 10_000,
        onSelect: () => {},
        onUnfold: () => {},
        onContinue: () => {},
      }),
    );
    expect(html).not.toContain("is-unread-big");
  });

  it("lists unread messages with their numbers and the big mark", () => {
    const html = renderToStaticMarkup(
      createElement(UnreadView, {
        messages: [
          {
            sessionId: "s1",
            sessionTitle: "Session one",
            sessionStartedAt: T0,
            messageId: "h1",
            label: "m1",
            title: "Message h1",
            at: T0,
            change: BIG,
          },
          {
            sessionId: "s1",
            sessionTitle: "Session one",
            sessionStartedAt: T0,
            messageId: "h2",
            label: "m2",
            title: "Message h2",
            change: SMALL,
          },
        ],
        bigChangeLines: 300,
        active: { sessionId: "s1", messageId: "h2" },
        onSelect: () => {},
        onClose: () => {},
      }),
    );
    expect(html).toContain("Unread, most code first");
    expect(html).toContain("+1 200 −40 · 14 files");
    expect(html).toContain("is-active");
    expect((html.match(/is-big/g) ?? []).length).toBeGreaterThan(0);
    // The small row is active but not big.
    expect(html).toContain("unread-row is-active");
  });

  it("says plainly when nothing is unread", () => {
    const html = renderToStaticMarkup(
      createElement(UnreadView, {
        messages: [],
        bigChangeLines: 300,
        active: null,
        onSelect: () => {},
        onClose: () => {},
      }),
    );
    expect(html).toContain("No unread messages with commits");
  });

  it("shows the numbers and a read toggle in the drill-down", () => {
    const model = modelOf(session);
    const unread = renderToStaticMarkup(
      createElement(DrillDown, {
        model,
        selection: { type: "node", sessionId: "s1", nodeId: "h1" },
        onClose: () => {},
        read: false,
        onToggleRead: () => {},
        bigChangeLines: 300,
        readError: null,
      }),
    );
    expect(unread).toContain("Code landed");
    expect(unread).toContain("+1 200 −40 · 14 files");
    expect(unread).toContain("Mark as read");
    expect(unread).toContain("after this message");
    expect(unread).toContain("is-big");
    // The reason and the code come first; the conversation is folded at the end.
    expect(unread).toContain('<details class="chat fold"><summary>Conversation</summary>');
    expect(unread.indexOf("Code landed")).toBeLessThan(unread.indexOf("Conversation"));
    expect(unread.indexOf("Conversation")).toBeLessThan(unread.indexOf("drilldown-meta"));

    const read = renderToStaticMarkup(
      createElement(DrillDown, {
        model,
        selection: { type: "node", sessionId: "s1", nodeId: "h1" },
        onClose: () => {},
        read: true,
        onToggleRead: () => {},
        bigChangeLines: 300,
        readError: "could not write",
      }),
    );
    expect(read).toContain("Mark as unread");
    expect(read).toContain("could not write");
    expect(read).not.toContain("is-big");
  });

  it("shows the card count on the panel", () => {
    const model: PanelViewModel = {
      kind: "panel",
      schema: 1,
      generatedAt: T0,
      settings: modelOf(session).settings as PanelViewModel["settings"],
      projects: [
        {
          name: "p",
          path: "/p",
          missing: false,
          lastActivity: T0,
          needsUserCount: 0,
          lineageUrl: "file:///p/.cogit/map.html",
          unreadBigCount: 3,
        },
      ],
    };
    const html = renderToStaticMarkup(createElement(Panel, { model }));
    expect(html).toContain("Unread big changes");
    expect(html).toContain("<dd>3</dd>");
  });
});
