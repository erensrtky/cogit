import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import type { PanelViewModel } from "../../cli/src/view/model.js";
import { Panel } from "../src/Panel.js";

const model: PanelViewModel = {
  kind: "panel",
  schema: 1,
  generatedAt: "2026-10-26T10:00:00.000Z",
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
  },
  projects: [],
};

describe("Panel", () => {
  it("puts the settings in the top bar and not in the old bottom box", () => {
    // No projects: mapHref would read the document, which a server render lacks.
    const html = renderToStaticMarkup(createElement(Panel, { model }));
    expect(html).toContain('class="settings-button"');
    expect(html).toContain("Settings");
    expect(html).not.toContain('aria-label="Settings"');
    expect(html).not.toContain("Read-only; change them with");
    expect(html).toContain('<main class="panel-page">');
    expect(html).toContain('class="brand"');
  });
});

describe("Panel cards", () => {
  afterEach(() => {
    delete (globalThis as { document?: unknown }).document;
  });

  it("opens a project's map from anywhere on its card", () => {
    // A served panel: the live-page meta is there.
    (globalThis as { document?: unknown }).document = { querySelector: () => ({}) };
    const project = {
      name: "cogit",
      path: "/work/cogit",
      lineageUrl: "file:///work/cogit/.cogit/map.html",
      lastActivity: "2026-10-26T10:00:00.000Z",
      needsUserCount: 0,
      missing: false,
    } as PanelViewModel["projects"][number];
    const html = renderToStaticMarkup(
      createElement(Panel, { model: { ...model, projects: [project] } }),
    );
    expect(html).toContain('<a class="card-open" href="/map?dir=%2Fwork%2Fcogit">');
    expect(html).not.toContain("missing");
  });

  it("says how to remove a project whose directory is gone", () => {
    (globalThis as { document?: unknown }).document = { querySelector: () => ({}) };
    const project = {
      name: "gone",
      path: "/work/gone",
      lineageUrl: "file:///work/gone/.cogit/map.html",
      lastActivity: null,
      needsUserCount: 0,
      missing: true,
    } as PanelViewModel["projects"][number];
    const html = renderToStaticMarkup(
      createElement(Panel, { model: { ...model, projects: [project] } }),
    );
    expect(html).toContain('<li class="card missing">');
    expect(html).toContain("`cogit config prune` removes it from the panel.");
  });
});
