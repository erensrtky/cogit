import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { readLastTurn } from "../src/agents/claude/transcripts.js";
import { buildProject } from "../src/commands/build.js";
import { configSet } from "../src/commands/config.js";
import { init } from "../src/commands/init.js";
import { dismissInboxSession, readInboxDismissed } from "../src/store/inbox-state.js";
import { globalPaths, projectPaths } from "../src/store/paths.js";
import { loadAllSessions } from "../src/store/stores.js";
import {
  clipMessage,
  dismissKey,
  INBOX_MESSAGE_LIMIT,
  type InboxCandidate,
  inboxRows,
  stripMarkdown,
  timeSince,
} from "../src/view/inbox.js";
import { DATA_ELEMENT_ID, type PanelViewModel } from "../src/view/model.js";
import {
  buildPanel,
  collectInboxForProject,
  collectPanelProjects,
  collectRegistryData,
  collectRegistryProjects,
  lastDecisionOf,
} from "../src/view/panel.js";
import { envFor, fakeIo, T0, tempDir } from "./helpers.js";

const TEMPLATE = `<!doctype html><html><head><title>cogit — lineage</title></head><body>
    <div id="root"></div>
    <script id="${DATA_ELEMENT_ID}" type="application/json"></script></body></html>`;

const DATA_PREFIX = `<script id="${DATA_ELEMENT_ID}" type="application/json">`;

function embedded(html: string): unknown {
  const start = html.indexOf(DATA_PREFIX);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = html.indexOf("</script>", start);
  return JSON.parse(html.slice(start + DATA_PREFIX.length, end));
}

const at = (minute: number) => `2026-10-21T10:${String(minute).padStart(2, "0")}:00.000Z`;

function userLine(text: string, stamp = at(0)) {
  return { type: "user", timestamp: stamp, message: { role: "user", content: text } };
}

function agentLine(text: string, stamp = at(1), extra: Record<string, unknown> = {}) {
  return {
    type: "assistant",
    timestamp: stamp,
    message: { content: [{ type: "text", text }] },
    ...extra,
  };
}

async function transcriptFile(env: NodeJS.ProcessEnv, sessionId: string): Promise<string> {
  const folder = join(env.CLAUDE_CONFIG_DIR as string, "projects", "-proj");
  await mkdir(folder, { recursive: true });
  return join(folder, `${sessionId}.jsonl`);
}

async function writeTranscript(
  env: NodeJS.ProcessEnv,
  sessionId: string,
  lines: unknown[],
): Promise<string> {
  const file = await transcriptFile(env, sessionId);
  // Strings are written as they are, so a test can hand over a broken line.
  await writeFile(
    file,
    lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line))).join("\n"),
  );
  return file;
}

async function initProject(root: string, env: NodeJS.ProcessEnv): Promise<void> {
  await mkdir(root, { recursive: true });
  await init(root, { retention: "keep", language: "auto" }, fakeIo(env));
}

interface SessionInput {
  sessionId: string;
  at?: string;
  goal?: string;
  pending?: { text: string; needsUser: boolean }[];
  nodes?: Record<string, unknown>[];
}

async function writeSession(root: string, input: SessionInput): Promise<void> {
  await writeFile(
    projectPaths(root).session(input.sessionId),
    JSON.stringify({
      schema: 1,
      sessionId: input.sessionId,
      startedAt: input.at ?? T0,
      updatedAt: input.at ?? T0,
      status: {
        goal: input.goal ?? "",
        done: [],
        pending: input.pending ?? [],
        next: "",
      },
      nodes: input.nodes ?? [],
    }),
  );
}

let dir: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  dir = await tempDir();
  env = envFor(dir);
});

