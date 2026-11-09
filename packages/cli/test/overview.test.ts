import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projectPaths } from "../src/store/paths.js";
import type { LineageViewModel, ViewNode, ViewSession } from "../src/view/model.js";
import {
  dayOf,
  mergeOverviews,
  projectOverview,
  readProjectOverview,
  TOP_FILES,
  writeProjectOverview,
} from "../src/view/overview.js";
import { tempDir } from "./helpers.js";

let root: string;
beforeEach(async () => {
  root = await tempDir();
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const message = (id: string, at: string | undefined, extra: Partial<ViewNode> = {}): ViewNode => ({
  id,
  kind: "message",
  title: id,
  ...(at === undefined ? {} : { at }),
  ...extra,
});
const session = (sessionId: string, messages: ViewNode[]): ViewSession =>
  ({ sessionId, title: sessionId, messages }) as unknown as ViewSession;
// Local noon, so the day never moves with the time zone.
const at = (day: number) => new Date(2026, 10, day, 12).toISOString();

const model = {
  project: { name: "p", path: "/p", generatedAt: "2026-11-05T10:00:00.000Z" },
  sessions: [
    session("s1", [
      message("ha", at(2), {
        commits: ["c1", "c2"],
        why: "Because",
        alternatives: [{ option: "X", why: "no" }],
      }),
      message("hb", at(2)),
      { id: "p", kind: "phase", title: "Phase" } as ViewNode,
      message("hz", undefined, { why: "Undated" }),
    ]),
    session("s2", [
      // The same commit again is not a second thought commit.
      message("hc", at(4), {
        commits: ["c2", "c3"],
        agentDecisions: [
          { title: "Kept it small", why: "simpler", alternatives: [{ option: "Y", why: "big" }] },
          { title: "Named it", why: "clear" },
        ],
      }),
    ]),
  ],
  files: [
    { path: "src/a.ts", count: 2, hits: [] },
    { path: "src/b.ts", count: 5, hits: [] },
    { path: "package.json", count: 9, hits: [] },
  ],
} as unknown as LineageViewModel;

describe("projectOverview", () => {
  it("counts messages and thought commits per day, decisions and the most discussed code files", () => {
    const overview = projectOverview(model);
    expect(overview.days).toEqual([
      { day: "2026-11-02", messages: 2, commits: 2, first: { sessionId: "s1", messageId: "ha" } },
      { day: "2026-11-04", messages: 1, commits: 1, first: { sessionId: "s2", messageId: "hc" } },
    ]);
    expect(overview).toMatchObject({ decisions: 4, byAgent: 2, rejected: 2 });
    expect(overview.files).toEqual([
      { path: "src/b.ts", count: 5 },
      { path: "src/a.ts", count: 2 },
    ]);
    expect(projectOverview({ ...model, codeFiles: ["src/a.ts"] }).files).toEqual([
      { path: "src/a.ts", count: 2 },
    ]);
  });

  it("is saved for the panel and read back; a missing or broken file is nothing", async () => {
    expect(await readProjectOverview(root)).toBeUndefined();
    const overview = projectOverview(model);
    await writeProjectOverview(root, overview);
    expect(await readProjectOverview(root)).toEqual(overview);
    await writeFile(projectPaths(root).overview, "{broken");
    expect(await readProjectOverview(root)).toBeUndefined();
    await writeFile(projectPaths(root).overview, "null");
    expect(await readProjectOverview(root)).toBeUndefined();
    await writeFile(projectPaths(root).overview, JSON.stringify({ days: [], decisions: "x" }));
    expect(await readProjectOverview(root)).toMatchObject({ decisions: 0, files: [] });
    // A folder where the file should be cannot be read either.
    await rm(projectPaths(root).overview);
    await mkdir(projectPaths(root).overview);
    expect(await readProjectOverview(root)).toBeUndefined();
  });

  it("never fails the build when it cannot be saved", async () => {
    await mkdir(dirname(projectPaths(root).base), { recursive: true });
    await writeFile(projectPaths(root).base, "a file, not a folder");
    await expect(writeProjectOverview(root, projectOverview(model))).resolves.toBeUndefined();
  });

  it("names days in this machine's time zone", () => {
    expect(dayOf(new Date(2026, 0, 9, 23, 30))).toBe("2026-01-09");
  });
});

describe("mergeOverviews", () => {
  const spend = (usd: number, since: string) => ({
    runs: 1,
    usd,
    inputTokens: 1,
    outputTokens: 2,
    cacheReadTokens: 3,
    cacheWriteTokens: 4,
    since,
  });

  it("adds every project up and keeps where each day's first commit is", () => {
    const a = projectOverview(model);
    const b = {
      ...a,
      days: [
        { day: "2026-11-02", messages: 1, commits: 0 },
        { day: "2026-11-01", messages: 3, commits: 1, first: { sessionId: "t", messageId: "hx" } },
      ],
      files: [{ path: "lib/x.ts", count: 9 }],
    };
    const merged = mergeOverviews([
      {
        name: "a",
        path: "/a",
        mapUrl: "file:///a",
        overview: a,
        spend: spend(0.1, "2026-11-03T00:00:00Z"),
      },
      {
        name: "b",
        path: "/b",
        mapUrl: "file:///b",
        overview: b,
        spend: spend(0.2, "2026-11-01T00:00:00Z"),
      },
      { name: "empty", path: "/e", mapUrl: "file:///e" },
    ]);
    expect(merged?.days.map((day) => [day.day, day.messages, day.commits])).toEqual([
      ["2026-11-01", 3, 1],
      ["2026-11-02", 3, 2],
      ["2026-11-04", 1, 1],
    ]);
    expect(merged?.days[0]?.first).toEqual({
      projectPath: "/b",
      mapUrl: "file:///b",
      sessionId: "t",
      messageId: "hx",
    });
    expect(merged?.days[1]?.first?.projectPath).toBe("/a");
    expect(merged).toMatchObject({ decisions: 8, byAgent: 4, rejected: 4 });
    expect(merged?.files[0]).toEqual({
      projectName: "b",
      projectPath: "/b",
      mapUrl: "file:///b",
      path: "lib/x.ts",
      count: 9,
    });
    expect(merged?.spend).toMatchObject({ runs: 2, inputTokens: 2, since: "2026-11-01T00:00:00Z" });
    expect(merged?.spend?.usd).toBeCloseTo(0.3);
  });

  it("keeps the top files and is undefined with nothing to show", () => {
    const many = {
      ...projectOverview(model),
      files: Array.from({ length: 8 }, (_, i) => ({ path: `f${i}.ts`, count: i })),
    };
    expect(
      mergeOverviews([{ name: "a", path: "/a", mapUrl: "file:///a", overview: many }])?.files,
    ).toHaveLength(TOP_FILES);
    expect(mergeOverviews([{ name: "a", path: "/a", mapUrl: "file:///a" }])).toBeUndefined();
    const onlySpend = mergeOverviews([
      { name: "a", path: "/a", mapUrl: "file:///a", spend: spend(0.1, "2026-11-01T00:00:00Z") },
    ]);
    expect(onlySpend).toMatchObject({ days: [], decisions: 0 });
    expect(onlySpend?.spend?.runs).toBe(1);
  });
});
