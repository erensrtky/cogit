import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildProject } from "../src/commands/build.js";
import { epochAdd } from "../src/commands/epoch.js";
import { init } from "../src/commands/init.js";
import { sessionWrite } from "../src/commands/session.js";
import type { LineageNode, Session } from "../src/schema/session.js";
import { projectPaths } from "../src/store/paths.js";
import { buildNodeTree, buildViewModel, embedViewModel, statusCard } from "../src/view/lineage.js";
import { DATA_ELEMENT_ID } from "../src/view/model.js";
import { envFor, type FakeIo, fakeIo, T0, tempDir } from "./helpers.js";

const TEMPLATE = `<!doctype html><html><body><div id="root"></div>
    <script id="${DATA_ELEMENT_ID}" type="application/json"></script></body></html>`;

const DATA_PREFIX = `<script id="${DATA_ELEMENT_ID}" type="application/json">`;

function embedded(html: string): unknown {
  const start = html.indexOf(DATA_PREFIX);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = html.indexOf("</script>", start);
  return JSON.parse(html.slice(start + DATA_PREFIX.length, end));
}

function node(
  id: string,
  kind: LineageNode["kind"],
  title: string,
  parent: string | null = null,
  extra: Partial<LineageNode> = {},
): LineageNode {
  return { id, parent, kind, title, ...extra };
}

function session(over: Partial<Session> & { sessionId: string }): Session {
  return {
    schema: 1,
    agent: "claude-code",
    title: "",
    epoch: null,
    startedAt: T0,
    updatedAt: T0,
    status: { goal: "", done: [], pending: [], next: "" },
    nodes: [],
    ...over,
  };
}

describe("buildNodeTree", () => {
  it("carries decision detail into the view and drops empty lists", () => {
    const [d] = buildNodeTree([
      node("d", "decision", "D", null, {
        decidedBy: "user",
        alternatives: [{ option: "x", why: "y" }],
        commits: ["abc1234"],
        files: [],
      }),
    ]);
    expect(d).toMatchObject({ decidedBy: "user", commits: ["abc1234"] });
    expect(d?.alternatives).toHaveLength(1);
    expect(d).not.toHaveProperty("files");
  });

  it("orders siblings by when their thread began, keeping unstamped ones first and in order", () => {
    const t = (h: number) => `2026-10-23T${String(h).padStart(2, "0")}:00:00.000Z`;
    const tree = buildNodeTree([
      node("late", "phase", "Late topic", null, { addedAt: t(1) }),
      node("old", "phase", "Unstamped topic"),
      node("early", "phase", "Renamed topic", null, { addedAt: t(9) }),
      node("x", "step", "Old item moved in", "early", { addedAt: t(0) }),
      node("y", "step", "Second", "late", { addedAt: t(5) }),
      node("z", "step", "First", "late", { addedAt: t(2) }),
      node("old2", "phase", "Another unstamped"),
    ]);
    expect(tree.map((n) => n.id)).toEqual(["old", "old2", "early", "late"]);
    expect(tree[3]?.children.map((n) => n.id)).toEqual(["z", "y"]);
    expect(tree[2]?.addedAt).toBe(t(9));
  });

  it("nests children in order and keeps optional fields only when present", () => {
    const tree = buildNodeTree([
      node("a", "phase", "A", null, { summary: "phase one", at: T0 }),
      node("b", "step", "B", "a"),
      node("c", "decision", "C", "b", { why: "because" }),
      node("d", "question", "D", "a"),
    ]);
    expect(tree).toEqual([
      {
        id: "a",
        kind: "phase",
        title: "A",
        summary: "phase one",
        at: T0,
        children: [
          {
            id: "b",
            kind: "step",
            title: "B",
            children: [{ id: "c", kind: "decision", title: "C", why: "because", children: [] }],
          },
          { id: "d", kind: "question", title: "D", children: [] },
        ],
      },
    ]);
  });

  it("re-roots missing parents, self references and cycles without losing nodes", () => {
    const tree = buildNodeTree([
      node("a", "phase", "A", "ghost"),
      node("b", "step", "B", "b"),
      node("x", "decision", "X", "y"),
      node("y", "step", "Y", "x"),
    ]);
    expect(tree.map((n) => n.id)).toEqual(["a", "b", "x"]);
    expect(tree[2]).toMatchObject({ id: "x", children: [{ id: "y", children: [] }] });
  });
});

