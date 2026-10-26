import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PanelViewModel } from "../../cli/src/view/model.js";
import { Panel } from "../src/Panel.js";

const model: PanelViewModel = {
  kind: "panel",
  schema: 1,
  generatedAt: "2026-10-26T10:00:00.000Z",
  settings: {
    language: "auto",
    updateEveryTurns: 5,
    sessionEndCatchUp: true,
    catchUpModel: "haiku",
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
  });
});
