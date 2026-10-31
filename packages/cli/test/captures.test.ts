import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildProject } from "../src/commands/build.js";
import { captures, formatCaptures } from "../src/commands/captures.js";
import { init } from "../src/commands/init.js";
import { createProgram } from "../src/program.js";
import type { Session } from "../src/schema/session.js";
import { projectPaths } from "../src/store/paths.js";
import { buildCaptures, type CaptureSourceSession } from "../src/view/captures.js";
import { DATA_ELEMENT_ID } from "../src/view/model.js";
import { envFor, type FakeIo, fakeIo, T0, tempDir } from "./helpers.js";

const TEMPLATE = `<!doctype html><html><body><div id="root"></div>
    <script id="${DATA_ELEMENT_ID}" type="application/json"></script></body></html>`;

const branch = (open: string) => ({ title: "Parser", asked: "build it", outcome: "built", open });

function source(over: Partial<CaptureSourceSession> & { sessionId: string }): CaptureSourceSession {
  return {
    title: "",
    updatedAt: T0,
    status: { pending: [] },
    messages: [],
    ...over,
  };
}

describe("buildCaptures", () => {
  it("is empty for a project with no sessions or nothing open", () => {
    expect(buildCaptures([])).toEqual([]);
    expect(buildCaptures([source({ sessionId: "s1" })])).toEqual([]);
  });

  it("takes pending items and branch open lines, dropping blanks and in-source repeats", () => {
    const rows = buildCaptures([
      source({
        sessionId: "s1",
        title: "Ship it",
        author: "Ada",
        authorEmail: "ada@example.com",
        status: {
          pending: [
            { text: "write the docs", needsUser: false },
            { text: "   ", needsUser: true },
            { text: "write the docs ", needsUser: false },
          ],
        },
        messages: [
          { id: "h1", label: "m1", branch: branch("handle empty input") },
          { id: "h2", label: "m2", branch: branch("  ") },
          { id: "h3", label: "m3" },
          { id: "h4", label: "m4", unsummarized: true },
        ],
      }),
    ]);
    expect(rows).toEqual([
      {
        key: "s1#p0",
        text: "write the docs",
        source: "pending",
        sessionId: "s1",
        sessionTitle: "Ship it",
        author: "Ada",
        updatedAt: T0,
        // The newest recorded message, not the unsummarized tail.
        messageId: "h3",
        label: "m3",
        needsUser: false,
      },
      {
        key: "s1#h1",
        text: "handle empty input",
        source: "branch",
        sessionId: "s1",
        sessionTitle: "Ship it",
        author: "Ada",
        updatedAt: T0,
        messageId: "h1",
        label: "m1",
        branch: "Parser",
        needsUser: false,
      },
    ]);
  });

  it("puts needsUser first, then the newest session, and keeps one row per source", () => {
    const rows = buildCaptures([
      source({
        sessionId: "old",
        updatedAt: "2026-10-01T00:00:00.000Z",
        status: { pending: [{ text: "pick a name", needsUser: true }] },
      }),
      source({
        sessionId: "a",
        updatedAt: "2026-10-10T00:00:00.000Z",
        status: { pending: [{ text: "same text", needsUser: false }] },
      }),
      source({
        sessionId: "b",
        updatedAt: "2026-10-20T00:00:00.000Z",
        status: { pending: [{ text: "same text", needsUser: false }] },
      }),
    ]);
    expect(rows.map((row) => row.key)).toEqual(["old#p0", "b#p0", "a#p0"]);
    // A session without a title falls back to its id; no message means no link.
    expect(rows[0]?.sessionTitle).toBe("old");
    expect(rows[0]?.messageId).toBeUndefined();
  });
});

describe("formatCaptures", () => {
  it("says so plainly when there is nothing", () => {
    expect(formatCaptures([], T0)).toEqual(["No captured work in this project."]);
  });
});

describe("cogit captures", () => {
  let dir: string;
  let root: string;
  let io: FakeIo;

  function session(over: Partial<Session> & { sessionId: string }): Session {
    return {
      schema: 1,
      agent: "claude-code",
      title: "",
      startedAt: T0,
      updatedAt: T0,
      status: { goal: "", done: [], pending: [], next: "" },
      nodes: [],
      ...over,
    };
  }

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
    io = fakeIo(envFor(dir));
    await init(root, { name: "proj", retention: "keep", language: "auto" }, fakeIo(envFor(dir)));
    const s1 = session({
      sessionId: "s1",
      title: "Parser",
      author: "Ada",
      updatedAt: "2026-10-21T08:00:00.000Z",
      status: {
        goal: "",
        done: [],
        pending: [{ text: "decide the error format", needsUser: true }],
        next: "",
      },
      nodes: [
        {
          id: "h111111111111",
          parent: null,
          kind: "message",
          title: "Build the parser",
          at: "2026-10-21T07:00:00.000Z",
          branch: branch("unicode input untested"),
        },
      ],
    });
    const s2 = session({
      sessionId: "s2",
      title: "Docs",
      updatedAt: "2026-10-21T09:00:00.000Z",
      status: {
        goal: "",
        done: [],
        pending: [{ text: "decide the error format", needsUser: false }],
        next: "",
      },
    });
    await writeFile(projectPaths(root).session("s1"), JSON.stringify(s1));
    await writeFile(projectPaths(root).session("s2"), JSON.stringify(s2));
  });

  it("prints one line per row with source, author and age", async () => {
    const rows = await captures({ dir: root, io, now: T0 });
    // The same text in two sessions stays two rows.
    expect(rows.map((row) => row.key)).toEqual(["s1#p0", "s2#p0", "s1#h111111111111"]);
    expect(io.lines).toEqual([
      "! decide the error format  (s1 m1 · Ada · 2 h ago)",
      "  decide the error format  (s2 · 1 h ago)",
      "  unicode input untested  (s1 m1 · Ada · 2 h ago)",
      "! = waiting for you",
    ]);
  });

  it("prints JSON and limits to one session", async () => {
    await captures({ dir: root, io, json: true, session: "s2" });
    const rows = JSON.parse(io.lines.join("\n"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sessionId: "s2", text: "decide the error format" });
  });

  it("runs through the command line", async () => {
    const program = createProgram(() => io, {
      launch: async () => true,
      server: async () => null,
      stdin: async () => "",
    });
    await program.parseAsync(["captures", root, "--session", "s2", "--json"], { from: "user" });
    expect(JSON.parse(io.lines.join("\n"))).toHaveLength(1);
  });

  it("is carried in the map's page model", async () => {
    const model = await buildProject({ dir: root, io, templateHtml: TEMPLATE, quiet: true });
    expect(model.captures?.map((row) => row.key)).toEqual(["s1#p0", "s2#p0", "s1#h111111111111"]);
  });
});
