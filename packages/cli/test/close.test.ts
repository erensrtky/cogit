import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { ChatTurn } from "../src/agents/types.js";
import { backfillTail } from "../src/commands/backfill.js";
import {
  closePayload,
  closePrompt,
  closeSession,
  deriveParents,
  type Thread,
  threadMembers,
} from "../src/commands/close.js";
import { init } from "../src/commands/init.js";
import { sessionWrite } from "../src/commands/session.js";
import { messageHash } from "../src/messages.js";
import type { Session } from "../src/schema/session.js";
import { readEvents, sideOwnedParents } from "../src/store/events.js";
import { loadSession } from "../src/store/stores.js";
import { envFor, fakeIo, T0, tempDir } from "./helpers.js";

const labels = (n: number) => Array.from({ length: n }, (_, i) => `m${i + 1}`);
const thread = (messages: string, from?: string | null): Thread => ({
  name: messages,
  messages,
  ...(from === undefined ? {} : { from }),
});

describe("threadMembers", () => {
  it("reads ranges and single labels, and drops unknown ones", () => {
    const known = new Set(labels(10));
    expect(threadMembers("m1-m3, m7 m9–m12", known)).toEqual(["m1", "m2", "m3", "m7", "m9", "m10"]);
    expect(threadMembers("nothing here", known)).toEqual([]);
  });
});

describe("deriveParents", () => {
  it("chains a thread, hangs a detour's return from the thread it left", () => {
    // m1-m3 work, m4-m5 a detour, m6-m7 back to the work.
    const parents = deriveParents(labels(7), [thread("m1-m3, m6-m7", null), thread("m4-m5", "m3")]);
    expect(Object.fromEntries(parents)).toEqual({
      m2: "m1",
      m3: "m2",
      m4: "m3",
      m5: "m4",
      m6: "m3",
      m7: "m6",
    });
  });

  it("starts a new thread from its `from`, a root on null, the previous message otherwise", () => {
    const order = labels(5);
    expect(deriveParents(order, [thread("m1-m3"), thread("m4-m5", "m1")]).get("m4")).toBe("m1");
    expect(deriveParents(order, [thread("m1-m3"), thread("m4-m5", null)]).get("m4")).toBeNull();
    // A forward or unknown `from` falls back to the previous message.
    expect(deriveParents(order, [thread("m1-m3"), thread("m4-m5", "m5")]).get("m4")).toBe("m3");
    expect(deriveParents(order, [thread("m1-m3"), thread("m4-m5")]).get("m4")).toBe("m3");
    expect(deriveParents(order, [thread("m1-m3"), thread("m4-m5", "s0:m2")]).get("m4")).toBe("m2");
  });

  it("keeps the previous message for a message no thread names", () => {
    expect(deriveParents(labels(3), [thread("m1")]).get("m3")).toBe("m2");
  });
});

const turn = (n: number, extra: Partial<ChatTurn> = {}): ChatTurn => ({
  id: `m${n}`,
  label: `m${n}`,
  hash: `h${n}`,
  at: `2026-10-23T10:0${n}:00.000Z`,
  text: `message ${n}`,
  replies: [`reply ${n}`],
  tools: { commands: 0, files: [], other: 0 },
  ...extra,
});

function session(nodes: Partial<Session["nodes"][number]>[]): Session {
  return {
    schema: 1,
    sessionId: "s1",
    agent: "claude-code",
    title: "",
    startedAt: T0,
    updatedAt: T0,
    status: { goal: "", done: [], pending: [], next: "" },
    nodes: nodes.map((n) => ({ parent: null, kind: "message", title: "t", ...n }) as never),
  };
}

describe("closePrompt", () => {
  it("lists every message with its current parent, actions, gaps and the candidates", () => {
    const turns = [
      turn(1),
      turn(2, {
        at: "2026-10-23T11:00:00.000Z",
        tools: { commands: 1, files: ["a.ts"], other: 0, steps: ["Run the tests"] },
      }),
    ];
    const prompt = closePrompt(
      turns,
      session([
        { id: "h1", title: "First" },
        { id: "h2", title: "Second", parent: "h1" },
      ]),
      {
        language: "auto",
        status: false,
        candidates: [
          {
            sessionId: "s0",
            title: "Before",
            updatedAt: T0,
            leftOff: "Release waits",
            branches: [{ title: "Release", first: "h9", last: { id: "h10", title: "Tag it" } }],
            messages: [{ id: "h10", title: "Tag it" }],
          },
        ],
      },
    );
    expect(prompt).toContain("### m2 · 2026-10-23T11:00:00.000Z · gap 59 min · current parent=m1");
    expect(prompt).toContain("title: Second");
    expect(prompt).toContain("STEPS: Run the tests");
    expect(prompt).toContain("FILES EDITED: a.ts");
    expect(prompt).toContain('- s0 "Before" (' + T0 + "): Release waits");
    expect(prompt).toContain("· Release → s0:h10");
    expect(prompt).toContain('"continues": null');
    expect(prompt).not.toContain('"status"');
    expect(
      closePrompt(turns, session([]), { language: "Turkish", status: true, candidates: [] }),
    ).toContain('"status": {"goal"');
  });
});