describe("readLastTurn", () => {
  it("says the agent spoke last when its reply follows the user's message", async () => {
    const file = await writeTranscript(env, "s1", [
      userLine("Fix it"),
      agentLine("Done — the card uses the new key."),
    ]);
    expect(await readLastTurn(file)).toEqual({
      speaker: "agent",
      at: at(1),
      text: "Done — the card uses the new key.",
    });
  });

  it("says the user spoke last when no reply came after the message", async () => {
    const file = await writeTranscript(env, "s1", [userLine("Fix it")]);
    expect(await readLastTurn(file)).toEqual({ speaker: "user", at: at(0), text: "" });
  });

  it("starts a new turn at the newest user message", async () => {
    const file = await writeTranscript(env, "s1", [
      userLine("First", at(0)),
      agentLine("Answer", at(1)),
      userLine("Second", at(2)),
    ]);
    expect(await readLastTurn(file)).toEqual({ speaker: "user", at: at(2), text: "" });
  });

  it("ignores tool results, sidechains and lines that are not messages", async () => {
    const file = await writeTranscript(env, "s1", [
      { type: "system", subtype: "init" },
      '{"type":"user":',
      { type: "user", message: { content: "no stamp" } },
      userLine("Fix it", at(0)),
      { type: "user", timestamp: at(1), message: { content: [{ type: "tool_result" }] } },
      agentLine("Answer", at(2), { isSidechain: true }),
      agentLine("Real answer", at(3)),
      { type: "assistant", timestamp: at(4), message: { content: "plain" } },
      { type: "assistant", timestamp: at(5), message: { content: [{ type: "tool_use" }] } },
      { type: "assistant", message: { content: [{ type: "text", text: "no stamp" }] } },
    ]);
    expect(await readLastTurn(file)).toEqual({
      speaker: "agent",
      at: at(3),
      text: "Real answer",
    });
  });

  it("returns null for an empty transcript and for one with no user message", async () => {
    const empty = await writeTranscript(env, "s1", []);
    expect(await readLastTurn(empty)).toBeNull();
    const noUser = await writeTranscript(env, "s2", [agentLine("hello")]);
    expect(await readLastTurn(noUser)).toBeNull();
  });

  it("walks back past a long final turn to find the user message", async () => {
    const long = "x".repeat(300_000);
    const file = await writeTranscript(env, "s1", [
      userLine("Fix it", at(0)),
      agentLine(long, at(1)),
    ]);
    const last = await readLastTurn(file);
    expect(last?.speaker).toBe("agent");
    expect(last?.at).toBe(at(1));
    expect(last?.text).toHaveLength(long.length);
  });
});

function candidate(overrides: Partial<InboxCandidate> = {}): InboxCandidate {
  return {
    projectName: "proj",
    projectPath: "/tmp/proj",
    mapUrl: "file:///tmp/proj/.cogit/map.html",
    sessionId: "s1",
    sessionTitle: "Fix the card",
    turn: { at: at(30), text: "Ready for review." },
    lastActivity: at(29),
    needsUser: [],
    goal: "Ship the card",
    lastDecision: "",
    pending: [],
    messageId: "m1",
    transcriptAvailable: true,
    ...overrides,
  };
}

