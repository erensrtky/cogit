import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PanelOverview, PanelViewModel } from "../../cli/src/view/model.js";
import { calendarWeeks, dayOf, fillDays, nextDay, shade } from "../src/dashboard.js";
import { Overview } from "../src/Overview.js";
import { Panel } from "../src/Panel.js";

const today = new Date(2026, 10, 5, 18);
const first = {
  projectPath: "/p",
  mapUrl: "file:///p/.cogit/map.html",
  sessionId: "s1",
  messageId: "ha",
};

const overview: PanelOverview = {
  days: [
    { day: "2026-11-02", messages: 2, commits: 2, first },
    { day: "2026-11-04", messages: 1, commits: 1 },
  ],
  decisions: 3,
  byAgent: 2,
  rejected: 2,
  files: [
    { projectName: "p", projectPath: "/p", mapUrl: first.mapUrl, path: "src/a.ts", count: 2 },
  ],
};

describe("dashboard days", () => {
  it("fills the quiet days up to today", () => {
    expect(fillDays(overview.days, today).map((day) => [day.day, day.commits])).toEqual([
      ["2026-11-02", 2],
      ["2026-11-03", 0],
      ["2026-11-04", 1],
      ["2026-11-05", 0],
    ]);
    expect(fillDays([], today)).toEqual([]);
  });

  it("lays a year out in Sunday-first weeks ending today", () => {
    const weeks = calendarWeeks(fillDays(overview.days, today), today);
    expect(weeks).toHaveLength(53);
    // 5 November 2026 is a Thursday: Sunday to Thursday shown, the rest still to come.
    expect((weeks.at(-1) ?? []).map((day) => day?.day ?? null)).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      null,
      null,
    ]);
    expect(weeks[0]?.[0]?.day).toBe("2025-11-02");
  });

  it("shades by the busiest day and walks dates across months", () => {
    expect([0, 1, 2, 3, 4].map((count) => shade(count, 4))).toEqual([0, 1, 2, 3, 4]);
    expect(shade(3, 0)).toBe(0);
    expect(nextDay("2026-10-31")).toBe("2026-11-01");
    expect(dayOf(new Date(2026, 0, 9))).toBe("2026-01-09");
  });
});

describe("Overview", () => {
  const render = (extra: Partial<PanelOverview> = {}) =>
    renderToStaticMarkup(createElement(Overview, { overview: { ...overview, ...extra }, today }));

  it("shows the chart, the numbers, the files and the calendar", () => {
    const html = render();
    expect(html).toContain("Talk and the code it led to");
    expect(html).toContain("2 taken by the agent on its own");
    expect(html).toContain("Not measured yet");
    expect(html).toContain('href="file:///p/.cogit/map.html#f=src%2Fa.ts"');
    expect(html).toContain("3 thought commits in the last year");
    // A day with a thought commit links to its first one; a quiet day is no link.
    expect(html).toContain('href="file:///p/.cogit/map.html#s=s1&amp;m=ha"');
  });

  it("shows what cogit itself spent, per message since its first run", () => {
    const html = render({
      spend: {
        runs: 2,
        usd: 0.3,
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 10_000,
        cacheWriteTokens: 0,
        since: new Date(2026, 10, 3, 9).toISOString(),
      },
    });
    // Tokens only, cache reads apart: no dollar figure.
    expect(html).toContain("1.5K tokens");
    expect(html).not.toContain("$");
    expect(html).toContain("in 2 background runs");
    // One message since the first run.
    expect(html).toContain("about 1.5K a message");
    expect(html).toContain("Plus 10K re-read from cache");
  });

  it("counts Codex runs too, and skips the cache line when nothing was re-read", () => {
    const html = render({
      spend: {
        runs: 1,
        usd: 0,
        inputTokens: 200,
        outputTokens: 100,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        unpriced: 1,
      },
    });
    expect(html).toContain("300 tokens");
    expect(html).toContain("in 1 background run, about 100 a message");
    expect(html).not.toContain("Codex");
    expect(html).not.toContain("re-read from cache");
  });

  it("leaves out the chart and the calendar before any message", () => {
    const html = render({ days: [] });
    expect(html).not.toContain("Talk and the code it led to");
    expect(html).toContain("Decisions");
  });

  it("sits on top of the start page when there are numbers", () => {
    const panel = {
      kind: "panel",
      schema: 1,
      generatedAt: "2026-11-05T10:00:00.000Z",
      settings: {},
      projects: [],
    } as unknown as PanelViewModel;
    expect(renderToStaticMarkup(createElement(Panel, { model: panel }))).not.toContain(
      "home-tiles",
    );
    expect(renderToStaticMarkup(createElement(Panel, { model: { ...panel, overview } }))).toContain(
      "home-tiles",
    );
  });
});
