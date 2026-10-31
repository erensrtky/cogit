import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  distillAtClose,
  distillPrompt,
  distillSessionInput,
  parseDistillAnswer,
  sessionInput,
} from "../src/captures.js";
import { buildProject } from "../src/commands/build.js";
import { captures, distill, formatCaptures, setCapture } from "../src/commands/captures.js";
import { closeSession } from "../src/commands/close.js";
import { configSet } from "../src/commands/config.js";
import { init } from "../src/commands/init.js";
import { sessionWrite } from "../src/commands/session.js";
import { createProgram } from "../src/program.js";
import type { Session } from "../src/schema/session.js";
import {
  addCaptureSuggestions,
  CAPTURES_SCHEMA,
  type CaptureItem,
  canTransition,
  readCaptures,
  setCaptureState,
} from "../src/store/captures.js";
import { withLock } from "../src/store/lock.js";
import { projectPaths } from "../src/store/paths.js";
import { type CaptureSourceSession, captureInput, hasOpenWork } from "../src/view/captures.js";
import { DATA_ELEMENT_ID } from "../src/view/model.js";
import { envFor, type FakeIo, fakeIo, T0, tempDir } from "./helpers.js";

const TEMPLATE = `<!doctype html><html><body><div id="root"></div>
    <script id="${DATA_ELEMENT_ID}" type="application/json"></script></body></html>`;

const NOW = "2026-10-21T10:00:00.000Z";

function source(over: Partial<CaptureSourceSession> & { sessionId: string }): CaptureSourceSession {
  return {
    title: "",
    updatedAt: T0,
    status: { pending: [] },
    messages: [],
    ...over,
  };
}

const branch = (open: string) => ({ title: "Parser", asked: "build it", outcome: "built", open });

describe("the distiller's input", () => {
  it("takes pending items and branch open lines, dropping blanks and repeats", () => {
    const input = captureInput(
      source({
        sessionId: "s1",
        title: "Ship it",
        status: {
          pending: [
            { text: "write the docs", needsUser: false },
            { text: "   ", needsUser: true },
            { text: "write the docs ", needsUser: false },
          ],
        },
        messages: [
          { id: "m1", label: "m1", title: "Build", branch: branch("handle empty input") },
          { id: "m2", label: "m2", title: "More", branch: branch("  ") },
          { id: "m3", label: "m3", title: "Done" },
          { id: "h4", label: "m4", title: "Tail", unsummarized: true },
        ],
      }),
    );
    expect(input.pending).toEqual([
      { text: "write the docs", needsUser: false, messageId: "m3", label: "m3" },
    ]);
    expect(input.branches).toEqual([{ text: "handle empty input", messageId: "m1", label: "m1" }]);
    expect(input.lastMessages.map((message) => message.id)).toEqual(["m1", "m2", "m3"]);
    expect(hasOpenWork(input)).toBe(true);
  });

  it("has nothing to do for a session with nothing open", () => {
    const input = captureInput(source({ sessionId: "s1", messages: [] }));
    expect(hasOpenWork(input)).toBe(false);
    expect(input.pending).toEqual([]);
    expect(input.branches).toEqual([]);
  });
});

describe("the distiller's prompt and answer", () => {
  const input = captureInput(
    source({
      sessionId: "s9",
      title: "Parser work",
      status: { pending: [{ text: "decide the error format", needsUser: true }] },
      messages: [
        { id: "m1", label: "m1", title: "Build the parser" },
        { id: "m2", label: "m2", title: "Handle input" },
      ],
    }),
  );

  it("names the leftover lines, the messages and the current list", () => {
    const prompt = distillPrompt(input, [{ id: "c1a2b3c4", text: "old item" }], "auto");
    expect(prompt).toContain("decide the error format");
    expect(prompt).toContain("Handle input");
    expect(prompt).toContain("c1a2b3c4: old item");
    expect(prompt).toContain('"duplicateOf"');
    expect(prompt).toContain("at most 140 characters");
    expect(prompt).toContain("the conversation's language");
    expect(prompt).toContain("Items belong to the session");
    expect(prompt).toContain('{"items": [{"text": "..."}], "duplicateOf": []}');
    expect(prompt).not.toContain("messageId");
  });

  it("reads the answer, flattening the text and dropping malformed rows", () => {
    const answer = JSON.stringify({
      items: [
        { text: "  write  the docs ", messageId: "m1" },
        { text: "" },
        7,
        { text: "fix the parser" },
      ],
      duplicateOf: ["c11111111", 7],
    });
    expect(parseDistillAnswer(`\`\`\`json\n${answer}\n\`\`\``)).toEqual({
      items: [{ text: "write the docs" }, { text: "fix the parser" }],
      duplicateOf: ["c11111111"],
    });
  });
});

