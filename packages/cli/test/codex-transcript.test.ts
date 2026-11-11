import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  codexHome,
  collectTranscriptIds,
  collectTranscripts,
  countUserLines,
  displayTurn,
  excerpt,
  findTranscript,
  hasZstd,
  isHeadlessTranscript,
  readConversation,
  readForkOrigin,
  readLastTurn,
  readSessionCwd,
  readSessionModel,
  readsHandoff,
  unreadableTranscripts,
} from "../src/agents/codex/transcripts.js";
import { tempDir } from "./helpers.js";

/** Real Codex 0.167.1 rollouts, trimmed and anonymised (see fixtures/codex). */
const FIXTURES = join(import.meta.dirname, "fixtures", "codex");
const TOOLS_ID = "01a1ccda-328f-79b2-8b47-8e0b8167fae8";
const FORK_ID = "01a1ccda-8c04-7390-8517-07dd3d20ef5f";
const TUI_ID = "01a1ccb2-fb86-7900-b52a-d1175d7d1ec9";
const EMPTY_ID = "01a1ccb2-71d9-7a60-b57e-40e1929db75f";

const fixture = (name: string) => join(FIXTURES, name);
const rolloutName = (id: string, ext = "jsonl") => `rollout-2026-11-12T02-03-34-${id}.${ext}`;

/** A Codex home holding the fixtures under their real names; returns the home and the env. */
async function codexHomeWithFixtures() {
  const home = await tempDir();
  const day = join(home, "sessions", "2026", "11", "12");
  await mkdir(day, { recursive: true });
  const files = {
    tools: join(day, rolloutName(TOOLS_ID)),
    fork: join(day, rolloutName(FORK_ID)),
    tui: join(day, rolloutName(TUI_ID)),
    empty: join(day, rolloutName(EMPTY_ID)),
  };
  await copyFile(fixture("exec-tools.jsonl"), files.tools);
  await copyFile(fixture("exec-fork.jsonl"), files.fork);
  await copyFile(fixture("tui-probe.jsonl"), files.tui);
  await copyFile(fixture("tui-empty.jsonl"), files.empty);
  return { home, day, files, env: { CODEX_HOME: home } };
}

const at = (s: number) => `2026-11-12T10:00:${String(s).padStart(2, "0")}.000Z`;
const meta = (payload: Record<string, unknown>) =>
  JSON.stringify({ timestamp: at(0), type: "session_meta", payload });
/** An `item_completed` event as Codex writes it. */
const item = (s: number, value: Record<string, unknown>) =>
  JSON.stringify({
    timestamp: at(s),
    type: "event_msg",
    payload: { type: "item_completed", item: value },
  });
const userItem = (s: number, text: string) =>
  item(s, { type: "UserMessage", id: `u${s}`, content: [{ type: "text", text }] });
const agentItem = (s: number, text: string) =>
  item(s, { type: "AgentMessage", id: `a${s}`, content: [{ type: "Text", text }] });

async function rollout(dir: string, id: string, lines: string[]): Promise<string> {
  const file = join(dir, rolloutName(id));
  await writeFile(file, `${lines.join("\n")}\n`);
  return file;
}