describe("inboxRows", () => {
  const now = "2026-10-21T12:00:00.000Z";

  it("keeps the two signals apart and orders rows oldest first", async () => {
    const rows = inboxRows(
      [
        candidate({
          projectName: "b",
          projectPath: "/b",
          sessionId: "s2",
          turn: null,
          lastActivity: at(5),
          needsUser: ["answer"],
        }),
        candidate({
          projectName: "a",
          projectPath: "/a",
          sessionId: "s1",
          turn: { at: at(10), text: "hi" },
        }),
        candidate({ projectName: "c", projectPath: "/c", sessionId: "s3", needsUser: ["decide"] }),
      ],
      new Map(),
      now,
      7,
    );
    expect(rows.map((row) => [row.projectName, row.sessionId, row.signal])).toEqual([
      ["b", "s2", "record"],
      ["a", "s1", "turn"],
      ["c", "s3", "both"],
    ]);
    expect(rows[0]?.lastMessage).toBeUndefined();
    expect(rows[1]?.lastMessage).toBe("hi");
  });

  it("hides a row past inboxMaxAgeDays and one with no usable time", async () => {
    const rows = inboxRows(
      [
        candidate({
          sessionId: "old",
          turn: { at: "2026-10-01T10:00:00.000Z", text: "hi" },
          lastActivity: "2026-10-01T09:00:00.000Z",
        }),
        candidate({ sessionId: "notime", turn: null, lastActivity: null }),
        candidate({ sessionId: "bad", turn: null, lastActivity: "not a time" }),
      ],
      new Map(),
      "2026-10-25T12:00:00.000Z",
      7,
    );
    expect(rows).toEqual([]);
  });

  it("hides a dismissed turn and brings the row back on a newer turn", async () => {
    const key = dismissKey("/tmp/proj", "s1");
    const dismissed = new Map([[key, at(30)]]);
    expect(inboxRows([candidate()], dismissed, now, 7)).toEqual([]);
    const newer = candidate({ turn: { at: at(45), text: "Moved on." }, lastActivity: at(44) });
    expect(inboxRows([newer], dismissed, now, 7)).toHaveLength(1);
    // An unparseable stored time must not hide work.
    expect(inboxRows([candidate()], new Map([[key, "nope"]]), now, 7)).toHaveLength(1);
  });

  it("does not apply an age filter when now is unparseable, and breaks ties by name, path and id", async () => {
    const rows = inboxRows(
      [
        candidate({ projectName: "b", projectPath: "/b", sessionId: "s2" }),
        candidate({ projectName: "a", projectPath: "/z", sessionId: "s9" }),
        candidate({ projectName: "a", projectPath: "/a", sessionId: "s8" }),
        candidate({ projectName: "a", projectPath: "/a", sessionId: "s7" }),
      ],
      new Map(),
      "not a time",
      7,
    );
    expect(rows.map((row) => row.sessionId)).toEqual(["s7", "s8", "s9", "s2"]);
  });

  it("clips the agent's message to the limit and keeps pending items", async () => {
    const long = "y".repeat(INBOX_MESSAGE_LIMIT + 50);
    const [row] = inboxRows(
      [
        candidate({
          turn: { at: at(10), text: long },
          pending: [{ text: "decide", needsUser: true }],
        }),
      ],
      new Map(),
      now,
      7,
    );
    expect(row?.lastMessage).toHaveLength(INBOX_MESSAGE_LIMIT);
    expect(row?.lastMessage?.endsWith("…")).toBe(true);
    expect(row?.pending).toEqual([{ text: "decide", needsUser: true }]);
  });

  it("shows the agent's message as plain text, never its Markdown", async () => {
    const [row] = inboxRows(
      [candidate({ turn: { at: at(10), text: "**Done** — `npm test` is green." } })],
      new Map(),
      now,
      7,
    );
    expect(row?.lastMessage).toBe("Done — npm test is green.");
  });
});

describe("stripMarkdown", () => {
  it("strips bold, italic, code and unclosed markers", () => {
    expect(stripMarkdown("**bold** and __also bold__")).toBe("bold and also bold");
    expect(stripMarkdown("~~gone~~")).toBe("gone");
    expect(stripMarkdown("run `npm test` and ``npm run build``")).toBe(
      "run npm test and npm run build",
    );
    expect(stripMarkdown("**open and `unclosed")).toBe("open and unclosed");
    expect(stripMarkdown("**bold *and italic***")).toBe("bold and italic");
  });

  it("keeps a glob or an underscore name, which is text rather than emphasis", () => {
    expect(stripMarkdown("*.ts and snake_case stay")).toBe("*.ts and snake_case stay");
  });

  it("turns links and images into their text", () => {
    expect(stripMarkdown("see [the docs](https://example.com/a) now")).toBe("see the docs now");
    expect(stripMarkdown("![a diagram](x.png)")).toBe("a diagram");
    expect(stripMarkdown("[ref link][r] and <https://example.com>")).toBe(
      "ref link and https://example.com",
    );
  });

  it("strips headings, quote and list markers and task boxes", () => {
    expect(stripMarkdown("## Title ##")).toBe("Title");
    expect(stripMarkdown("#hashtag is not a heading")).toBe("#hashtag is not a heading");
    expect(stripMarkdown("> quoted\n> > nested")).toBe("quoted\nnested");
    expect(stripMarkdown("- one\n* two\n1. three\n2) four")).toBe("one\ntwo\nthree\nfour");
    expect(stripMarkdown("- [ ] todo\n- [x] done")).toBe("todo\ndone");
    expect(stripMarkdown("---")).toBe("");
  });

  it("keeps line breaks readable and drops fenced-code fences", () => {
    expect(stripMarkdown("first\nsecond\n\n\nafter a gap")).toBe("first\nsecond\n\nafter a gap");
    expect(stripMarkdown("before\n```ts\nconst a = 1;\n```\nafter")).toBe(
      "before\n\nconst a = 1;\n\nafter",
    );
  });

  it("never builds HTML from the message", () => {
    // The stripper returns text; the page renders it as a text node.
    expect(stripMarkdown("<b>hi</b>")).toBe("<b>hi</b>");
  });
});