describe("the captured store", () => {
  let dir: string;
  let root: string;

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
    await init(root, { name: "proj", retention: "keep", language: "auto" }, fakeIo(envFor(dir)));
  });

  it("round-trips suggestions and moves only updatedAt for duplicates", async () => {
    const first = await addCaptureSuggestions(root, "s1", [{ text: "write the docs" }], {
      now: T0,
    });
    expect(first).toHaveLength(1);
    expect(first[0]?.id).toMatch(/^c[0-9a-f]{8}$/);
    const open = await setCaptureState(root, first[0]?.id as string, "open", T0);
    expect(open.state).toBe("open");
    const later = "2026-10-22T00:00:00.000Z";
    const added = await addCaptureSuggestions(root, "s2", [{ text: "write the docs" }], {
      now: later,
      duplicateOf: [open.id],
    });
    expect(added).toEqual([]);
    const store = await readCaptures(root);
    expect(store.items).toHaveLength(1);
    expect(store.items[0]).toMatchObject({ id: open.id, state: "open", updatedAt: later });
  });

  it("records closedAt on done and refuses an impossible transition", async () => {
    const [item] = await addCaptureSuggestions(root, "s1", [{ text: "x" }], {
      now: T0,
    });
    await expect(setCaptureState(root, item?.id as string, "done", T0)).rejects.toThrow(
      "cannot become done",
    );
    await setCaptureState(root, item?.id as string, "open", T0);
    const done = await setCaptureState(root, item?.id as string, "done", NOW);
    expect(done.closedAt).toBe(NOW);
    await expect(setCaptureState(root, "c00000000", "open", T0)).rejects.toThrow(
      "no captured item",
    );
    expect(canTransition("suggested", "dismissed")).toBe(true);
    expect(canTransition("done", "open")).toBe(false);
  });

  it("replaces a corrupt file with an empty one and warns", async () => {
    await mkdir(join(root, ".cogit", "state"), { recursive: true });
    await writeFile(projectPaths(root).captures, "{not json");
    const warnings: string[] = [];
    const store = await readCaptures(root, (line) => warnings.push(line));
    expect(store).toEqual({ schema: CAPTURES_SCHEMA, items: [] });
    expect(warnings[0]).toContain("corrupt");
    expect(JSON.parse(await readFile(projectPaths(root).captures, "utf8"))).toEqual({
      schema: CAPTURES_SCHEMA,
      items: [],
    });
  });

  it("reads a schema-1 file by dropping each item's message and keeping the rest", async () => {
    await mkdir(join(root, ".cogit", "state"), { recursive: true });
    await writeFile(
      projectPaths(root).captures,
      JSON.stringify({
        schema: 1,
        items: [
          {
            id: "c00000001",
            text: "one",
            state: "open",
            source: { sessionId: "s1", messageId: "m3" },
            createdAt: NOW,
            updatedAt: NOW,
          },
          {
            id: "c00000002",
            text: "two",
            state: "done",
            source: { sessionId: "s2", messageId: "m9" },
            createdAt: NOW,
            updatedAt: NOW,
            closedAt: NOW,
          },
        ],
      }),
    );
    expect(await readCaptures(root)).toEqual({
      schema: CAPTURES_SCHEMA,
      items: [
        {
          id: "c00000001",
          text: "one",
          state: "open",
          source: { sessionId: "s1" },
          createdAt: NOW,
          updatedAt: NOW,
        },
        {
          id: "c00000002",
          text: "two",
          state: "done",
          source: { sessionId: "s2" },
          createdAt: NOW,
          updatedAt: NOW,
          closedAt: NOW,
        },
      ],
    });
    // The next change writes the migrated shape; the message stays dropped.
    await setCaptureState(root, "c00000001", "done", NOW);
    const file = JSON.parse(await readFile(projectPaths(root).captures, "utf8"));
    expect(file.schema).toBe(CAPTURES_SCHEMA);
    expect(file.items[0].source).toEqual({ sessionId: "s1" });
  });
});