describe("closePayload", () => {
  const turns = [turn(1), turn(2), turn(3), turn(4)];
  const record = session([
    { id: "h1", title: "One" },
    { id: "h2", title: "Two", parent: "h1" },
    { id: "h3", title: "Three", parent: "h2" },
    { id: "h4", title: "Four", parent: "h3" },
  ]);
  const summary = { asked: "asked", outcome: "outcome", open: "" };

  it("sends only changed parents, a summary on each thread's first message and leftOff", () => {
    const payload = closePayload(
      {
        threads: [
          { name: "Work", messages: "m1-m2, m4", from: null, ...summary },
          { name: "Detour", messages: "m3", from: "m2", ...summary, asked: "" },
          "not a thread",
        ],
        leftOff: "  Work done, detour open  ",
        status: { goal: "g" },
      },
      turns,
      record,
      { status: false },
    );
    expect(payload).toEqual({
      sessionId: "s1",
      leftOff: "Work done, detour open",
      nodes: [
        {
          id: "m1",
          kind: "message",
          title: "One",
          branch: { title: "Work", asked: "asked", outcome: "outcome", open: "" },
        },
        // The detour's summary has no "asked", so it is left out.
        { id: "m4", kind: "message", title: "Four", parent: "m2" },
      ],
    });
  });

  it("hangs a root first message from an earlier session and keeps a valid status", () => {
    const payload = closePayload(
      {
        threads: [],
        continues: "s0:h10",
        status: { goal: "g", done: [], pending: [], next: "n" },
      },
      turns,
      record,
      { status: true },
    );
    expect(payload.nodes).toEqual([{ id: "m1", kind: "message", title: "One", parent: "s0:h10" }]);
    expect(payload.status).toEqual({ goal: "g", done: [], pending: [], next: "n" });
    expect(
      closePayload({ continues: "h10", status: { pending: "x" } }, turns, record, { status: true }),
    ).toEqual({ sessionId: "s1", nodes: [] });
  });
});

describe("sideOwnedParents", () => {
  it("counts a side-added root without a parent event as the side model's", () => {
    const nodes = session([
      { id: "a", by: { title: "side" } },
      { id: "b" },
      { id: "c", by: { title: "side" } },
    ]).nodes;
    const owned = sideOwnedParents(
      [{ at: T0, type: "parent", msg: "c", target: "a", by: "agent" }],
      nodes,
    );
    expect([...owned]).toEqual(["a"]);
  });
});

describe("backfill --tail --close", () => {
  let dir: string;
  let root: string;
  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
  });

  it("has nothing to close without a record or a recorded message", async () => {
    const env = envFor(dir);
    await init(root, { name: "proj", retention: "keep", language: "auto" }, fakeIo(env));
    const io = fakeIo(env);
    await closeSession(root, "s1", io);
    expect(io.lines).toContain("session s1 has no record to close");

    const folder = join(env.CLAUDE_CONFIG_DIR ?? "", "projects", "proj");
    await mkdir(folder, { recursive: true });
    await writeFile(
      join(folder, "s1.jsonl"),
      `${JSON.stringify({ type: "user", timestamp: T0, message: { role: "user", content: "hi" } })}\n`,
    );
    await sessionWrite({ dir: root }, fakeIo(env), async () =>
      JSON.stringify({ sessionId: "s1", nodes: [{ id: "topic", kind: "phase", title: "Topic" }] }),
    );
    await closeSession(root, "s1", io);
    expect(io.lines).toContain("session s1 has no recorded message to close");
  });

  it("rewires a side-recorded session from its threads and saves where it left off", async () => {
    const bin = join(dir, "bin");
    await mkdir(bin, { recursive: true });
    const answer = JSON.stringify({
      threads: [
        { name: "Work", messages: "m1-m2, m4", from: null, asked: "a", outcome: "o", open: "" },
        { name: "Detour", messages: "m3", from: "m2", asked: "a", outcome: "o", open: "x" },
      ],
      leftOff: "Work done; the detour is open",
    });
    await writeFile(
      join(bin, "claude"),
      `#!/usr/bin/env node
let input = "";
process.stdin.on("data", (c) => { input += c; });
process.stdin.on("end", async () => {
  (await import("node:fs")).writeFileSync(${JSON.stringify(join(dir, "prompt.txt"))}, input);
  process.stdout.write(JSON.stringify({ result: ${JSON.stringify(answer)} }));
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
      `${[1, 2, 3, 4].map((m) => JSON.stringify(typed(m))).join("\n")}\n`,
    );
    // The periodic side run chained everything to the previous message.
    await sessionWrite({ dir: root, by: "side" }, fakeIo(env), async () =>
      JSON.stringify({
        sessionId: "s1",
        nodes: [1, 2, 3, 4].map((m) => ({
          id: `m${m}`,
          kind: "message",
          title: `T${m}`,
          parent: m === 1 ? null : `m${m - 1}`,
        })),
      }),
    );

    await backfillTail(root, "s1", fakeIo(env), { close: true });
    const loaded = await loadSession(root, "s1");
    const saved = loaded.found && loaded.ok ? loaded.data : undefined;
    const h = (m: number) => messageHash("s1", { at: at(m), text: `message ${m}` });
    expect(saved?.leftOff).toBe("Work done; the detour is open");
    expect(saved?.nodes.find((n) => n.id === h(1))?.branch?.title).toBe("Work");
    expect(saved?.nodes.find((n) => n.id === h(3))?.branch?.open).toBe("x");
    const events = await readEvents(root, "s1");
    expect(events.at(-1)).toMatchObject({ type: "parent", msg: h(4), target: h(2), by: "side" });
    expect(await readFile(join(dir, "prompt.txt"), "utf8")).toContain(
      "Split the session into threads",
    );
  });
});
