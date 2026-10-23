import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { init } from "../src/commands/init.js";
import { migrateIds } from "../src/commands/migrate.js";
import { sessionWrite } from "../src/commands/session.js";
import { canonicalMessage, messageHash, messageLabel, upgradeSessionIds } from "../src/messages.js";
import type { SessionEvent } from "../src/schema/events.js";
import type { Session } from "../src/schema/session.js";
import { readEvents, replayEvents } from "../src/store/events.js";
import { projectPaths } from "../src/store/paths.js";
import { loadSession } from "../src/store/stores.js";
import { envFor, type FakeIo, fakeIo, T0, tempDir } from "./helpers.js";

const AT = "2026-10-24T10:00:00.000Z";

describe("message ids", () => {
  it("is stable across runs and machines for a fixed message", () => {
    // The expected value is the contract: same JSON bytes, same id everywhere.
    expect(canonicalMessage("s1", { uuid: "u1", at: AT, text: "hello" })).toBe(
      '{"sessionId":"s1","uuid":"u1","at":"2026-10-24T10:00:00.000Z","text":"hello"}',
    );
    expect(messageHash("s1", { uuid: "u1", at: AT, text: "hello" })).toBe("h577bcd134f01");
    expect(messageHash("s1", { at: AT, text: "hello" })).toBe("h6868c79664e0");
    expect(messageHash("s2", { uuid: "u1", at: AT, text: "hello" })).not.toBe(
      messageHash("s1", { uuid: "u1", at: AT, text: "hello" }),
    );
    expect(messageLabel(0)).toBe("m1");
    expect(messageLabel(41)).toBe("m42");
  });

  it("does not fold the parent into the id", () => {
    const message = { uuid: "u1", at: AT, text: "hello" };
    // Correcting a parent is an event; the message keeps its name.
    expect(messageHash("s1", message)).toBe(messageHash("s1", { ...message }));
  });

  it("renames old mN nodes and their parents/links to stable ids", () => {
    const messages = [{ ...turn("m1", "first", AT) }, { ...turn("m2", "second", AT) }];
    const hashed = messages.map((message, index) => ({
      ...message,
      label: message.id,
      hash: messageHash("s1", { at: message.at, text: message.text }),
    }));
    const session = {
      schema: 1,
      sessionId: "s1",
      agent: "claude-code",
      title: "",
      epoch: null,
      startedAt: AT,
      updatedAt: AT,
      status: { goal: "", done: [], pending: [], next: "" },
      nodes: [
        {
          id: "m1",
          parent: null,
          kind: "message" as const,
          title: "First",
          at: AT,
        },
        {
          id: "m2",
          parent: "m1",
          kind: "message" as const,
          title: "Second",
          at: AT,
          links: ["m1"],
        },
      ],
    } satisfies Session;
    const upgraded = upgradeSessionIds(session, hashed);
    expect(upgraded.nodes.map((node) => node.id)).toEqual([hashed[0]?.hash, hashed[1]?.hash]);
    expect(upgraded.nodes[1]?.parent).toBe(hashed[0]?.hash);
    expect(upgraded.nodes[1]?.links).toEqual([hashed[0]?.hash]);
  });

  it("keeps the node that already carries the stable id when both exist", () => {
    const message = {
      ...turn("m1", "first", AT),
      label: "m1",
      hash: messageHash("s1", { at: AT, text: "first" }),
    };
    const session = {
      schema: 1,
      sessionId: "s1",
      agent: "claude-code",
      title: "",
      epoch: null,
      startedAt: AT,
      updatedAt: AT,
      status: { goal: "", done: [], pending: [], next: "" },
      nodes: [
        { id: "m1", parent: null, kind: "message" as const, title: "Old" },
        { id: message.hash, parent: null, kind: "message" as const, title: "New" },
      ],
    } satisfies Session;
    const upgraded = upgradeSessionIds(session, [message]);
    expect(upgraded.nodes).toHaveLength(1);
    expect(upgraded.nodes[0]?.title).toBe("New");
  });
});