describe("finding Codex rollouts", () => {
  it("uses CODEX_HOME, else ~/.codex", () => {
    expect(codexHome({ CODEX_HOME: "/x" })).toBe("/x");
    expect(codexHome({})).toMatch(/\.codex$/);
  });

  it("collects sessions and archived sessions by id, and finds one", async () => {
    const { home, files, env } = await codexHomeWithFixtures();
    await mkdir(join(home, "archived_sessions"), { recursive: true });
    const archivedId = "01a1cc00-0000-7000-8000-000000000001";
    await copyFile(
      fixture("tui-empty.jsonl"),
      join(home, "archived_sessions", rolloutName(archivedId)),
    );
    await writeFile(join(home, "sessions", "notes.jsonl"), "");

    const found = await collectTranscripts(env);
    expect([...found.keys()].sort()).toEqual(
      [TUI_ID, EMPTY_ID, archivedId, TOOLS_ID, FORK_ID].sort(),
    );
    expect(await collectTranscriptIds(env)).toEqual(new Set(found.keys()));
    expect(await findTranscript(TOOLS_ID, env)).toBe(files.tools);
    expect(await findTranscript("missing", env)).toBeNull();
    expect(await collectTranscripts({ CODEX_HOME: join(home, "nowhere") })).toEqual(new Map());
  });

  it("reads compressed rollouts when Node has zstd, and lists them as unreadable when not", async () => {
    expect(hasZstd()).toBe(
      typeof (zlib as { zstdCompressSync?: unknown }).zstdCompressSync === "function",
    );
    const { day, env } = await codexHomeWithFixtures();
    const id = "01a1cc00-0000-7000-8000-000000000002";
    const zst = join(day, rolloutName(id, "jsonl.zst"));
    await writeFile(zst, "not read");

    expect((await collectTranscripts(env, true)).get(id)).toBe(zst);
    expect((await collectTranscripts(env, false)).has(id)).toBe(false);
    expect(await unreadableTranscripts(env, false)).toEqual([zst]);
    expect(await unreadableTranscripts(env, true)).toEqual([]);

    // Both copies while Codex compresses: the plain one wins, whatever order they come in.
    const plain = await rollout(day, id, [meta({ id })]);
    expect((await collectTranscripts(env, true)).get(id)).toBe(plain);
  });

  it.skipIf(!hasZstd())(
    "reads a compressed rollout, also when the plain one was compressed since",
    async () => {
      const { day, files } = await codexHomeWithFixtures();
      const compress = (zlib as unknown as { zstdCompressSync: (b: Buffer) => Buffer })
        .zstdCompressSync;
      await writeFile(`${files.tools}.zst`, compress(await readFile(files.tools)));
      const expected = await readConversation(files.tools);
      await rm(files.tools);

      expect(await readConversation(`${files.tools}.zst`)).toEqual(expected);
      expect(await readConversation(files.tools)).toEqual(expected);
      expect(await readLastTurn(`${files.tools}.zst`)).toEqual(
        await readLastTurnOf("exec-tools.jsonl"),
      );
      await expect(readConversation(join(day, "gone.jsonl"))).rejects.toThrow();
    },
  );
});

const readLastTurnOf = (name: string) => readLastTurn(fixture(name));

