import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  agentRecord,
  backfillTail,
  catchUpPrompt,
  headlessEnv,
  resultText,
} from "../src/commands/backfill.js";
import { init } from "../src/commands/init.js";
import { sessionWrite } from "../src/commands/session.js";
import { messageHash } from "../src/messages.js";
import type { Session } from "../src/schema/session.js";
import { projectPaths } from "../src/store/paths.js";
import { loadSession } from "../src/store/stores.js";
import type { ChatTurn } from "../src/transcript.js";
import { envFor, fakeIo, T0, tempDir } from "./helpers.js";

let dir: string;
let root: string;

beforeEach(async () => {
  dir = await tempDir();
  root = join(dir, "proj");
  await mkdir(root);
});

/** A transcript for session s1, under the fake Claude home. */
async function transcript(lines: unknown[]): Promise<void> {
  const folder = join(envFor(dir).CLAUDE_CONFIG_DIR ?? "", "projects", "proj");
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "s1.jsonl"), `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`);
}

const typed = (text: string, minute: number) => ({
  type: "user",
  timestamp: `2026-10-23T10:0${minute}:00.000Z`,
  message: { role: "user", content: text },
});

/** Puts a fake `claude` first on PATH and returns the env that finds it. */
async function fakeClaude(script: string, path: string): Promise<NodeJS.ProcessEnv> {
  const bin = join(path, "bin");
  await mkdir(bin, { recursive: true });
  const file = join(bin, "claude");
  await writeFile(file, `#!/usr/bin/env node\n${script}\n`);
  await chmod(file, 0o755);
  return { ...envFor(dir), PATH: `${bin}:${process.env.PATH ?? ""}` };
}

/** Reads stdin, keeps the prompt for inspection and prints a result envelope. */
function printing(result: string): string {
  return `
process.stdin.setEncoding("utf8");
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", async () => {
  const fs = await import("node:fs");
  fs.writeFileSync(${JSON.stringify(join(dir, "prompt.txt"))}, input);
  process.stdout.write(JSON.stringify({ type: "result", subtype: "success", result: ${JSON.stringify(result)} }));
});`;
}

const GOOD = JSON.stringify({
  status: { goal: "Ship 4.7", done: [], pending: [], next: "release" },
  nodes: [
    { id: "topic", kind: "phase", parent: null, title: "Catch-up" },
    { id: "m2", kind: "message", parent: "topic", title: "Second", summary: "Recorded it" },
  ],
});

async function initialized(env: NodeJS.ProcessEnv): Promise<void> {
  await init(root, { name: "proj", retention: "keep", language: "auto" }, fakeIo(env));
}

const record = async (): Promise<Session | undefined> => {
  const loaded = await loadSession(root, "s1");
  return loaded.found && loaded.ok ? loaded.data : undefined;
};

describe("catchUpPrompt", () => {
  const turn: ChatTurn = {
    id: "m7",
    at: T0,
    text: "x".repeat(2000),
    replies: [],
    tools: { commands: 0, files: [], other: 0 },
  };

  it("includes the rules, a cut message and an empty record", () => {
    const prompt = catchUpPrompt([turn], undefined, "s1", "Turkish");
    expect(prompt).toContain("The record has no nodes yet.");
    expect(prompt).toContain("titles and text in Turkish");
    expect(prompt).toContain("(no written reply)");
    expect(prompt).toContain("…");
    expect(prompt).toContain('{"sessionId": "s1", "nodes": [...]');
  });

  it("asks for a message summary only when the setting says so", () => {
    const off = catchUpPrompt([turn], undefined, "s1", "auto");
    expect(off).not.toContain("summary: one or two sentences");
    const on = catchUpPrompt([turn], undefined, "s1", "auto", true);
    expect(on).toContain("summary: one or two sentences");
  });

  it("lists the existing topics, the replies and the tool counts", () => {
    const prompt = catchUpPrompt(
      [{ ...turn, replies: ["ok"], tools: { commands: 1, files: ["a.ts"], other: 2 } }],
      {
        schema: 1,
        sessionId: "s1",
        agent: "claude-code",
        title: "",
        epoch: null,
        startedAt: T0,
        updatedAt: T0,
        status: { goal: "", done: [], pending: [], next: "" },
        nodes: [{ id: "topic", parent: null, kind: "phase", title: "Topic" }],
      },
      "s1",
      "auto",
    );
    expect(prompt).toContain("parent=null: Topic");
    expect(prompt).toContain("AGENT: ok");
    expect(prompt).toContain("1 command(s), 1 file(s) edited, 2 other tool call(s)");
    expect(prompt).toContain("the conversation's language");
  });
});