function turn(id: string, text: string, at: string) {
  return {
    id,
    at,
    text,
    replies: [],
    tools: { commands: 0, files: [], other: 0 },
  };
}

describe("events", () => {
  const at = AT;
  const event = (type: SessionEvent["type"], msg: string, target: string | null): SessionEvent => ({
    at,
    type,
    msg,
    target,
    by: "agent",
  });

  it("reads a missing file as no facts and skips a damaged line", async () => {
    const dir = await tempDir();
    const root = join(dir, "proj");
    expect(await readEvents(root, "s1")).toEqual([]);
    await mkdir(projectPaths(root).sessions, { recursive: true });
    await writeFile(
      projectPaths(root).events("s1"),
      [
        "not json",
        JSON.stringify({ at, type: "parent", msg: "h1", target: null, by: "agent" }),
      ].join("\n"),
    );
    expect((await readEvents(root, "s1")).map((event) => event.msg)).toEqual(["h1"]);
    // Anything but a missing file is a real error, not an empty history.
    await rm(projectPaths(root).events("s1"));
    await mkdir(projectPaths(root).events("s1"));
    await expect(readEvents(root, "s1")).rejects.toThrow();
  });

  it("replays in order: the last parent wins, link adds, unlink removes", () => {
    const replay = replayEvents([
      event("parent", "h1", null),
      event("parent", "h2", "h1"),
      event("parent", "h3", "h1"),
      event("link", "h3", "h1"),
      event("parent", "h2", "h9"),
      event("link", "h3", "h2"),
      event("unlink", "h3", "h1"),
    ]);
    expect(replay.get("h1")).toEqual({ parent: null, links: [] });
    expect(replay.get("h2")?.parent).toBe("h9");
    expect(replay.get("h3")).toEqual({ parent: "h1", links: ["h2"] });
  });
});

