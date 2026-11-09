import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LineageViewModel, ViewNode, ViewSession } from "../../cli/src/view/model.js";
import {
  calendarWeeks,
  dailyActivity,
  dayOf,
  decisionCounts,
  messageCount,
  nextDay,
  shade,
  topFiles,
} from "../src/dashboard.js";
import { Home } from "../src/Home.js";

const message = (id: string, at: string, extra: Partial<ViewNode> = {}): ViewNode => ({
  id,
  kind: "message",
  title: `Message ${id}`,
  at,
  ...extra,
});

const session = (sessionId: string, messages: ViewNode[]): ViewSession =>
  ({ sessionId, title: sessionId, messages }) as unknown as ViewSession;

// Local noon, so the day never moves with the time zone.
const at = (day: number) => new Date(2026, 10, day, 12).toISOString();
const today = new Date(2026, 10, 5, 18);

const sessions = [
  session("s1", [
    message("a", at(2), {
      commits: ["c1", "c2"],
      why: "Because",
      alternatives: [{ option: "X", why: "no" }],
    }),
    message("b", at(2)),
    { id: "p", kind: "phase", title: "Phase" } as ViewNode,
  ]),
  session("s2", [
    // The same commit again is not a second thought commit.
    message("c", at(4), {
      commits: ["c2", "c3"],
      agentDecisions: [
        { title: "Kept it small", why: "simpler", alternatives: [{ option: "Y", why: "big" }] },
        { title: "Named it", why: "clear" },
      ],
    }),
  ]),
];

describe("dashboard numbers", () => {
  it("counts messages and thought commits per day, quiet days included", () => {
    const days = dailyActivity(sessions, today);
    expect(days.map((day) => [day.day, day.messages, day.commits])).toEqual([
      ["2026-11-02", 2, 2],
      ["2026-11-03", 0, 0],
      ["2026-11-04", 1, 1],
      ["2026-11-05", 0, 0],
    ]);
    expect(days[0]?.first).toEqual({ sessionId: "s1", messageId: "a" });
    expect(days[1]?.first).toBeUndefined();
    expect(dailyActivity([], today)).toEqual([]);
  });

  it("counts decisions the way cogit why lists them", () => {
    expect(decisionCounts(sessions)).toEqual({ decisions: 3, byAgent: 2, rejected: 2 });
    expect(messageCount(sessions)).toBe(3);
  });

  it("orders the most discussed code files", () => {
    const files = [
      { path: "src/a.ts", count: 2, hits: [] },
      { path: "src/b.ts", count: 5, hits: [] },
      { path: "package.json", count: 9, hits: [] },
    ];
    expect(topFiles(files, undefined).map((file) => file.path)).toEqual(["src/b.ts", "src/a.ts"]);
    expect(topFiles(undefined, undefined)).toEqual([]);
  });

  it("lays a year out in Sunday-first weeks ending today", () => {
    const weeks = calendarWeeks(dailyActivity(sessions, today), today);
    expect(weeks).toHaveLength(53);
    const last = weeks.at(-1) ?? [];
    // 5 November 2026 is a Thursday: Sunday to Thursday shown, the rest still to come.
    expect(last.map((day) => day?.day ?? null)).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      null,
      null,
    ]);
    expect(last[1]?.commits).toBe(2);
    expect(weeks[0]?.[0]?.day).toBe("2025-11-02");
  });

  it("shades by the busiest day and walks dates across months", () => {
    expect([0, 1, 2, 3, 4].map((count) => shade(count, 4))).toEqual([0, 1, 2, 3, 4]);
    expect(shade(3, 0)).toBe(0);
    expect(nextDay("2026-10-31")).toBe("2026-11-01");
    expect(dayOf(new Date(2026, 0, 9))).toBe("2026-01-09");
  });
});

describe("Home", () => {
  const model = {
    kind: "lineage",
    schema: 1,
    project: { name: "p", path: "/p", generatedAt: at(5) },
    sessions,
    files: [{ path: "src/a.ts", count: 2, hits: [] }],
  } as unknown as LineageViewModel;
  const render = (extra: Partial<LineageViewModel> = {}) =>
    renderToStaticMarkup(
      createElement(Home, {
        model: { ...model, ...extra },
        today,
        onOpenMessage: () => {},
        onOpenFile: () => {},
      }),
    );

  it("shows the chart, the numbers, the files and the calendar", () => {
    const html = render();
    expect(html).toContain("Talk and the code it led to");
    expect(html).toContain("2 taken by the agent on its own");
    expect(html).toContain("Not measured yet");
    expect(html).toContain("src/a.ts");
    expect(html).toContain("3 thought commits in the last year");
  });

  it("shows what cogit itself spent, per message since the first run", () => {
    const html = render({
      spend: {
        runs: 2,
        usd: 0.3,
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 10_000,
        cacheWriteTokens: 0,
        since: new Date(2026, 10, 3).toISOString(),
      },
    });
    expect(html).toContain("$0.30");
    expect(html).toContain("in 2 background runs");
    // One message since the first run.
    expect(html).toContain("about $0.30 a message");
  });

  it("says so when nothing is recorded", () => {
    expect(render({ sessions: [] })).toContain("No sessions recorded yet");
  });
});