describe("readConversation", () => {
  it("reads a headless run: messages, replies, commands, and a resume", async () => {
    const turns = await readConversation(fixture("exec-tools.jsonl"));
    expect(turns).toEqual([
      {
        id: "m1",
        at: "2026-11-11T23:03:39.043Z",
        uuid: "01a1ccda-4523-70b0-91cb-46859c28ef7d",
        text: "Create a file named notes.txt containing the line 'hello cogit', then run 'wc -l notes.txt' in the shell and tell me the result in one sentence.",
        replies: [
          "I’ll create the file and run the requested line count.",
          "`wc -l notes.txt` returned `1 notes.txt`.",
        ],
        tools: { commands: 1, files: [], other: 0 },
      },
      expect.objectContaining({
        id: "m2",
        text: "Run 'cat notes.txt' and reply with its first word only.",
        resumed: true,
        replies: ["I’ll read the file and return only its first word.", "hello"],
        tools: { commands: 1, files: [], other: 0 },
      }),
    ]);
  });

  it("reads a fork's own messages and the files it changed", async () => {
    expect(await readConversation(fixture("exec-fork.jsonl"))).toEqual([
      expect.objectContaining({
        id: "m1",
        text: "Use the apply_patch tool (not the shell) to add a second line 'second line' to notes.txt. Reply with one word: done.",
        replies: ["done"],
        tools: { commands: 0, files: ["/work/probe/notes.txt"], other: 0 },
      }),
    ]);
  });

  it("leaves Codex's own context and hook context out of the messages", async () => {
    const turns = await readConversation(fixture("tui-probe.jsonl"));
    expect(turns.map((t) => [t.text, t.replies])).toEqual([
      ["What is the secret probe word? Answer with the word only.", ["PELICAN-7"]],
    ]);
    expect(await countUserLines(fixture("tui-probe.jsonl"))).toBe(2);
    expect(await readConversation(fixture("tui-empty.jsonl"))).toEqual([]);
    expect(await countUserLines(fixture("tui-empty.jsonl"))).toBe(0);
  });

  it("counts other tools, renamed files and images, and skips what is not a message", async () => {
    const dir = await tempDir();
    const file = await rollout(dir, "x", [
      meta({ id: "x" }),
      agentItem(1, "before any message"),
      `{"type":"event_msg","item_completed" broken`,
      JSON.stringify({
        timestamp: at(1),
        type: "event_msg",
        payload: { type: "item_completed", item: null },
      }),
      userItem(2, "   "),
      item(3, {
        type: "UserMessage",
        id: "u3",
        content: [{ type: "local_image", path: "/p.png" }],
      }),
      item(4, { type: "McpToolCall", id: "t4" }),
      item(4, { type: "Reasoning", id: "r4" }),
      item(5, {
        type: "FileChange",
        changes: { "/w/a.ts": { type: "update", move_path: "/w/b.ts" }, "/w/c.ts": {} },
      }),
      item(5, { type: "FileChange", changes: { "/w/a.ts": { type: "update" } } }),
      item(6, { type: "FileChange" }),
      agentItem(7, " "),
    ]);
    expect(await readConversation(file)).toEqual([
      {
        id: "m1",
        at: at(3),
        uuid: "u3",
        text: "[image]",
        replies: [],
        tools: { commands: 0, files: ["/w/a.ts", "/w/b.ts", "/w/c.ts"], other: 1 },
      },
    ]);
  });
});

describe("readForkOrigin", () => {
  it("names the origin and its last message before the fork, not a later one", async () => {
    const { files } = await codexHomeWithFixtures();
    expect(await readForkOrigin(files.fork)).toEqual({
      sessionId: TOOLS_ID,
      copied: 0,
      last: {
        uuid: "01a1ccda-4523-70b0-91cb-46859c28ef7d",
        at: "2026-11-11T23:03:39.043Z",
        text: "Create a file named notes.txt containing the line 'hello cogit', then run 'wc -l notes.txt' in the shell and tell me the result in one sentence.",
      },
    });
    expect(await readForkOrigin(files.tools)).toBeNull();
  });

  it("goes back through a fork made before anyone typed, and gives up on a missing or endless chain", async () => {
    const { day, files } = await codexHomeWithFixtures();
    const second = await rollout(day, "01a1cc00-0000-7000-8000-00000000000a", [
      meta({ id: "a", forked_from_id: FORK_ID, history_base: { end_ordinal_exclusive: 1 } }),
    ]);
    expect((await readForkOrigin(second))?.sessionId).toBe(TOOLS_ID);

    const whole = await rollout(day, "01a1cc00-0000-7000-8000-00000000000b", [
      meta({ id: "b", forked_from_id: TOOLS_ID }),
    ]);
    expect((await readForkOrigin(whole))?.last.text).toBe(
      "Run 'cat notes.txt' and reply with its first word only.",
    );

    const loopId = "01a1cc00-0000-7000-8000-00000000000c";
    const loop = await rollout(day, loopId, [
      meta({ id: loopId, forked_from_id: loopId, forked_from_ordinal_exclusive: 0 }),
    ]);
    expect(await readForkOrigin(loop)).toBeNull();

    const orphan = await rollout(day, "01a1cc00-0000-7000-8000-00000000000d", [
      meta({ id: "d", forked_from_id: "gone" }),
    ]);
    expect(await readForkOrigin(orphan)).toBeNull();
    // Outside a Codex home there is nowhere to look for the origin.
    expect(await readForkOrigin(fixture("exec-fork.jsonl"))).toBeNull();
    expect(files.fork).toContain(day);
  });
});

