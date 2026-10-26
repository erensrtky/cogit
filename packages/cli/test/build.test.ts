import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it } from "vitest";
import { buildProject } from "../src/commands/build.js";
import { configSet } from "../src/commands/config.js";
import { epochAdd } from "../src/commands/epoch.js";
import { init } from "../src/commands/init.js";
import { sessionWrite } from "../src/commands/session.js";
import { cogitGitignore } from "../src/git.js";
import { messageHash } from "../src/messages.js";
import type { LineageNode, Session } from "../src/schema/session.js";
import { readConversationStore } from "../src/store/conversations.js";
import { projectPaths } from "../src/store/paths.js";
import { buildMessages, buildViewModel, embedViewModel, statusCard } from "../src/view/lineage.js";
import { DATA_ELEMENT_ID } from "../src/view/model.js";
import { envFor, type FakeIo, fakeIo, T0, tempDir } from "./helpers.js";

const run = promisify(execFile);

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

describe("buildMessages", () => {
  it("carries message detail into the view and drops empty lists", () => {
    const [m] = buildMessages([
      node("m1", "message", "M", null, {
        decidedBy: "user",
        alternatives: [{ option: "x", why: "y" }],
        commits: ["abc1234"],
        files: [],
      }),
    ]);
    expect(m).toMatchObject({ decidedBy: "user", commits: ["abc1234"], parent: null });
    expect(m?.alternatives).toHaveLength(1);
    expect(m).not.toHaveProperty("files");
  });

  it("orders messages by when the user sent them and carries the agent's work", () => {
    const t = (h: number) => `2026-10-23T${String(h).padStart(2, "0")}:00:00.000Z`;
    // Written in one go, so the add time cannot tell their order.
    const messages = buildMessages([
      node("m2", "message", "Second", "m1", { at: t(3), addedAt: t(5) }),
      node("m1", "message", "First", null, {
        at: t(2),
        addedAt: t(5),
        work: ["did a thing"],
        agentDecisions: [{ title: "Chose x", why: "simpler" }],
      }),
    ]);
    expect(messages.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(messages[0]).toMatchObject({
      parent: null,
      work: ["did a thing"],
      agentDecisions: [{ title: "Chose x", why: "simpler" }],
    });
    expect(messages[1]).toMatchObject({ parent: "m1" });
    expect(messages[1]).not.toHaveProperty("work");
  });

  it("chains an old record whose parents point at topics, and drops forward parents", () => {
    const t = (h: number) => `2026-10-23T${String(h).padStart(2, "0")}:00:00.000Z`;
    const old = buildMessages([
      node("m1", "message", "One", "topic", { at: t(1) }),
      node("m2", "message", "Two", "topic", { at: t(2) }),
      node("m3", "message", "Three", "m2", { at: t(3) }),
    ]);
    expect(old.map((m) => m.parent)).toEqual([null, "m1", "m2"]);

    const forward = buildMessages([
      node("m1", "message", "One", "m2", { at: t(1) }),
      node("m2", "message", "Two", null, { at: t(2) }),
    ]);
    expect(forward.map((m) => m.parent)).toEqual([null, null]);
  });

  it("keeps a cross-session parent for the map to resolve", () => {
    const t = (h: number) => `2026-10-23T${String(h).padStart(2, "0")}:00:00.000Z`;
    const messages = buildMessages([
      node("h1", "message", "One", null, { at: t(1) }),
      node("h2", "message", "Continues the last chat", "first:h9", { at: t(2) }),
    ]);
    expect(messages.map((m) => m.parent)).toEqual([null, "first:h9"]);
  });

  it("keeps only links to earlier messages and a branch summary where it belongs", () => {
    const t = (h: number) => `2026-10-23T${String(h).padStart(2, "0")}:00:00.000Z`;
    const branch = { title: "Thread", asked: "What?", outcome: "This.", open: "" };
    const messages = buildMessages([
      node("m1", "message", "One", null, { at: t(1), branch }),
      node("m2", "message", "Two", "m1", { at: t(2), links: ["m1", "m3"] }),
      node("m3", "message", "Three", "m2", { at: t(3) }),
    ]);
    expect(messages[0]?.branch).toEqual(branch);
    expect(messages[1]?.links).toEqual(["m1"]);
    expect(messages[2]).not.toHaveProperty("branch");
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

  it("appends unrecorded messages to the end of the chain", () => {
    const model = buildViewModel({
      project: { schema: 1, name: "p", epochs: [] },
      sessions: [
        session({
          sessionId: "s",
          nodes: [
            node("m1", "message", "Recorded message", null, {
              at: "2026-10-21T10:00:00.000Z",
            }),
          ],
        }),
      ],
      path: "/tmp/p",
      generatedAt: T0,
      pending: new Map([
        [
          "s",
          [
            { id: "m2", at: "2026-10-21T10:02:00.000Z", title: "Second message" },
            { id: "m3", at: "2026-10-21T10:03:00.000Z", title: "Third message" },
          ],
        ],
      ]),
    });
    const messages = model.unassigned[0]?.messages ?? [];
    expect(messages.map((message) => message.title)).toEqual([
      "Recorded message",
      "Second message",
      "Third message",
    ]);
    expect(messages.map((message) => message.parent)).toEqual([null, "m1", "m2"]);
    expect(messages[2]).toEqual({
      id: "m3",
      label: "m3",
      kind: "message",
      title: "Third message",
      at: "2026-10-21T10:03:00.000Z",
      unsummarized: true,
      parent: "m2",
    });
  });

  it("turns a cross-session parent into a continues mark and a root", () => {
    const model = buildViewModel({
      project: { schema: 1, name: "p", epochs: [] },
      sessions: [
        session({
          sessionId: "first",
          title: "Earlier chat",
          startedAt: "2026-10-21T09:00:00.000Z",
          nodes: [node("h1", "message", "Ask for the prompt", null, { at: T0 })],
        }),
        session({
          sessionId: "second",
          title: "Next chat",
          startedAt: "2026-10-21T10:00:00.000Z",
          nodes: [node("h2", "message", "Continue", "first:h1", { at: T0 })],
        }),
      ],
      path: "/tmp/p",
      generatedAt: T0,
    });
    const second = model.unassigned.find((s) => s.sessionId === "second");
    expect(second?.messages[0]).toMatchObject({
      parent: null,
      continues: { sessionId: "first", sessionTitle: "Earlier chat", id: "h1", label: "m1" },
    });
    // The other session is untouched: its own message stays a root.
    expect(model.unassigned[0]?.messages[0]?.continues).toBeUndefined();
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

  it("takes last activity from the newest message, not an edited record's updatedAt", () => {
    const sessions = [
      // The old record was edited after this session ran; its messages are old.
      session({
        sessionId: "edited-old",
        updatedAt: "2026-10-21T00:00:00.000Z",
        nodes: [node("h1", "message", "Old", null, { at: "2026-09-01T00:00:00.000Z" })],
      }),
      session({
        sessionId: "current",
        updatedAt: "2026-10-19T00:00:00.000Z",
        nodes: [node("h1", "message", "New", null, { at: "2026-10-20T00:00:00.000Z" })],
      }),
    ];
    expect(statusCard(sessions, NOW).lastActivity).toBe("2026-10-20T00:00:00.000Z");
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

describe("cogit build", () => {
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
          node("m1", "message", "A", null, {
            at: "2026-01-02T01:00:00.000Z",
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
    expect(model.epochs[0]?.sessions[1]?.messages[0]?.summary).toBe("token [REDACTED]");
    expect(model.status.goal).toBe("latest");

    const html = await readFile(paths().html, "utf8");
    expect(embedded(html)).toEqual(model);
  });

  it("builds the file history from message files and the files of their commits", async () => {
    await run("git", ["-C", root, "init", "-q"]);
    await run("git", ["-C", root, "config", "user.email", "t@example.com"]);
    await run("git", ["-C", root, "config", "user.name", "T"]);
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "a.ts"), "export const a = 1;\n");
    await run("git", ["-C", root, "add", "src/a.ts"]);
    await run("git", ["-C", root, "commit", "-q", "-m", "feat: add a"]);
    const short = (await run("git", ["-C", root, "rev-parse", "--short", "HEAD"])).stdout.trim();

    await saveSession(
      "s1",
      session({
        sessionId: "s1",
        title: "one",
        epoch: "e1",
        startedAt: "2026-01-02T00:00:00.000Z",
        nodes: [
          node("h1", "message", "Write a", null, {
            at: "2026-01-02T01:00:00.000Z",
            commits: [short],
          }),
          node("h2", "message", "Note it", "h1", {
            at: "2026-01-02T02:00:00.000Z",
            files: ["notes.md"],
          }),
        ],
      }),
    );

    const model = await buildProject({ dir: root, io, templateHtml: TEMPLATE, quiet: true });

    expect(model.files?.map((file) => [file.path, file.count])).toEqual([
      ["notes.md", 1],
      ["src/a.ts", 1],
    ]);
    expect(model.files?.[1]?.hits[0]).toMatchObject({
      sessionId: "s1",
      messageId: "h1",
      label: "m1",
      commits: [short],
    });
    expect((embedded(await readFile(paths().html, "utf8")) as { files?: unknown }).files).toEqual(
      model.files,
    );
  });

  it("embeds the current settings in the map for the file:// modal", async () => {
    await configSet("messageSummaries", "true", io);
    const model = await buildProject({ dir: root, io, templateHtml: TEMPLATE, quiet: true });
    expect(model.settings).toMatchObject({
      messageSummaries: true,
      startupContext: true,
      updateEveryTurns: 5,
      shareConversations: false,
      recordCommit: "ask",
      gitPolicy: "commit",
      agents: ["claude-code"],
    });
    expect(embedded(await readFile(paths().html, "utf8"))).toEqual(model);
  });

  it("puts the conversation of message sessions into the map, never into the record", async () => {
    const folder = join(dir, "claude", "projects", "-proj");
    await mkdir(folder, { recursive: true });
    const lines = [
      {
        type: "user",
        timestamp: T0,
        message: { content: "Fix the card <system-reminder>x</system-reminder>" },
      },
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Done, key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123" },
            { type: "tool_use", name: "Edit", input: { file_path: join(root, "src/a.ts") } },
          ],
        },
      },
    ];
    const transcript = lines.map((line) => JSON.stringify(line)).join("\n");
    await writeFile(join(folder, "s1.jsonl"), transcript);
    await writeFile(join(folder, "s2.jsonl"), transcript);
    await saveSession(
      "s1",
      session({ sessionId: "s1", epoch: "e1", nodes: [node("m1", "message", "Fix it")] }),
    );
    await saveSession(
      "s2",
      session({ sessionId: "s2", epoch: "e1", nodes: [node("a", "step", "Old record")] }),
    );

    const model = await buildProject({ dir: root, io, templateHtml: TEMPLATE, quiet: true });
    const [s1, s2] = model.epochs[0]?.sessions ?? [];
    const raw = "Fix the card <system-reminder>x</system-reminder>";
    const turn = {
      id: messageHash("s1", { at: T0, text: raw }),
      label: "m1",
      at: T0,
      text: "Fix the card",
      replies: ["Done, key [REDACTED]"],
      tools: { commands: 0, files: ["src/a.ts"], other: 0 },
    };
    expect(s1?.chat).toEqual([turn]);
    // s2 records no message, so its unrecorded turn is shown as a pending card
    // and needs the same conversation for its drill-down.
    expect(s2?.chat).toEqual([{ ...turn, id: messageHash("s2", { at: T0, text: raw }) }]);
    expect(s2?.messages.at(-1)).toMatchObject({
      id: messageHash("s2", { at: T0, text: raw }),
      kind: "message",
      title: "Fix the card",
      unsummarized: true,
    });
    expect(await readFile(paths().session("s1"), "utf8")).not.toContain("Fix the card");
  });

  it("reads commit subjects from git for the map and greys a hash git no longer has", async () => {
    const git = (...args: string[]) => run("git", ["-C", root, ...args]);
    await git("init", "-q");
    await git("config", "user.email", "t@example.com");
    await git("config", "user.name", "T");
    await writeFile(join(root, "a.txt"), "one\n");
    await git("add", "a.txt");
    await git("commit", "-q", "-m", "feat: first commit");
    const short = (await git("rev-parse", "--short", "HEAD")).stdout.trim();
    await saveSession(
      "s1",
      session({
        sessionId: "s1",
        epoch: "e1",
        nodes: [node("m1", "message", "Ship it", null, { commits: [short] })],
      }),
    );

    const first = await buildProject({ dir: root, io, templateHtml: TEMPLATE, quiet: true });
    expect(first.epochs[0]?.sessions[0]?.messages[0]?.commitTags).toEqual([
      { hash: short, subject: "feat: first commit" },
    ]);

    // One hash git does not know makes the batched lookup fail; the per-hash
    // fallback still keeps the commit it can read.
    await saveSession(
      "s1",
      session({
        sessionId: "s1",
        epoch: "e1",
        nodes: [node("m1", "message", "Ship it", null, { commits: [short, "0000000"] })],
      }),
    );
    const second = await buildProject({ dir: root, io, templateHtml: TEMPLATE, quiet: true });
    expect(second.epochs[0]?.sessions[0]?.messages[0]?.commitTags).toEqual([
      { hash: short, subject: "feat: first commit" },
      { hash: "0000000" },
    ]);
  });

  it("keeps the conversation in the project and shows it after the transcript is gone", async () => {
    const folder = join(dir, "claude", "projects", "-proj");
    await mkdir(folder, { recursive: true });
    const userLine = (uuid: string, text: string, at: string) => ({
      type: "user",
      uuid,
      parentUuid: null,
      timestamp: at,
      message: { content: text },
    });
    const reply = (uuid: string, parent: string, text: string) => ({
      type: "assistant",
      uuid,
      parentUuid: parent,
      message: { content: [{ type: "text", text }] },
    });
    const lines = [
      userLine("u1", "First", T0),
      reply("a1", "u1", "Answer one"),
      userLine("u2", "Second", "2026-10-21T11:00:00.000Z"),
      reply("a2", "u2", "Answer two"),
    ];
    const transcript = join(folder, "s1.jsonl");
    await writeFile(transcript, lines.map((line) => JSON.stringify(line)).join("\n"));
    await saveSession(
      "s1",
      session({ sessionId: "s1", epoch: "e1", nodes: [node("m1", "message", "First")] }),
    );

    const hash = (uuid: string, at: string, text: string) => messageHash("s1", { uuid, at, text });
    const hashes = [
      hash("u1", T0, "First"),
      hash("u2", "2026-10-21T11:00:00.000Z", "Second"),
      hash("u3", T0, "Third"),
    ];
    const first = await buildProject({ dir: root, io, templateHtml: TEMPLATE, quiet: true });
    expect(first.epochs[0]?.sessions[0]?.chat?.map((t) => t.id)).toEqual(hashes.slice(0, 2));
    expect((await readConversationStore(root, "s1")).map((t) => [t.uuid, t.text])).toEqual([
      ["u1", "First"],
      ["u2", "Second"],
    ]);

    // A later turn is appended to the store, not to a rewritten file.
    await appendFile(transcript, `\n${JSON.stringify(userLine("u3", "Third", T0))}`);
    const second = await buildProject({ dir: root, io, templateHtml: TEMPLATE, quiet: true });
    expect(second.epochs[0]?.sessions[0]?.chat?.map((t) => t.text)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
    expect((await readConversationStore(root, "s1")).map((t) => t.uuid)).toEqual([
      "u1",
      "u2",
      "u3",
    ]);

    // Claude Code deletes the transcript; the store still feeds the drill-down.
    await rm(transcript);
    const third = await buildProject({ dir: root, io, templateHtml: TEMPLATE, quiet: true });
    expect(third.epochs[0]?.sessions[0]).toMatchObject({
      transcriptAvailable: false,
      chat: [
        { id: hashes[0], text: "First", replies: ["Answer one"] },
        { id: hashes[1], text: "Second", replies: ["Answer two"] },
        { id: hashes[2], text: "Third", replies: [] },
      ],
    });

    // An unreadable transcript falls back to the store instead of a lost chat.
    await mkdir(transcript);
    const fourth = await buildProject({ dir: root, io, templateHtml: TEMPLATE, quiet: true });
    expect(fourth.epochs[0]?.sessions[0]?.chat?.map((t) => t.text)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
    expect(io.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/^could not read the conversation of s1: /)]),
    );
  });

  it("gives turns stored before stable ids their hash, so ids survive the transcript", async () => {
    const folder = join(dir, "claude", "projects", "-proj");
    await mkdir(folder, { recursive: true });
    const transcript = join(folder, "s1.jsonl");
    await writeFile(
      transcript,
      JSON.stringify({
        type: "user",
        uuid: "u1",
        timestamp: T0,
        message: { content: "First" },
      }),
    );
    // A turn stored by 8.4, before the store kept ids.
    const stored = {
      uuid: "u1",
      at: T0,
      text: "First",
      replies: [],
      tools: { commands: 0, files: [], other: 0 },
    };
    await mkdir(paths().conversations, { recursive: true });
    await writeFile(
      paths().conversation("s1"),
      gzipSync(Buffer.from(`${JSON.stringify(stored)}\n`)),
    );
    await saveSession(
      "s1",
      session({ sessionId: "s1", epoch: "e1", nodes: [node("m1", "message", "First")] }),
    );
    const id = messageHash("s1", { uuid: "u1", at: T0, text: "First" });

    const first = await buildProject({ dir: root, io, templateHtml: TEMPLATE, quiet: true });
    expect(first.epochs[0]?.sessions[0]?.messages[0]?.id).toBe(id);
    expect((await readConversationStore(root, "s1"))[0]?.hash).toBe(id);

    // The transcript goes; the stored hash keeps the same id and the record matches.
    await rm(transcript);
    const second = await buildProject({ dir: root, io, templateHtml: TEMPLATE, quiet: true });
    expect(second.epochs[0]?.sessions[0]?.messages.map((m) => m.id)).toEqual([id]);
    expect(second.epochs[0]?.sessions[0]?.messages[0]?.unsummarized).toBeUndefined();
  });

  it("writes the project ignore rules once, also in an existing project", async () => {
    const ignore = join(paths().base, ".gitignore");
    // A commit-policy project: a git dir and no root rule hiding .cogit/.
    await mkdir(join(root, ".git"));
    await rm(ignore, { force: true });
    await buildProject({ dir: root, io, templateHtml: TEMPLATE, quiet: true });
    expect(await readFile(ignore, "utf8")).toBe(cogitGitignore(false));
    await buildProject({ dir: root, io, templateHtml: TEMPLATE, quiet: true });
    expect(await readFile(ignore, "utf8")).toBe(cogitGitignore(false));
  });

  it("keeps the map when the conversation store cannot be written", async () => {
    const folder = join(dir, "claude", "projects", "-proj");
    await mkdir(folder, { recursive: true });
    await writeFile(
      join(folder, "s1.jsonl"),
      JSON.stringify({
        type: "user",
        uuid: "u1",
        timestamp: T0,
        message: { content: "Hi" },
      }),
    );
    await saveSession(
      "s1",
      session({ sessionId: "s1", epoch: "e1", nodes: [node("m1", "message", "Hi")] }),
    );
    // A file where the store's directory belongs makes the append fail.
    await writeFile(paths().conversations, "not a directory");

    const model = await buildProject({ dir: root, io, templateHtml: TEMPLATE, quiet: true });
    expect(model.epochs[0]?.sessions[0]?.chat?.[0]?.text).toBe("Hi");
    expect(io.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/^could not store the conversation of s1: /)]),
    );
  });

  it("warns but still builds when the inner gitignore cannot be written", async () => {
    const ignore = join(paths().base, ".gitignore");
    await mkdir(join(root, ".git"));
    await rm(ignore, { force: true });
    await mkdir(ignore);
    const model = await buildProject({ dir: root, io, templateHtml: TEMPLATE, quiet: true });
    expect(model.epochs[0]?.id).toBe("e1");
    expect(io.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/^could not update \.cogit\/\.gitignore: /)]),
    );
  });

  it("shows unrecorded messages as pending cards until the skill writes them", async () => {
    const folder = join(dir, "claude", "projects", "-proj");
    await mkdir(folder, { recursive: true });
    const lines = [
      { type: "user", timestamp: T0, message: { content: "First message" } },
      {
        type: "user",
        timestamp: "2026-10-21T10:05:00.000Z",
        message: {
          content: "Second message, with the card <system-reminder>noise</system-reminder>",
        },
      },
    ];
    await writeFile(join(folder, "s1.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n"));
    await saveSession(
      "s1",
      session({
        sessionId: "s1",
        epoch: "e1",
        nodes: [
          node("topic", "phase", "Topic"),
          node("m1", "message", "First", "topic", { at: T0 }),
        ],
      }),
    );

    const before = await buildProject({ dir: root, io, templateHtml: TEMPLATE, quiet: true });
    const messages = before.epochs[0]?.sessions[0]?.messages ?? [];
    expect(messages.map((message) => message.title)).toEqual([
      "First",
      "Second message, with the card",
    ]);
    expect(messages[1]).toMatchObject({
      id: messageHash("s1", {
        at: "2026-10-21T10:05:00.000Z",
        text: "Second message, with the card <system-reminder>noise</system-reminder>",
      }),
      label: "m2",
      kind: "message",
      title: "Second message, with the card",
      at: "2026-10-21T10:05:00.000Z",
      unsummarized: true,
      parent: messageHash("s1", { at: T0, text: "First message" }),
    });

    await sessionWrite({ dir: root }, io, async () =>
      JSON.stringify({
        sessionId: "s1",
        nodes: [{ id: "m2", kind: "message", title: "Second message", parent: "topic" }],
      }),
    );
    // A message no longer hangs from a topic: the parent falls back to the
    // previous message, with a warning (8.1).
    expect(io.warnings).toEqual([
      expect.stringMatching(/m2: parent topic is not an earlier message of this session, using m1/),
    ]);
    const after = await buildProject({ dir: root, io, templateHtml: TEMPLATE, quiet: true });
    expect(after.epochs[0]?.sessions[0]?.messages.map((message) => message.title)).toEqual([
      "First",
      "Second message",
    ]);
  });

  it("counts unrecorded messages only while the catch-up is off", async () => {
    const folder = join(dir, "claude", "projects", "-proj");
    await mkdir(folder, { recursive: true });
    const lines = [
      { type: "user", timestamp: T0, message: { content: "one" } },
      { type: "user", timestamp: "2026-01-02T00:00:00.000Z", message: { content: "two" } },
    ];
    await writeFile(join(folder, "s1.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n"));
    await saveSession(
      "s1",
      session({
        sessionId: "s1",
        epoch: "e1",
        nodes: [node("m1", "message", "One", null, { at: T0 })],
      }),
    );
    // A session with no transcript must not break the count.
    await saveSession("s2", session({ sessionId: "s2", epoch: "e1" }));

    const on = await buildProject({ dir: root, io, templateHtml: TEMPLATE, quiet: true });
    const recorded = (model: typeof on) =>
      model.epochs[0]?.sessions.find((s) => s.sessionId === "s1");
    expect(recorded(on)).not.toHaveProperty("unrecordedMessages");

    await configSet("sessionEndCatchUp", "false", fakeIo(envFor(dir)));
    const off = await buildProject({ dir: root, io, templateHtml: TEMPLATE, quiet: true });
    expect(recorded(off)?.unrecordedMessages).toBe(1);
    expect(off.epochs[0]?.sessions.find((s) => s.sessionId === "s2")).not.toHaveProperty(
      "unrecordedMessages",
    );
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
    await mkdir(join(empty, ".cogit"));
    await writeFile(join(empty, ".cogit", "project.json"), "{}");
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
    expect(io.warnings.join("\n")).toMatch(/could not build map\.html/);
    expect(existsSync(paths().session("s1"))).toBe(true);
  });
});
