import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it } from "vitest";
import { epochAdd } from "../src/commands/epoch.js";
import { init } from "../src/commands/init.js";
import { readStdin, sessionShow, sessionWrite } from "../src/commands/session.js";
import { redactDeep, redactText } from "../src/redact.js";
import { loadSession } from "../src/store/stores.js";
import { envFor, type FakeIo, fakeIo, tempDir } from "./helpers.js";

describe("redactText", () => {
  it.each([
    ["key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123", "key [REDACTED]"],
    ["sk-proj-abcdefghijklmnopqrstuvwx", "[REDACTED]"],
    ["ghp_abcdefghijklmnopqrstuvwxyz0123456789", "[REDACTED]"],
    ["github_pat_11ABCDEFG0123456789_abcdef", "[REDACTED]"],
    ["glpat-abcdefghijklmnopqrstu", "[REDACTED]"],
    ["AKIAABCDEFGHIJKLMNOP", "[REDACTED]"],
    ["xoxb-1234567890-abcdef", "[REDACTED]"],
    ["AIzaSyA-abcdefghijklmnopqrstuvwxyz01234", "[REDACTED]"],
    ["eyJhbGciOiJI.eyJzdWIiOiIx.SflKxwRJSMeK", "[REDACTED]"],
    ["password=hunter22!", "password=[REDACTED]"],
    ['api_key: "abc123def456"', 'api_key: "[REDACTED]"'],
    ["Authorization: Bearer abcdefghijklmnop1234", "Authorization: Bearer [REDACTED]"],
    ["postgres://admin:s3cr3t@db.local/x", "postgres://admin:[REDACTED]@db.local/x"],
    ["-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----", "[REDACTED]"],
  ])("masks %s", (input, expected) => {
    expect(redactText(input).text).toBe(expected);
  });

  it.each([
    "token: refresh flow",
    "password reset is out of scope",
    "decided to keep the secret in the OS keychain",
    "https://example.com/path@v2",
    "sk-short",
  ])("leaves prose alone: %s", (input) => {
    expect(redactText(input)).toEqual({ text: input, count: 0 });
  });

  it("walks nested values and counts hits", () => {
    const r = redactDeep({ a: ["password=hunter22!", 3, null], b: { c: "ok", d: true } });
    expect(r).toEqual({
      value: { a: ["password=[REDACTED]", 3, null], b: { c: "ok", d: true } },
      count: 1,
    });
  });
});

describe("session write", () => {
  let dir: string;
  let root: string;
  let io: FakeIo;
  const write = (json: unknown) =>
    sessionWrite({ dir: root }, io, async () =>
      typeof json === "string" ? json : JSON.stringify(json),
    );

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
    io = fakeIo(envFor(dir));
    await init(root, { name: "p", retention: "keep", language: "auto" }, fakeIo(envFor(dir)));
    await epochAdd(root, "e2e", "E2E", fakeIo(envFor(dir)));
  });

  it("creates and then merges a session", async () => {
    await write({
      sessionId: "s1",
      title: "setup",
      epoch: "e2e",
      nodes: [{ id: "n1", kind: "phase", title: "start" }],
    });
    await write({
      sessionId: "s1",
      nodes: [{ id: "n2", parent: "n1", kind: "decision", title: "use elk", why: "nesting" }],
    });
    const s = await loadSession(root, "s1");
    expect(s).toMatchObject({ ok: true, data: { title: "setup", epoch: "e2e" } });
    expect(s.found && s.ok && s.data.nodes.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(io.lines).toEqual(["Saved session s1 (1 nodes)", "Saved session s1 (2 nodes)"]);
    expect(io.warnings).toEqual([]);
  });

  it("redacts secrets before writing", async () => {
    await write({
      sessionId: "s1",
      status: { goal: "rotate ghp_abcdefghijklmnopqrstuvwxyz0123456789" },
    });
    const s = await loadSession(root, "s1");
    expect(s.found && s.ok && s.data.status.goal).toBe("rotate [REDACTED]");
    expect(io.warnings).toEqual(["redacted 1 secret-looking value(s)"]);
  });

  it("warns about unknown epochs and repaired trees but still saves", async () => {
    await write({
      sessionId: "s1",
      epoch: "nope",
      nodes: [{ id: "a", parent: "ghost", kind: "step", title: "x" }],
    });
    expect(io.warnings[0]).toMatch(/epoch "nope" is not in project.json/);
    expect(io.warnings[1]).toMatch(/parent ghost not found/);
    expect(await loadSession(root, "s1")).toMatchObject({ ok: true, data: { epoch: "nope" } });
  });

  it("repairs a message parent to the previous message and drops bad links", async () => {
    await write({
      sessionId: "s1",
      nodes: [
        { id: "m1", kind: "message", title: "One" },
        { id: "m2", kind: "message", title: "Two", parent: "m9" },
        { id: "m3", kind: "message", title: "Three", parent: "m3", links: ["m9", "m1", "m2"] },
      ],
    });
    const s = await loadSession(root, "s1");
    const nodes = s.found && s.ok ? s.data.nodes : [];
    expect(nodes.map((n) => [n.id, n.parent])).toEqual([
      ["m1", null],
      ["m2", "m1"],
      ["m3", "m2"],
    ]);
    expect(nodes[2]?.links).toEqual(["m1", "m2"]);
    expect(io.warnings).toEqual([
      expect.stringMatching(/m2: parent m9 is not an earlier message of this session, using m1/),
      expect.stringMatching(/m3: parent m3 is not an earlier message of this session, using m2/),
      expect.stringMatching(/m3: link m9 is not an earlier message of this session, dropped/),
    ]);
  });

  it("rejects invalid JSON and schema mismatches", async () => {
    await expect(write("{nope")).rejects.toThrow(/not valid JSON/);
    await expect(write({ sessionId: "../x" })).rejects.toThrow(/sessionId:/);
    await expect(write([])).rejects.toThrow(/\(root\)/);
  });

  it("reads from a file and requires an initialized project", async () => {
    const f = join(dir, "in.json");
    await writeFile(f, JSON.stringify({ sessionId: "s2" }));
    await sessionWrite({ dir: root, file: f }, io);
    expect(io.lines).toEqual(["Saved session s2 (0 nodes)"]);
    await expect(sessionWrite({ dir: dir, file: f }, io)).rejects.toThrow(/not initialized/);
    await mkdir(join(dir, ".codelineage"));
    await writeFile(join(dir, ".codelineage", "project.json"), "{}");
    await expect(sessionWrite({ dir: dir, file: f }, io)).rejects.toThrow(/schema version/);
  });

  it("reads stdin as utf8", async () => {
    expect(await readStdin(Readable.from([Buffer.from('{"a":'), "1}"]))).toBe('{"a":1}');
  });
});