describe("formatCaptures", () => {
  const item = (
    over: Partial<CaptureItem> & { id: string; state: CaptureItem["state"] },
  ): CaptureItem => ({
    text: "text",
    source: { sessionId: "s1" },
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  });

  it("groups the list into the three sections and leaves dismissed items out", () => {
    const lines = formatCaptures(
      {
        schema: CAPTURES_SCHEMA,
        items: [
          // Same time: the id keeps the order stable.
          item({ id: "c00000005", state: "suggested", text: "review me" }),
          item({ id: "c00000001", state: "suggested", text: "same time", updatedAt: NOW }),
          item({ id: "c00000002", state: "open", text: "accepted" }),
          item({ id: "c00000003", state: "done", text: "closed" }),
          item({ id: "c00000004", state: "dismissed", text: "gone" }),
        ],
      },
      new Map([["s1", "Parser"]]),
      NOW,
    );
    expect(lines).toEqual([
      "To review",
      "  c00000001  same time  (Parser · under a minute ago)",
      "  c00000005  review me  (Parser · under a minute ago)",
      "Open",
      "  c00000002  accepted  (Parser · under a minute ago)",
      "Done",
      "  c00000003  closed  (Parser · under a minute ago)",
    ]);
  });

  it("says so plainly when nothing was ever drafted", () => {
    expect(formatCaptures({ schema: CAPTURES_SCHEMA, items: [] })).toEqual(["No captured work."]);
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
      updatedAt: "2026-10-21T08:00:00.000Z",
      status: {
        goal: "",
        done: [],
        pending: [{ text: "decide the error format", needsUser: true }],
        next: "",
      },
      nodes: [{ id: "m1", parent: null, kind: "message", title: "Build the parser", at: T0 }],
    });
    await writeFile(projectPaths(root).session("s1"), JSON.stringify(s1));
  });

  it("prints the sections, with the session title as the source and the age", async () => {
    await addCaptureSuggestions(root, "s1", [{ text: "decide the error format" }], {
      now: "2026-10-21T08:00:00.000Z",
    });
    const store = await captures({ dir: root, io, now: NOW });
    expect(store.items).toHaveLength(1);
    const [header, line] = io.lines;
    expect(header).toBe("To review");
    expect(line).toContain("decide the error format");
    expect(line).toContain("Parser");
    expect(line).not.toContain(" m1");
    expect(line).toContain("2 h ago");
  });

  it("prints the store as JSON", async () => {
    await addCaptureSuggestions(root, "s1", [{ text: "one" }], { now: NOW });
    await captures({ dir: root, io, json: true });
    const store = JSON.parse(io.lines.join("\n"));
    expect(store.items[0]).toMatchObject({ text: "one", state: "suggested" });
  });

  it("accepts, dismisses and closes an item", async () => {
    const [item] = await addCaptureSuggestions(root, "s1", [{ text: "one" }], {
      now: NOW,
    });
    await setCapture(root, "accept", item?.id as string, io);
    expect((await readCaptures(root)).items[0]?.state).toBe("open");
    await setCapture(root, "done", item?.id as string, io);
    expect((await readCaptures(root)).items[0]?.state).toBe("done");
    await expect(setCapture(root, "dismiss", "c00000000", fakeIo(envFor(dir)))).rejects.toThrow(
      "no captured item",
    );
    const [fresh] = await addCaptureSuggestions(root, "s1", [{ text: "two" }], {
      now: NOW,
    });
    await expect(setCapture(root, "done", fresh?.id as string, io)).rejects.toThrow(
      "cannot become done",
    );
  });

  it("lets an unreadable store's own error through", async () => {
    await addCaptureSuggestions(root, "s1", [{ text: "one" }], { now: NOW });
    await rm(projectPaths(root).captures, { force: true });
    await mkdir(projectPaths(root).captures, { recursive: true });
    await expect(setCapture(root, "accept", "c00000000", io)).rejects.toThrow(/EISDIR/);
  });

  it("is carried in the map's page model", async () => {
    await addCaptureSuggestions(root, "s1", [{ text: "one" }], { now: NOW });
    const model = await buildProject({ dir: root, io, templateHtml: TEMPLATE, quiet: true });
    expect(model.captures?.map((row) => row.text)).toEqual(["one"]);
    expect(model.settings?.captures).toBe(true);
  });
});