describe("timeSince", () => {
  it("renders the units the inbox uses", () => {
    const now = "2026-10-21T12:00:00.000Z";
    expect(timeSince("2026-10-21T11:59:30.000Z", now)).toBe("under a minute");
    expect(timeSince("2026-10-21T11:30:00.000Z", now)).toBe("30 min");
    expect(timeSince("2026-10-21T10:00:00.000Z", now)).toBe("2 h");
    expect(timeSince("2026-10-20T11:00:00.000Z", now)).toBe("1 day");
    expect(timeSince("2026-10-18T11:00:00.000Z", now)).toBe("3 days");
    expect(timeSince("nope", now)).toBe("");
  });

  it("leaves a short message alone", () => {
    expect(clipMessage("short")).toBe("short");
  });
});

describe("collectInboxForProject", () => {
  it("reads the transcript ending, the record's signals and the record's summary", async () => {
    const root = join(dir, "alpha");
    await initProject(root, env);
    const file = await writeTranscript(env, "s1", [userLine("Fix it"), agentLine("Ready.")]);
    await writeSession(root, {
      sessionId: "s1",
      goal: "Ship the card",
      pending: Array.from({ length: 6 }, (_, index) => ({
        text: `item ${index}`,
        needsUser: index === 0,
      })),
      nodes: [
        {
          id: "m1",
          kind: "message",
          title: "Fix it",
          at: at(0),
          agentDecisions: [{ title: "Use the cache", why: "cheaper" }],
        },
        { id: "d1", kind: "decision", title: "Keep the API" },
      ],
    });
    const transcripts = new Map([["s1", file]]);
    const config = { inboxMaxAgeDays: 7, bigChangeLines: 300 } as never;
    const rows = await collectInboxForProject(
      { name: "alpha", path: root },
      await loadSessions(root),
      transcripts,
      config,
      T0,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sessionId: "s1",
      signal: "both",
      goal: "Ship the card",
      lastDecision: "Keep the API",
      messageId: "m1",
      transcriptAvailable: true,
      lastMessage: "Ready.",
    });
    expect(rows[0]?.pending).toHaveLength(5);
  });

  it("skips an old session before reading its transcript and treats a broken one as silence", async () => {
    const root = join(dir, "alpha");
    await initProject(root, env);
    await writeSession(root, { sessionId: "old", at: "2026-09-01T10:00:00.000Z" });
    await writeSession(root, {
      sessionId: "broken",
      pending: [{ text: "decide", needsUser: true }],
    });
    const transcripts = new Map([["broken", root]]);
    const config = { inboxMaxAgeDays: 7, bigChangeLines: 300 } as never;
    const rows = await collectInboxForProject(
      { name: "alpha", path: root },
      await loadSessions(root),
      transcripts,
      config,
      T0,
    );
    expect(rows.map((row) => row.sessionId)).toEqual(["broken"]);
    expect(rows[0]?.transcriptAvailable).toBe(true);
  });

  it("does not filter by age when the given now is unparseable, and keeps a timeless record out", async () => {
    const root = join(dir, "alpha");
    await initProject(root, env);
    const config = { inboxMaxAgeDays: 7, bigChangeLines: 300 } as never;
    const rows = await collectInboxForProject(
      { name: "alpha", path: root },
      [
        {
          sessionId: "s1",
          title: "Timeless",
          startedAt: "x",
          updatedAt: "x",
          status: { goal: "", done: [], pending: [{ text: "decide", needsUser: true }], next: "" },
          nodes: [],
        },
      ] as never,
      new Map(),
      config,
      "not a time",
    );
    expect(rows).toEqual([]);
  });

  it("has no rows for a session with no message id, and reads lastDecision from messages", async () => {
    const root = join(dir, "alpha");
    await initProject(root, env);
    await writeSession(root, {
      sessionId: "s1",
      pending: [{ text: "decide", needsUser: true }],
      nodes: [{ id: "d1", kind: "decision", title: "One" }],
    });
    const config = { inboxMaxAgeDays: 7, bigChangeLines: 300 } as never;
    const rows = await collectInboxForProject(
      { name: "alpha", path: root },
      await loadSessions(root),
      new Map(),
      config,
      T0,
    );
    expect(rows[0]?.messageId).toBeUndefined();
    expect(rows[0]?.lastDecision).toBe("One");
    expect(rows[0]?.signal).toBe("record");
  });
});