describe("headless output", () => {
  it("reads the result text out of the envelope", () => {
    expect(resultText(JSON.stringify({ result: "x" }))).toBe("x");
    expect(() => resultText("nope")).toThrow(/valid JSON/);
    expect(() => resultText("{}")).toThrow(/no result text/);
  });

  it("accepts an object, with or without a code fence, and rejects the rest", () => {
    expect(agentRecord('{"a":1}')).toEqual({ a: 1 });
    expect(agentRecord('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => agentRecord("not json")).toThrow(/JSON record/);
    expect(() => agentRecord("[1]")).toThrow(/JSON object/);
  });

  it("turns capture off in the headless run", () => {
    expect(headlessEnv({ PATH: "/bin" })).toMatchObject({
      PATH: "/bin",
      CODELINEAGE_DISABLE: "1",
    });
  });
});

describe("backfill --tail", () => {
  it("records the missing messages through session write and rebuilds the map", async () => {
    const env = await fakeClaude(printing(GOOD), dir);
    await initialized(env);
    await transcript([typed("first", 1), typed("second", 2)]);
    await sessionWrite({ dir: root }, fakeIo(env), async () =>
      JSON.stringify({ sessionId: "s1", nodes: [{ id: "m1", kind: "message", title: "First" }] }),
    );

    const io = fakeIo(env);
    await backfillTail(root, "s1", io);
    const saved = await record();
    const first = messageHash("s1", { at: "2026-10-23T10:01:00.000Z", text: "first" });
    const second = messageHash("s1", { at: "2026-10-23T10:02:00.000Z", text: "second" });
    expect(saved?.nodes.map((n) => n.id)).toEqual(expect.arrayContaining([first, "topic", second]));
    // The time comes from the transcript, not from the agent.
    expect(saved?.nodes.find((n) => n.id === second)).toMatchObject({
      at: "2026-10-23T10:02:00.000Z",
      summary: "Recorded it",
    });
    expect(io.lines).toContain("Saved session s1 (3 nodes)");

    const prompt = await readFile(join(dir, "prompt.txt"), "utf8");
    expect(prompt).toContain("USER: second");
    expect(prompt).toContain('"sessionId": "s1"');
    expect(prompt).toContain(`- ${first} (message) parent=null: First`);
    expect(prompt).toContain("the conversation's language");
  });

  it("does nothing when there is no transcript or nothing missing", async () => {
    const env = envFor(dir);
    await initialized(env);
    const io = fakeIo(env);
    await backfillTail(root, "s1", io);
    expect(io.lines).toEqual(["session s1 has nothing to catch up"]);

    await transcript([typed("first", 1)]);
    await sessionWrite({ dir: root }, fakeIo(env), async () =>
      JSON.stringify({ sessionId: "s1", nodes: [{ id: "m1", kind: "message", title: "First" }] }),
    );
    const again = fakeIo(env);
    await backfillTail(root, "s1", again);
    expect(again.lines).toEqual(["session s1 has nothing to catch up"]);
  });

  it("exits quietly when another catch-up holds the session lock", async () => {
    const env = envFor(dir);
    await initialized(env);
    await transcript([typed("first", 1)]);
    const lock = projectPaths(root).lock("session-s1");
    await mkdir(lock, { recursive: true });
    await writeFile(join(lock, "owner"), String(process.pid));

    const io = fakeIo(env);
    await backfillTail(root, "s1", io);
    expect(io.lines).toEqual(["catch-up already running for s1"]);
    expect(await record()).toBeUndefined();
  });

  it("rejects an answer that is not a JSON record and leaves the record alone", async () => {
    const env = await fakeClaude(printing("not json"), dir);
    await initialized(env);
    await transcript([typed("first", 1)]);
    await expect(backfillTail(root, "s1", fakeIo(env))).rejects.toThrow(/JSON record/);
    expect(await record()).toBeUndefined();
  });

  it("reports a failed headless run with its stderr and keeps the record", async () => {
    const env = await fakeClaude('process.stderr.write("boom"); process.exit(3);', dir);
    await initialized(env);
    await transcript([typed("first", 1)]);
    await expect(backfillTail(root, "s1", fakeIo(env))).rejects.toThrow(
      /claude exited with 3: boom/,
    );
    expect(await record()).toBeUndefined();
  });

  it("reports a missing claude binary", async () => {
    const empty = join(dir, "empty");
    await mkdir(empty);
    const env = { ...envFor(dir), PATH: empty };
    await initialized(env);
    await transcript([typed("first", 1)]);
    await expect(backfillTail(root, "s1", fakeIo(env))).rejects.toThrow(/could not run claude/);
  });

  it("refuses an uninitialized or unreadable project", async () => {
    const env = envFor(dir);
    await expect(backfillTail(root, "s1", fakeIo(env))).rejects.toThrow(/not initialized/);
    await mkdir(join(root, ".codelineage"), { recursive: true });
    await writeFile(join(root, ".codelineage", "project.json"), "{nope");
    await expect(backfillTail(root, "s1", fakeIo(env))).rejects.toThrow(/invalid JSON/);
  });

  it("propagates a lock that cannot be created", async () => {
    const env = envFor(dir);
    await initialized(env);
    await transcript([typed("first", 1)]);
    await rm(projectPaths(root).locks, { recursive: true, force: true });
    await writeFile(projectPaths(root).locks, "not a directory");
    await expect(backfillTail(root, "s1", fakeIo(env))).rejects.toThrow();
  });
});