describe("distilling with the side model", () => {
  let dir: string;
  let root: string;
  let bin: string;
  let io: FakeIo;
  let env: NodeJS.ProcessEnv;

  /** A fake `claude` that answers with one fixed result. */
  async function fakeClaude(answer: unknown): Promise<void> {
    bin = join(dir, "bin");
    await mkdir(bin, { recursive: true });
    const file = join(bin, "claude");
    await writeFile(
      file,
      `#!/usr/bin/env node
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => { input += c; });
process.stdin.on("end", async () => {
  const fs = await import("node:fs");
  fs.writeFileSync(${JSON.stringify(join(dir, "prompt.txt"))}, input);
  process.stdout.write(JSON.stringify({ result: ${JSON.stringify(JSON.stringify(answer))} }));
});
`,
    );
    await chmod(file, 0o755);
    env = { ...envFor(dir), PATH: `${bin}:${process.env.PATH ?? ""}` };
    io = fakeIo(env);
  }

  const s1 = (): Session => ({
    schema: 1,
    sessionId: "s1",
    agent: "claude-code",
    title: "Parser",
    startedAt: T0,
    updatedAt: T0,
    status: {
      goal: "",
      done: [],
      pending: [{ text: "write the docs", needsUser: false }],
      next: "",
    },
    nodes: [
      { id: "m1", parent: null, kind: "message", title: "Build the parser", at: T0 },
      { id: "m2", parent: "m1", kind: "message", title: "More", at: T0 },
    ],
  });

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
    await fakeClaude({ items: [{ text: "write the docs" }], duplicateOf: [] });
    await init(root, { name: "proj", retention: "keep", language: "auto" }, fakeIo(env));
    await writeFile(projectPaths(root).session("s1"), JSON.stringify(s1()));
    // A session with nothing left open costs no call; --all passes over it.
    const s2 = {
      ...s1(),
      sessionId: "s2",
      title: "Quiet",
      status: { goal: "", done: [], pending: [], next: "" },
    };
    await writeFile(projectPaths(root).session("s2"), JSON.stringify(s2));
  });

  it("writes the answer as a suggested item that belongs to its session", async () => {
    const result = await distillSessionInput(root, sessionInput(s1()), { io });
    expect(result?.proposal.items).toEqual([{ text: "write the docs" }]);
    const store = await readCaptures(root);
    expect(store.items).toHaveLength(1);
    expect(store.items[0]).toMatchObject({
      state: "suggested",
      text: "write the docs",
      source: { sessionId: "s1" },
    });
  });

  it("returns nothing for a session with nothing open and calls no model", async () => {
    const quiet = { ...s1(), status: { goal: "", done: [], pending: [], next: "" } };
    const result = await distillSessionInput(root, sessionInput(quiet), { io });
    expect(result).toBeUndefined();
    expect((await readCaptures(root)).items).toEqual([]);
  });

  it("does nothing with captures turned off", async () => {
    await configSet("captures", "false", fakeIo(env));
    const result = await distillSessionInput(root, sessionInput(s1()), { io });
    expect(result).toBeUndefined();
  });

  it("writes nothing in a dry run", async () => {
    const result = await distillSessionInput(root, sessionInput(s1()), { io, dryRun: true });
    expect(result?.proposal.items).toHaveLength(1);
    expect((await readCaptures(root)).items).toEqual([]);
  });

  it("runs by hand and respects --dry-run", async () => {
    await distill({ dir: root, io, dryRun: true });
    expect(io.lines[0]).toContain('Session s1 "Parser"');
    expect((await readCaptures(root)).items).toEqual([]);
    await distill({ dir: root, io });
    expect((await readCaptures(root)).items[0]?.state).toBe("suggested");
  });

  it("reads the existing list and keeps an item the session is still about", async () => {
    const [existing] = await addCaptureSuggestions(root, "s1", [{ text: "write the docs" }], {
      now: T0,
    });
    await setCaptureState(root, existing?.id as string, "open", T0);
    await fakeClaude({
      items: [{ text: "write the docs" }],
      duplicateOf: [existing?.id, "c00000000"],
    });
    const later = "2026-10-22T00:00:00.000Z";
    const result = await distillSessionInput(root, sessionInput(s1()), { io, now: later });
    // An unknown id in duplicateOf is dropped; the known one is kept as is.
    expect(result?.proposal.duplicateOf).toEqual([existing?.id]);
    expect(result?.proposal.added).toEqual([]);
    const store = await readCaptures(root);
    expect(store.items).toHaveLength(1);
    expect(store.items[0]).toMatchObject({ id: existing?.id, state: "open", updatedAt: later });
  });

  it("stores an item for a session with no messages to anchor", async () => {
    await fakeClaude({ items: [{ text: "orphan" }], duplicateOf: [] });
    const record = { ...s1(), nodes: [] };
    const result = await distillSessionInput(root, sessionInput(record), { io });
    expect(result?.proposal.items).toEqual([{ text: "orphan" }]);
    expect((await readCaptures(root)).items[0]?.source).toEqual({ sessionId: "s1" });
  });

  it("refuses a hand-run pass with captures off", async () => {
    await configSet("captures", "false", fakeIo(env));
    await expect(distill({ dir: root, io })).rejects.toThrow("captured work is off");
  });

  it("skips a session whose lock is busy and warns when the pass fails", async () => {
    await withLock(
      projectPaths(root).lock("captures-s1"),
      async () => {
        expect(await distillAtClose(root, s1(), io)).toBeUndefined();
      },
      { timeoutMs: 0 },
    );
    // No `claude` on PATH: the failure lands in the warning, never in the close pass.
    const broken = fakeIo({ ...env, PATH: join(dir, "missing") });
    expect(await distillAtClose(root, s1(), broken)).toBeUndefined();
    expect(broken.warnings[0]).toContain("could not distil captured work");
  });

  it("takes --session and --all, and says when nothing is new or left open", async () => {
    await distill({ dir: root, io, session: "s1" });
    expect((await readCaptures(root)).items).toHaveLength(1);
    io.lines.length = 0;
    // The same answer again is not drafted twice; the quiet session costs nothing.
    await distill({ dir: root, io, all: true });
    expect(io.lines.join("\n")).toContain("nothing new for session s1");
    expect(io.lines.join("\n")).toContain("session s2 has nothing left open to distil");
  });

  it("says when a project has no session at all", async () => {
    const empty = join(dir, "empty");
    await mkdir(empty);
    await init(empty, { name: "empty", retention: "keep", language: "auto" }, fakeIo(env));
    await distill({ dir: empty, io });
    expect(io.lines).toContain("this project has no recorded session to distil");
  });

  it("runs through the command line", async () => {
    const program = createProgram(() => io, {
      launch: async () => true,
      server: async () => null,
      stdin: async () => "",
    });
    await program.parseAsync(["captures", root, "--json"], { from: "user" });
    expect(JSON.parse(io.lines.join("\n")).items).toEqual([]);
    io.lines.length = 0;
    await program.parseAsync(["captures", "distill", "--dry-run", "--dir", root], {
      from: "user",
    });
    expect(io.lines.join("\n")).toContain('Session s1 "Parser"');
    const [item] = await addCaptureSuggestions(root, "s1", [{ text: "cli item" }], {
      now: T0,
    });
    await program.parseAsync(["captures", "accept", item?.id as string, "--dir", root], {
      from: "user",
    });
    expect((await readCaptures(root)).items.find((row) => row.id === item?.id)?.state).toBe("open");
  });
});