async function loadSessions(root: string) {
  return await loadAllSessions(root, () => {});
}

describe("panel and map inbox", () => {
  async function setup(): Promise<{ alpha: string; beta: string }> {
    const alpha = join(dir, "alpha");
    const beta = join(dir, "beta");
    await initProject(alpha, env);
    await initProject(beta, env);
    await writeTranscript(env, "sa", [userLine("A", at(0)), agentLine("Ready A", at(30))]);
    await writeTranscript(env, "sb", [userLine("B", at(0)), agentLine("Ready B", at(10))]);
    await writeSession(alpha, {
      sessionId: "sa",
      at: at(30),
      nodes: [{ id: "m1", kind: "message", title: "A", at: at(0) }],
    });
    await writeSession(beta, {
      sessionId: "sb",
      at: at(10),
      nodes: [{ id: "m1", kind: "message", title: "B", at: at(0) }],
    });
    return { alpha, beta };
  }

  it("puts every project's rows, oldest first, into the panel", async () => {
    const { alpha, beta } = await setup();
    const io = fakeIo(env);
    const model = await buildPanel({ env, io, templateHtml: TEMPLATE });
    expect(model.inbox?.map((row) => [row.projectName, row.sessionId])).toEqual([
      ["beta", "sb"],
      ["alpha", "sa"],
    ]);
    const html = await readFile(globalPaths(env).panel, "utf8");
    expect((embedded(html) as PanelViewModel).inbox).toEqual(model.inbox);
    expect(model.projects.map((project) => project.path)).toEqual([alpha, beta]);
  });

  it("hides a dismissed row until a newer agent turn arrives", async () => {
    const { alpha } = await setup();
    await dismissInboxSession(alpha, "sa", at(30));
    expect((await readInboxDismissed(alpha)).get("sa")).toBe(at(30));
    let model = await buildPanel({ env, io: fakeIo(env), templateHtml: TEMPLATE });
    expect(model.inbox?.map((row) => row.sessionId)).toEqual(["sb"]);
    await writeTranscript(env, "sa", [
      userLine("A", at(0)),
      agentLine("Ready A", at(30)),
      userLine("More", at(40)),
      agentLine("Ready again", at(45)),
    ]);
    model = await buildPanel({ env, io: fakeIo(env), templateHtml: TEMPLATE });
    expect(model.inbox?.map((row) => row.sessionId)).toEqual(["sb", "sa"]);
  });

  it("honours inboxMaxAgeDays from the config, one day by default", async () => {
    const root = join(dir, "old");
    await initProject(root, env);
    // Three days before the panel's clock (T0): past the default, inside a week.
    await writeTranscript(env, "s1", [
      userLine("Old", "2026-10-18T10:00:00.000Z"),
      agentLine("Old reply", "2026-10-18T10:05:00.000Z"),
    ]);
    await writeSession(root, { sessionId: "s1", at: "2026-10-18T10:00:00.000Z" });
    let model = await buildPanel({ env, io: fakeIo(env), templateHtml: TEMPLATE });
    expect(model.inbox).toEqual([]);
    await configSet("inboxMaxAgeDays", "7", fakeIo(env));
    model = await buildPanel({ env, io: fakeIo(env), templateHtml: TEMPLATE });
    expect(model.inbox?.map((row) => row.sessionId)).toEqual(["s1"]);
  });

  it("keeps another project's rows off the map", async () => {
    const { alpha } = await setup();
    const model = await buildProject({
      dir: alpha,
      io: fakeIo(env),
      templateHtml: TEMPLATE,
      quiet: true,
    });
    expect(model.inbox?.map((row) => row.sessionId)).toEqual(["sa"]);
    const html = await readFile(projectPaths(alpha).html, "utf8");
    expect((embedded(html) as { inbox: unknown }).inbox).toEqual(model.inbox);
  });

  it("collects the map's own rows when the project is not registered", async () => {
    const { alpha } = await setup();
    await writeFile(globalPaths(env).registry, JSON.stringify({ schema: 1, projects: [] }));
    const model = await buildProject({
      dir: alpha,
      io: fakeIo(env),
      templateHtml: TEMPLATE,
      quiet: true,
    });
    expect(model.inbox?.map((row) => row.sessionId)).toEqual(["sa"]);
  });

  it("collects rows through the card-only helpers and keeps an unreadable registry empty", async () => {
    await setup();
    const io = fakeIo(env);
    const data = await collectRegistryData(env, T0, io.warn);
    expect(data.projects).toHaveLength(2);
    expect(data.inbox).toHaveLength(2);
    expect(await collectRegistryProjects(env, T0, io.warn)).toHaveLength(2);
    expect(await collectPanelProjects([], env, T0, io.warn)).toEqual([]);
    await writeFile(globalPaths(env).registry, JSON.stringify({ schema: 1, projects: [] }));
    expect(await collectRegistryData(env, T0, io.warn)).toEqual({ projects: [], inbox: [] });
  });

  it("marks a missing project rowless and warns for a broken one", async () => {
    const missing = join(dir, "gone");
    const broken = join(dir, "broken");
    await mkdir(dirname(projectPaths(broken).sessions), { recursive: true });
    await writeFile(projectPaths(broken).sessions, "not a directory");
    const io = fakeIo(env);
    const data = await collectPanelProjects(
      [
        { path: missing, name: "gone", addedAt: T0 },
        { path: broken, name: "broken", addedAt: T0 },
      ],
      env,
      T0,
      io.warn,
    );
    expect(data).toHaveLength(2);
    expect(data[0]?.missing).toBe(true);
    expect(io.warnings.some((line) => line.startsWith("skipping project"))).toBe(true);
  });
});