describe("buildViewModel", () => {
  it("orders epochs by project order, sessions by startedAt and groups unknown epochs", () => {
    const sessions = [
      session({
        sessionId: "late",
        epoch: "e1",
        startedAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      }),
      session({
        sessionId: "early",
        epoch: "e1",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-05T00:00:00.000Z",
        status: {
          goal: "ship",
          done: ["a"],
          pending: [{ text: "decide", needsUser: true }],
          next: "go",
        },
      }),
      session({
        sessionId: "ghost",
        epoch: "nope",
        startedAt: "2026-01-04T00:00:00.000Z",
        updatedAt: "2026-01-04T00:00:00.000Z",
      }),
      session({
        sessionId: "none",
        epoch: null,
        startedAt: "2026-01-03T00:00:00.000Z",
        updatedAt: "2026-01-03T00:00:00.000Z",
      }),
    ];
    const model = buildViewModel({
      project: {
        schema: 1,
        name: "p",
        epochs: [
          { id: "e2", title: "Second", createdAt: T0 },
          { id: "e1", title: "First", createdAt: T0 },
        ],
      },
      sessions,
      path: "/tmp/p",
      generatedAt: T0,
    });

    expect(model.epochs.map((e) => e.id)).toEqual(["e2", "e1"]);
    expect(model.epochs[1]?.sessions.map((s) => s.sessionId)).toEqual(["early", "late"]);
    expect(model.epochs[0]?.sessions).toEqual([]);
    expect(model.unassigned.map((s) => s.sessionId)).toEqual(["none", "ghost"]);
    expect(model.status).toEqual({
      goal: "ship",
      done: ["a"],
      pending: [{ text: "decide", needsUser: true }],
      next: "go",
      lastActivity: "2026-01-05T00:00:00.000Z",
    });
    expect(model.project).toEqual({ name: "p", path: "/tmp/p", generatedAt: T0 });
  });

  it("has an empty status card without sessions", () => {
    const model = buildViewModel({
      project: { schema: 1, name: "p", epochs: [] },
      sessions: [],
      path: "/tmp/p",
      generatedAt: T0,
    });
    expect(model.status).toEqual({ goal: "", done: [], pending: [], next: "", lastActivity: null });
    expect(model.unassigned).toEqual([]);
  });
});

describe("statusCard", () => {
  const NOW = "2026-10-21T10:00:00.000Z";

  it("takes goal/done/next from the latest session and merges active needsUser items once", () => {
    const sessions = [
      session({
        sessionId: "inactive",
        updatedAt: "2026-09-01T00:00:00.000Z",
        status: {
          goal: "stale",
          done: [],
          pending: [{ text: "stale ask", needsUser: true }],
          next: "stale",
        },
      }),
      session({
        sessionId: "latest",
        updatedAt: "2026-10-20T09:00:00.000Z",
        status: {
          goal: "goal",
          done: ["done"],
          pending: [{ text: "mine", needsUser: true }],
          next: "next",
        },
      }),
      session({
        sessionId: "active-new",
        updatedAt: "2026-10-20T08:00:00.000Z",
        status: {
          goal: "",
          done: [],
          pending: [
            { text: "mine", needsUser: true },
            { text: "shared", needsUser: true },
            { text: "not merged", needsUser: false },
          ],
          next: "",
        },
      }),
      session({
        sessionId: "active-old",
        updatedAt: "2026-10-18T00:00:00.000Z",
        status: {
          goal: "",
          done: [],
          pending: [{ text: "older ask", needsUser: true }],
          next: "",
        },
      }),
    ];

    expect(statusCard(sessions, NOW)).toEqual({
      goal: "goal",
      done: ["done"],
      pending: [
        { text: "mine", needsUser: true },
        { text: "shared", needsUser: true },
        { text: "older ask", needsUser: true },
      ],
      next: "next",
      lastActivity: "2026-10-20T09:00:00.000Z",
    });
  });

  it("treats unparseable timestamps as inactive instead of merging them", () => {
    const sessions = [
      session({
        sessionId: "latest",
        updatedAt: "2026-10-20T00:00:00.000Z",
        status: { goal: "goal", done: [], pending: [], next: "" },
      }),
      session({
        sessionId: "broken",
        updatedAt: "not-a-date",
        status: { goal: "", done: [], pending: [{ text: "ask", needsUser: true }], next: "" },
      }),
    ];
    expect(statusCard(sessions, NOW).pending).toEqual([]);
    expect(statusCard(sessions, "also-broken").pending).toEqual([]);
  });

  it("skips a newer session without a status but keeps its time as last activity", () => {
    const sessions = [
      session({
        sessionId: "with-status",
        updatedAt: "2026-10-20T08:00:00.000Z",
        status: { goal: "goal", done: ["done"], pending: [], next: "next" },
      }),
      session({ sessionId: "bare", updatedAt: "2026-10-20T09:00:00.000Z" }),
    ];
    expect(statusCard(sessions, NOW)).toEqual({
      goal: "goal",
      done: ["done"],
      pending: [],
      next: "next",
      lastActivity: "2026-10-20T09:00:00.000Z",
    });
  });
});