describe("session write with stable ids", () => {
  let dir: string;
  let root: string;
  let io: FakeIo;
  const paths = () => projectPaths(root);
  const write = (json: unknown) =>
    sessionWrite({ dir: root }, fakeIo(envFor(dir)), async () => JSON.stringify(json));
  const record = async (): Promise<Session | undefined> => {
    const loaded = await loadSession(root, "s1");
    return loaded.found && loaded.ok ? loaded.data : undefined;
  };

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
    io = fakeIo(envFor(dir));
    await init(root, { name: "p", retention: "keep", language: "auto" }, fakeIo(envFor(dir)));
    const folder = join(envFor(dir).CLAUDE_CONFIG_DIR ?? "", "projects", "proj");
    await mkdir(folder, { recursive: true });
    await writeFile(
      join(folder, "s1.jsonl"),
      [user("first", "2026-10-23T10:01:00.000Z"), user("second", "2026-10-23T10:02:00.000Z")].join(
        "\n",
      ),
    );
  });

  function user(text: string, timestamp: string): string {
    return JSON.stringify({ type: "user", timestamp, message: { role: "user", content: text } });
  }

  const first = () => messageHash("s1", { at: "2026-10-23T10:01:00.000Z", text: "first" });
  const second = () => messageHash("s1", { at: "2026-10-23T10:02:00.000Z", text: "second" });

  it("maps mN to the stable id, keeps the notes, and records the structure", async () => {
    await write({
      sessionId: "s1",
      nodes: [
        { id: "m1", kind: "message", title: "First", summary: "one" },
        { id: "m2", kind: "message", parent: "m1", title: "Second" },
      ],
    });
    const saved = await record();
    expect(saved?.nodes.map((node) => [node.id, node.title])).toEqual([
      [first(), "First"],
      [second(), "Second"],
    ]);
    expect(saved?.nodes[1]?.parent).toBe(first());
    const events = await readEvents(root, "s1");
    // A root needs no event: with a facts file, a message no parent event names
    // is a root, so only the real structure is written.
    expect(events.map((event) => [event.type, event.msg, event.target])).toEqual([
      ["parent", second(), first()],
    ]);
  });

  it("keeps ids when a parent is corrected, and writes no event for an unchanged write", async () => {
    await write({
      sessionId: "s1",
      nodes: [
        { id: "m1", kind: "message", title: "First" },
        { id: "m2", kind: "message", parent: "m1", title: "Second" },
      ],
    });
    const before = await readFile(paths().events("s1"), "utf8");
    const ids = (await record())?.nodes.map((node) => node.id);
    expect(ids).toEqual([first(), second()]);

    // The same input again changes nothing, so no line is appended.
    await write({
      sessionId: "s1",
      nodes: [
        { id: "m1", kind: "message", title: "First" },
        { id: "m2", kind: "message", parent: "m1", title: "Second" },
      ],
    });
    expect(await readFile(paths().events("s1"), "utf8")).toBe(before);

    // Correcting the parent to root keeps both ids and appends one fact.
    await write({
      sessionId: "s1",
      nodes: [{ id: second(), kind: "message", parent: null, title: "Second" }],
    });
    expect((await record())?.nodes.map((node) => node.id)).toEqual([first(), second()]);
    const events = await readEvents(root, "s1");
    expect(events.at(-1)).toMatchObject({ type: "parent", msg: second(), target: null });
    expect(replayEvents(events).get(second())?.parent).toBeNull();
  });

  it("appends link and unlink facts when links change", async () => {
    await write({
      sessionId: "s1",
      nodes: [
        { id: "m1", kind: "message", title: "First" },
        { id: "m2", kind: "message", parent: "m1", title: "Second" },
      ],
    });
    await write({
      sessionId: "s1",
      nodes: [{ id: "m2", kind: "message", links: ["m1"], title: "Second" }],
    });
    expect(replayEvents(await readEvents(root, "s1")).get(second())?.links).toEqual([first()]);
    await write({
      sessionId: "s1",
      nodes: [{ id: "m2", kind: "message", links: [], title: "Second" }],
    });
    const events = await readEvents(root, "s1");
    expect(events.slice(-2).map((event) => [event.type, event.target])).toEqual([
      ["link", first()],
      ["unlink", first()],
    ]);
    expect(replayEvents(events).get(second())?.links).toEqual([]);
  });

  it("seeds an old record's structure before its first change", async () => {
    // A record written before 8.5: labels only, no events file.
    const legacy: Session = {
      schema: 1,
      sessionId: "s1",
      agent: "claude-code",
      title: "old",
      epoch: null,
      startedAt: T0,
      updatedAt: T0,
      status: { goal: "", done: [], pending: [], next: "" },
      nodes: [
        { id: "m1", parent: null, kind: "message", title: "First", at: "2026-10-23T10:01:00.000Z" },
        {
          id: "m2",
          parent: "m1",
          kind: "message",
          title: "Second",
          at: "2026-10-23T10:02:00.000Z",
        },
      ],
    };
    await writeFile(paths().session("s1"), JSON.stringify(legacy));
    await write({
      sessionId: "s1",
      nodes: [{ id: "m2", kind: "message", parent: null, title: "Second" }],
    });
    expect((await record())?.nodes.map((node) => node.id)).toEqual([first(), second()]);
    const events = await readEvents(root, "s1");
    // Both existing facts are seeded, then the correction is appended.
    expect(events.map((event) => [event.type, event.msg, event.target])).toEqual([
      ["parent", first(), null],
      ["parent", second(), first()],
      ["parent", second(), null],
    ]);
    expect(replayEvents(events).get(second())?.parent).toBeNull();
  });
});