describe("inbox dismiss state", () => {
  it("treats a missing or unreadable file as nothing dismissed and replaces it on the next write", async () => {
    const root = join(dir, "alpha");
    await initProject(root, env);
    expect((await readInboxDismissed(root)).size).toBe(0);
    await mkdir(dirname(projectPaths(root).inboxState), { recursive: true });
    await writeFile(projectPaths(root).inboxState, "{nope");
    expect((await readInboxDismissed(root)).size).toBe(0);
    await dismissInboxSession(root, "s1", T0);
    expect([...(await readInboxDismissed(root))]).toEqual([["s1", T0]]);
  });

  it("rejects an id or a time it cannot store", async () => {
    const root = join(dir, "alpha");
    await initProject(root, env);
    await expect(dismissInboxSession(root, "bad id!", T0)).rejects.toThrow(/not a session id/);
    await expect(dismissInboxSession(root, "s1", "not a time")).rejects.toThrow(/not a time/);
  });
});

describe("lastDecisionOf", () => {
  it("prefers the newest decision node and falls back to a message's agent choice", () => {
    const session = {
      nodes: [
        {
          id: "m1",
          kind: "message",
          title: "one",
          agentDecisions: [{ title: "Agent A", why: "" }],
        },
        { id: "d1", kind: "decision", title: "Decision" },
      ],
    } as never;
    expect(lastDecisionOf(session)).toBe("Decision");
    expect(
      lastDecisionOf({
        nodes: [
          {
            id: "m1",
            kind: "message",
            title: "one",
            agentDecisions: [{ title: "Agent A", why: "" }],
          },
        ],
      } as never),
    ).toBe("Agent A");
    expect(lastDecisionOf({ nodes: [] } as never)).toBe("");
  });
});