describe("the session-end pass", () => {
  it("leaves a suggested item after a session closes", async () => {
    const dir = await tempDir();
    const root = join(dir, "proj");
    await mkdir(root);
    const bin = join(dir, "bin");
    await mkdir(bin, { recursive: true });
    await writeFile(
      join(bin, "claude"),
      `#!/usr/bin/env node
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => { input += c; });
process.stdin.on("end", () => {
  const answer = input.includes("You distil")
    ? JSON.stringify({ items: [{ text: "write the docs" }], duplicateOf: [] })
    : JSON.stringify({
        threads: [{ name: "Work", messages: "m1-m2", from: null, asked: "a", outcome: "o", open: "docs unwritten" }],
        leftOff: "The docs are unwritten",
      });
  process.stdout.write(JSON.stringify({ result: answer }));
});
`,
    );
    await chmod(join(bin, "claude"), 0o755);
    const env = { ...envFor(dir), PATH: `${bin}:${process.env.PATH ?? ""}` };
    await init(root, { name: "proj", retention: "keep", language: "auto" }, fakeIo(env));
    const folder = join(envFor(dir).CLAUDE_CONFIG_DIR ?? "", "projects", "proj");
    await mkdir(folder, { recursive: true });
    const at = (m: number) => `2026-10-23T10:0${m}:00.000Z`;
    const typed = (m: number) => ({
      type: "user",
      timestamp: at(m),
      message: { role: "user", content: `message ${m}` },
    });
    await writeFile(
      join(folder, "s1.jsonl"),
      `${[1, 2].map((m) => JSON.stringify(typed(m))).join("\n")}\n`,
    );
    await sessionWrite({ dir: root, by: "side" }, fakeIo(env), async () =>
      JSON.stringify({
        sessionId: "s1",
        nodes: [1, 2].map((m) => ({
          id: `m${m}`,
          kind: "message",
          title: `T${m}`,
          parent: m === 1 ? null : `m${m - 1}`,
        })),
      }),
    );

    await closeSession(root, "s1", fakeIo(env));
    const store = await readCaptures(root);
    expect(store.items).toHaveLength(1);
    expect(store.items[0]).toMatchObject({ text: "write the docs", state: "suggested" });
    expect(store.items[0]?.source.sessionId).toBe("s1");
  });
});