describe("session show", () => {
  let dir: string;
  let root: string;
  let io: FakeIo;
  const shown = () => JSON.parse(io.lines.at(-1) ?? "") as Record<string, unknown>;

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
    io = fakeIo(envFor(dir));
  });

  it("reports an uninitialized project without failing", async () => {
    await sessionShow(root, "s1", io);
    expect(shown()).toEqual({ initialized: false, dir: root });
  });

  it("reports a corrupt project.json without failing", async () => {
    await mkdir(join(root, ".codelineage"));
    await writeFile(join(root, ".codelineage", "project.json"), "{nope");
    await sessionShow(root, "s1", io);
    expect(shown()).toMatchObject({ initialized: false, error: expect.stringMatching(/JSON/) });
  });

  it("shows epochs, language and a compact record without summaries", async () => {
    await init(root, { name: "p", retention: "keep", language: "tr" }, fakeIo(envFor(dir)));
    await epochAdd(root, "e2e", "E2E", fakeIo(envFor(dir)));
    await sessionShow(root, "s1", io);
    expect(shown()).toEqual({
      initialized: true,
      dir: root,
      project: "p",
      language: "tr",
      epochs: [{ id: "e2e", title: "E2E" }],
      session: null,
      newMessages: null,
      lastMessages: [],
      inbox: join(root, ".codelineage", "inbox", "s1.json"),
    });

    await sessionWrite({ dir: root }, fakeIo(envFor(dir)), async () =>
      JSON.stringify({
        sessionId: "s1",
        title: "t",
        epoch: "e2e",
        status: { goal: "g" },
        nodes: [{ id: "a", kind: "phase", title: "A", summary: "long text", why: "because" }],
      }),
    );
    await sessionShow(root, "s1", io);
    expect(shown().session).toEqual({
      sessionId: "s1",
      title: "t",
      epoch: "e2e",
      status: { goal: "g", done: [], pending: [], next: "" },
      nodes: [{ id: "a", parent: null, kind: "phase", title: "A" }],
    });
  });

  it("lists the user's messages that have no node yet, and stamps their time on write", async () => {
    await init(root, { name: "p", retention: "keep", language: "auto" }, fakeIo(envFor(dir)));
    const folder = join(dir, "claude", "projects", "-p");
    await mkdir(folder, { recursive: true });
    const line = (text: string, m: number) =>
      JSON.stringify({
        type: "user",
        timestamp: `2026-10-23T10:0${m}:00.000Z`,
        message: { role: "user", content: text },
      });
    await writeFile(
      join(folder, "s1.jsonl"),
      `${line("first", 1)}
${line("second", 2)}
`,
    );

    await sessionShow(root, "s1", io);
    expect(shown()).toMatchObject({
      messageCount: 2,
      newMessages: [
        { id: "m1", at: "2026-10-23T10:01:00.000Z", text: "first" },
        { id: "m2", at: "2026-10-23T10:02:00.000Z", text: "second", gapMinutes: 1 },
      ],
    });

    const writeIo = fakeIo(envFor(dir));
    await sessionWrite({ dir: root }, writeIo, async () =>
      JSON.stringify({
        sessionId: "s1",
        nodes: [
          { id: "m1", kind: "message", title: "First", at: "2020-01-01T00:00:00.000Z" },
          { id: "m9", kind: "message", title: "Made up" },
        ],
      }),
    );
    expect(writeIo.warnings).toEqual([expect.stringMatching(/m9: no such message/)]);
    const saved = await loadSession(root, "s1");
    expect(saved.found && saved.ok && saved.data.nodes[0]?.at).toBe("2026-10-23T10:01:00.000Z");

    io.lines.length = 0;
    await sessionShow(root, "s1", io);
    expect(shown().newMessages).toEqual([
      { id: "m2", at: "2026-10-23T10:02:00.000Z", text: "second", gapMinutes: 1 },
    ]);
    expect(shown().lastMessages).toEqual([
      { id: "m1", title: "First", parent: null },
      { id: "m9", title: "Made up", parent: null },
    ]);
  });

  it("hints the gap, a /clear and this session's commits for each new message", async () => {
    await init(root, { name: "p", retention: "keep", language: "auto" }, fakeIo(envFor(dir)));
    const folder = join(dir, "claude", "projects", "-p");
    await mkdir(folder, { recursive: true });
    const user = (text: string, at: string) =>
      JSON.stringify({
        type: "user",
        timestamp: at,
        message: { role: "user", content: text },
      });
    const commit = JSON.stringify({
      type: "assistant",
      timestamp: "2026-10-23T10:05:00.000Z",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", name: "Bash", input: { command: "git commit -m x" } }],
      },
    });
    await writeFile(
      join(folder, "s1.jsonl"),
      [
        user("first", "2026-10-23T10:00:00.000Z"),
        commit,
        user("second", "2026-10-23T10:30:00.000Z"),
        user("<command-name>/clear</command-name>", "2026-10-23T10:40:00.000Z"),
        user("third", "2026-10-23T11:00:00.000Z"),
      ].join("\n"),
    );

    await sessionShow(root, "s1", io);
    expect(shown().newMessages).toEqual([
      { id: "m1", at: "2026-10-23T10:00:00.000Z", text: "first" },
      {
        id: "m2",
        at: "2026-10-23T10:30:00.000Z",
        text: "second",
        gapMinutes: 30,
        commitBetween: true,
      },
      { id: "m3", at: "2026-10-23T11:00:00.000Z", text: "third", gapMinutes: 30, resumed: true },
    ]);
  });

  it("treats an unreadable transcript as none and warns about a message id it cannot use", async () => {
    await init(root, { name: "p", retention: "keep", language: "auto" }, fakeIo(envFor(dir)));
    // A directory where the transcript should be: found, but reading it fails.
    await mkdir(join(dir, "claude", "projects", "-p", "s1.jsonl"), { recursive: true });
    await sessionShow(root, "s1", io);
    expect(shown().newMessages).toBeNull();

    const writeIo = fakeIo(envFor(dir));
    await sessionWrite({ dir: root }, writeIo, async () =>
      JSON.stringify({ sessionId: "s1", nodes: [{ id: "first", kind: "message", title: "F" }] }),
    );
    expect(writeIo.warnings).toEqual([
      expect.stringMatching(/first: expected an id like m1/),
      // The map build that follows the write cannot read it either.
      expect.stringMatching(/could not read the conversation of s1/),
    ]);
  });

  it("warns when the transcript has user lines but none reads as a message", async () => {
    await init(root, { name: "p", retention: "keep", language: "auto" }, fakeIo(envFor(dir)));
    const folder = join(dir, "claude", "projects", "-p");
    await mkdir(folder, { recursive: true });
    await writeFile(
      join(folder, "s1.jsonl"),
      `${JSON.stringify({
        type: "user",
        timestamp: "2026-10-23T10:01:00.000Z",
        message: { role: "user", content: { changed: "shape" } },
      })}\n`,
    );
    await sessionShow(root, "s1", io);
    expect(shown()).toMatchObject({
      messageCount: 0,
      newMessages: [],
      transcriptWarning: expect.stringMatching(/format may have changed/),
    });
  });

  it("flags an unreadable record instead of hiding it", async () => {
    await init(root, { name: "p", retention: "keep", language: "auto" }, fakeIo(envFor(dir)));
    await writeFile(join(root, ".codelineage", "sessions", "s1.json"), "{nope");
    await sessionShow(root, "s1", io);
    expect(shown()).toMatchObject({ session: null, sessionError: expect.stringMatching(/JSON/) });
  });

  it("consumes the inbox file after a successful write and keeps it after a failed one", async () => {
    await init(root, { name: "p", retention: "keep", language: "auto" }, fakeIo(envFor(dir)));
    const file = join(root, ".codelineage", "inbox", "s1.json");
    await mkdir(join(root, ".codelineage", "inbox"));
    await writeFile(file, "{nope");
    await expect(sessionWrite({ dir: root, file, consume: true }, io)).rejects.toThrow(/JSON/);
    expect(existsSync(file)).toBe(true);
    await writeFile(file, '{"sessionId":"s1"}');
    await sessionWrite({ dir: root, file, consume: true }, io);
    expect(existsSync(file)).toBe(false);
  });

  it("rejects an id that is not a slug", async () => {
    await expect(sessionShow(root, "../x", io)).rejects.toThrow(/invalid session id/);
  });
});