describe("embedViewModel", () => {
  const model = buildViewModel({
    project: { schema: 1, name: "p", epochs: [] },
    sessions: [],
    path: "/tmp/p",
    generatedAt: T0,
  });

  it("fills the data element and round-trips the model", () => {
    const html = embedViewModel(TEMPLATE, model);
    expect(html).toContain('<div id="root">');
    expect(embedded(html)).toEqual(model);
  });

  it("escapes markup and line separators inside the JSON", () => {
    const risky = {
      ...model,
      project: { ...model.project, name: `</script><b>&\u2028\u2029` },
    };
    const html = embedViewModel(TEMPLATE, risky);
    expect(html).not.toContain("</script><b>");
    expect(html).not.toContain("\u2028");
    expect(html).toContain("\\u003c/script\\u003e\\u003cb\\u003e\\u0026\\u2028\\u2029");
    expect(embedded(html)).toEqual(risky);
  });

  it("refuses a template without the data element", () => {
    expect(() => embedViewModel("<html></html>", model)).toThrow(/no empty/);
  });
});

describe("codelineage build", () => {
  let dir: string;
  let root: string;
  let io: FakeIo;
  const paths = () => projectPaths(root);

  const saveSession = (id: string, value: unknown) =>
    writeFile(paths().session(id), JSON.stringify(value));

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
    io = fakeIo(envFor(dir));
    await init(root, { name: "proj", retention: "keep", language: "auto" }, fakeIo(envFor(dir)));
    await epochAdd(root, "e1", "First", fakeIo(envFor(dir)));
  });

  it("writes the map, keeping good sessions and warning about bad ones", async () => {
    await saveSession(
      "s1",
      session({
        sessionId: "s1",
        title: "one",
        epoch: "e1",
        startedAt: "2026-01-02T00:00:00.000Z",
        nodes: [
          node("a", "phase", "A"),
          node("b", "step", "B", "a", {
            summary: "token ghp_abcdefghijklmnopqrstuvwxyz0123456789",
          }),
        ],
      }),
    );
    await saveSession(
      "s2",
      session({
        sessionId: "s2",
        title: "two",
        epoch: "e1",
        startedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    await saveSession(
      "s3",
      session({
        sessionId: "s3",
        epoch: "missing",
        startedAt: "2026-01-05T00:00:00.000Z",
        updatedAt: "2026-12-01T00:00:00.000Z",
        status: {
          goal: "latest",
          done: [],
          pending: [{ text: "ask", needsUser: true }],
          next: "n",
        },
      }),
    );
    await saveSession(
      "s4",
      session({ sessionId: "s4", epoch: null, startedAt: "2026-01-03T00:00:00.000Z" }),
    );
    await writeFile(paths().session("bad"), "{nope");
    await writeFile(paths().session("partial"), '{"schema":1,"sessionId":"p"}');
    await saveSession("newer", {
      ...session({ sessionId: "newer", epoch: "e1" }),
      schema: 2,
    });
    await writeFile(join(paths().sessions, "notes.txt"), "ignored");
    await mkdir(join(paths().sessions, "nested"));
    await writeFile(join(paths().sessions, "nested", "x.json"), "{}");

    const model = await buildProject({ dir: root, io, templateHtml: TEMPLATE });

    expect(io.lines).toEqual([`Wrote ${paths().html}`]);
    expect(io.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^skipping session bad: invalid JSON/),
        expect.stringMatching(/^skipping session partial: /),
        expect.stringMatching(/^session newer: schema v2 is newer/),
        "redacted 1 secret-looking value(s) in the map",
      ]),
    );
    // The panel reads the same project again; its warnings must not repeat.
    expect(io.warnings.filter((line) => line.startsWith("skipping session bad:"))).toHaveLength(1);

    expect(model.epochs[0]?.sessions.map((s) => s.sessionId)).toEqual(["s2", "s1", "newer"]);
    expect(model.unassigned.map((s) => s.sessionId)).toEqual(["s4", "s3"]);
    expect(model.epochs[0]?.sessions[1]?.nodes[0]?.children[0]?.summary).toBe("token [REDACTED]");
    expect(model.status.goal).toBe("latest");

    const html = await readFile(paths().html, "utf8");
    expect(embedded(html)).toEqual(model);
  });

  it("builds without printing when quiet and survives a missing sessions directory", async () => {
    await rm(paths().sessions, { recursive: true });
    await buildProject({ dir: root, io, templateHtml: TEMPLATE, quiet: true });
    expect(io.lines).toEqual([]);
    expect(embedded(await readFile(paths().html, "utf8"))).toMatchObject({
      epochs: [{ id: "e1", sessions: [] }],
      unassigned: [],
    });
  });

  it("reports a sessions path that is not a directory", async () => {
    await rm(paths().sessions, { recursive: true });
    await writeFile(paths().sessions, "not a directory");
    await expect(buildProject({ dir: root, io, templateHtml: TEMPLATE })).rejects.toThrow(
      /ENOTDIR/,
    );
  });

  it("warns about a newer project schema and rejects broken projects", async () => {
    const empty = await tempDir();
    await expect(buildProject({ dir: empty, io, templateHtml: TEMPLATE })).rejects.toThrow(
      /not initialized/,
    );
    await mkdir(join(empty, ".codelineage"));
    await writeFile(join(empty, ".codelineage", "project.json"), "{}");
    await expect(buildProject({ dir: empty, io, templateHtml: TEMPLATE })).rejects.toThrow(
      /schema version/,
    );

    await writeFile(paths().project, JSON.stringify({ schema: 2, name: "future", epochs: [] }));
    await buildProject({ dir: root, io, templateHtml: TEMPLATE });
    expect(io.warnings).toContain("schema v2 is newer than supported v1; reading best-effort");
  });

  it("rebuilds quietly after a session write with the bundled template", async () => {
    await sessionWrite({ dir: root }, io, async () =>
      JSON.stringify({ sessionId: "s1", title: "written", epoch: "e1" }),
    );
    expect(io.lines).toEqual(["Saved session s1 (0 nodes)"]);
    const html = await readFile(paths().html, "utf8");
    expect(html).toContain('<div id="root">');
    expect(embedded(html)).toMatchObject({
      epochs: [{ id: "e1", sessions: [{ sessionId: "s1", title: "written" }] }],
    });
  });

  it("turns a failed rebuild into a warning after the session is saved", async () => {
    await mkdir(paths().html);
    await sessionWrite({ dir: root }, io, async () => JSON.stringify({ sessionId: "s1" }));
    expect(io.lines).toEqual(["Saved session s1 (0 nodes)"]);
    expect(io.warnings.join("\n")).toMatch(/could not build lineage\.html/);
    expect(existsSync(paths().session("s1"))).toBe(true);
  });
});