describe("session facts", () => {
  it("reads the directory, the model and whether a person typed", async () => {
    expect(await readSessionCwd(fixture("exec-tools.jsonl"))).toBe("/work/probe");
    expect(await readSessionCwd(fixture("missing.jsonl"))).toBeUndefined();
    expect(await readSessionModel(fixture("exec-tools.jsonl"))).toBe("gpt-6-luna");
    expect(await readSessionModel(fixture("tui-empty.jsonl"))).toBeUndefined();
    expect(await readSessionModel(fixture("missing.jsonl"))).toBeUndefined();
    expect(await isHeadlessTranscript(fixture("exec-tools.jsonl"))).toBe(true);
    expect(await isHeadlessTranscript(fixture("tui-probe.jsonl"))).toBe(false);

    const dir = await tempDir();
    const noMeta = await rollout(dir, "y", [agentItem(1, "x")]);
    const empty = await rollout(dir, "z", []);
    await writeFile(empty, "");
    expect(await readSessionCwd(noMeta)).toBeUndefined();
    expect(await isHeadlessTranscript(empty)).toBe(false);
  });

  it("notices a handoff file read by a shell command", async () => {
    const dir = await tempDir();
    const reads = await rollout(dir, "h", [
      userItem(1, "read the handoff"),
      item(2, { type: "CommandExecution", command: ["/bin/bash", "-lc", "cat docs/handoff.md"] }),
    ]);
    const mentions = await rollout(dir, "m", [
      userItem(1, "read the handoff"),
      agentItem(2, "handoff?"),
    ]);
    expect(await readsHandoff(reads)).toBe(true);
    expect(await readsHandoff(mentions)).toBe(false);
    expect(await readsHandoff(fixture("exec-tools.jsonl"))).toBe(false);
  });
});

describe("readLastTurn", () => {
  it("says who spoke last", async () => {
    expect(await readLastTurnOf("exec-tools.jsonl")).toEqual({
      speaker: "agent",
      at: expect.any(String),
      text: "hello",
    });
    expect(await readLastTurnOf("tui-empty.jsonl")).toBeNull();

    const dir = await tempDir();
    const waiting = await rollout(dir, "w", [
      userItem(1, "a"),
      agentItem(2, "b"),
      userItem(3, "c"),
    ]);
    expect(await readLastTurn(waiting)).toEqual({ speaker: "user", at: at(3), text: "" });
  });

  it("walks back past a long tail to the newest message", async () => {
    const dir = await tempDir();
    const padding = JSON.stringify({
      type: "event_msg",
      payload: { type: "x", out: "z".repeat(600_000) },
    });
    const file = await rollout(dir, "t", [userItem(1, "a"), agentItem(2, "answer"), padding]);
    expect(await readLastTurn(file)).toEqual({ speaker: "agent", at: at(2), text: "answer" });
    const none = await rollout(dir, "n", [agentItem(1, "x"), padding]);
    expect(await readLastTurn(none)).toBeNull();
  });
});

describe("display", () => {
  it("trims the text and shows edited files relative to the project", async () => {
    const [turn] = await readConversation(fixture("exec-fork.jsonl"));
    const shown = displayTurn({ ...(turn as NonNullable<typeof turn>), text: "  hi \n" }, [
      "/work/probe",
    ]);
    expect(shown.text).toBe("hi");
    expect(shown.tools.files).toEqual(["notes.txt"]);
  });

  it("makes a one-line excerpt cut at the limit", () => {
    expect(excerpt("a\n  b")).toBe("a b");
    expect(excerpt("abcdef", 4)).toBe("abc…");
  });
});
