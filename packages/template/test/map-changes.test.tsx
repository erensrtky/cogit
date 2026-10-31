import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LineageViewModel, ViewNode, ViewSession } from "../../cli/src/view/model.js";
import { GitGraph } from "../src/GitGraph.js";
import { layoutGitGraph } from "../src/gitLayout.js";
import { DrillDown } from "../src/SidePanel.js";

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

function renderGraph(bigChangeLines = 300, captured?: ReadonlyMap<string, number>): string {
  return renderToStaticMarkup(
    createElement(GitGraph, {
      git: layoutGitGraph(session.messages),
      selectedId: null,
      highlightIds: undefined,
      activeHitId: null,
      bigChangeLines,
      captured,
      onSelect: () => {},
      onUnfold: () => {},
      onContinue: () => {},
    }),
  );
}

describe("how much code landed on the map (10.3)", () => {
  it("puts a numstat chip on rows that have commits", () => {
    const html = renderGraph();
    expect(html).toContain('class="git-change"');
    expect(html).toContain("+1 200 −40 · 14 files");
    expect(html).toContain("+6 −2 · 1 file");
    // No commits: no chip, not a zero.
    expect(html.match(/class="git-change"/g)).toHaveLength(2);
  });

  it("marks a row above the threshold, and only above it", () => {
    expect(renderGraph()).toContain("is-big-change");
    // The small message stays plain; a big threshold leaves every row plain.
    expect(renderGraph(300).match(/is-big-change/g)).toHaveLength(1);
    expect(renderGraph(10_000)).not.toContain("is-big-change");
  });

  it("puts the captured-work mark on the anchored message row only", () => {
    const html = renderGraph(300, new Map([["h1", 2]]));
    expect(html.match(/class="capture-mark git-capture"/g)).toHaveLength(1);
    expect(html).toContain('title="2 captured items from this session"');
    expect(renderGraph()).not.toContain("capture-mark");
  });

  it("shows the numbers and the big mark in the drill-down", () => {
    const html = renderToStaticMarkup(
      createElement(DrillDown, {
        model: modelOf(session),
        selection: { type: "node", sessionId: "s1", nodeId: "h1" },
        onClose: () => {},
        bigChangeLines: 300,
      }),
    );
    expect(html).toContain("Code landed");
    expect(html).toContain("+1 200 −40 · 14 files");
    expect(html).toContain("after this message");
    expect(html).toContain("is-big");
    // The reason and the code come first; the conversation is folded at the end.
    expect(html).toContain('<details class="chat fold"><summary>Conversation</summary>');
    expect(html.indexOf("Code landed")).toBeLessThan(html.indexOf("Conversation"));
    expect(html.indexOf("Conversation")).toBeLessThan(html.indexOf("drilldown-meta"));
  });
});