describe("migrate ids", () => {
  let dir: string;
  let root: string;
  let io: FakeIo;
  const paths = () => projectPaths(root);

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
    io = fakeIo(envFor(dir));
    await init(root, { name: "p", retention: "keep", language: "auto" }, fakeIo(envFor(dir)));
    const folder = join(envFor(dir).CLAUDE_CONFIG_DIR ?? "", "projects", "proj");
    await mkdir(folder, { recursive: true });
    await writeFile(
      join(folder, "s1.jsonl"),
      [
        JSON.stringify({
          type: "user",
          timestamp: "2026-10-23T10:01:00.000Z",
          message: { role: "user", content: "first" },
        }),
        JSON.stringify({
          type: "user",
          timestamp: "2026-10-23T10:02:00.000Z",
          message: { role: "user", content: "second" },
        }),
      ].join("\n"),
    );
    const legacy: Session = {
      schema: 1,
      sessionId: "s1",
      agent: "claude-code",
      title: "old",
      epoch: null,
      startedAt: T0,
      updatedAt: T0,
      status: { goal: "", done: [], pending: [], next: "" },
      nodes: [
        { id: "m1", parent: null, kind: "message", title: "First", at: "2026-10-23T10:01:00.000Z" },
        {
          id: "m2",
          parent: "m1",
          kind: "message",
          title: "Second",
          at: "2026-10-23T10:02:00.000Z",
          links: ["m1"],
        },
      ],
    };
    await writeFile(paths().session("s1"), JSON.stringify(legacy));
  });

  it("moves an old record to stable ids and facts, keeping a backup", async () => {
    const first = messageHash("s1", { at: "2026-10-23T10:01:00.000Z", text: "first" });
    const second = messageHash("s1", { at: "2026-10-23T10:02:00.000Z", text: "second" });
    const result = await migrateIds(root, io);
    expect(result).toEqual({ migrated: 1, skipped: 0 });
    const loaded = await loadSession(root, "s1");
    expect(loaded.found && loaded.ok && loaded.data.nodes.map((node) => node.id)).toEqual([
      first,
      second,
    ]);
    const events = await readEvents(root, "s1");
    expect(events).toHaveLength(3);
    expect(replayEvents(events).get(second)).toEqual({ parent: first, links: [first] });
    expect(existsSync(paths().backup("backup-pre-8.5/s1.json"))).toBe(true);
    expect(await readFile(paths().backup("backup-pre-8.5/s1.json"), "utf8")).toContain('"m1"');
  });

  it("is idempotent", async () => {
    await migrateIds(root, io);
    const record = await readFile(paths().session("s1"), "utf8");
    const events = await readFile(paths().events("s1"), "utf8");
    const again = await migrateIds(root, io);
    expect(again).toEqual({ migrated: 0, skipped: 1 });
    expect(await readFile(paths().session("s1"), "utf8")).toBe(record);
    expect(await readFile(paths().events("s1"), "utf8")).toBe(events);
  });

  it("leaves unreadable, unmappable and transcript-less records alone", async () => {
    const one = {
      schema: 1,
      sessionId: "s2",
      agent: "claude-code",
      title: "",
      epoch: null,
      startedAt: T0,
      updatedAt: T0,
      status: { goal: "", done: [], pending: [], next: "" },
      nodes: [{ id: "m1", parent: null, kind: "message", title: "One" }],
    };
    await writeFile(paths().session("bad"), "{nope");
    await writeFile(paths().session("s2"), JSON.stringify(one));
    // s3 has a transcript, but its record names a message that is not in it.
    const folder = join(envFor(dir).CLAUDE_CONFIG_DIR ?? "", "projects", "proj");
    await writeFile(
      join(folder, "s3.jsonl"),
      JSON.stringify({
        type: "user",
        timestamp: "2026-10-23T10:01:00.000Z",
        message: { role: "user", content: "one" },
      }),
    );
    await writeFile(
      paths().session("s3"),
      JSON.stringify({ ...one, sessionId: "s3", nodes: [{ ...one.nodes[0], id: "m5" }] }),
    );
    const result = await migrateIds(root, io);
    expect(result).toEqual({ migrated: 1, skipped: 3 });
    expect(io.warnings).toEqual([
      expect.stringMatching(/^session bad: skipped, invalid JSON/),
      expect.stringMatching(/^session s2: no transcript or stored conversation/),
      expect.stringMatching(/^session s3: 1 message\(s\) have no transcript line/),
    ]);
    expect(existsSync(paths().events("s3"))).toBe(false);
  });
});
