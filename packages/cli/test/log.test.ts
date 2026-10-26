import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { init } from "../src/commands/init.js";
import {
  branchesOf,
  buildLog,
  formatLog,
  formatShow,
  loadEffectiveSessions,
  log,
  resolveRef,
  shortHash,
  show,
  stamp,
} from "../src/commands/log.js";
import { createProgram, positiveCount } from "../src/program.js";
import type { Session } from "../src/schema/session.js";
import { appendConversationTurns } from "../src/store/conversations.js";
import { projectPaths } from "../src/store/paths.js";
import { envFor, type FakeIo, fakeIo, T0, tempDir } from "./helpers.js";

/** Four stable message ids; the first two share six hex characters on purpose. */
const A = "h111111111111";
const B = "h111111222222";
const C = "h222222222222";
const D = "h333333333333";

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

describe("cogit log and show", () => {
  let dir: string;
  let root: string;
  let io: FakeIo;

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
    io = fakeIo(envFor(dir));
    await init(root, { name: "proj", retention: "keep", language: "auto" }, fakeIo(envFor(dir)));

    const s1 = session({
      sessionId: "s1",
      title: "Ship the parser",
      author: "Eren",
      epoch: "e8",
      startedAt: "2026-10-20T09:00:00.000Z",
      updatedAt: "2026-10-20T10:00:00.000Z",
      nodes: [
        {
          id: A,
          parent: null,
          kind: "message",
          title: "Start the parser",
          at: "2026-10-20T09:00:00.000Z",
          branch: { title: "Parser", asked: "How to read a file?", outcome: "It reads.", open: "" },
        },
        {
          id: B,
          parent: A,
          kind: "message",
          title: "Fix the loop",
          at: "2026-10-20T09:30:00.000Z",
          links: [A],
          commits: ["abc1234"],
          files: ["src/app.ts"],
          decidedBy: "user",
          why: "The loop ate one line.",
          alternatives: [{ option: "Keep the loop", why: "It loses data." }],
          work: ["Rewrote the loop"],
          agentDecisions: [
            {
              title: "Kept the parser",
              why: "It works.",
              alternatives: [{ option: "Rewrite", why: "Too slow." }],
            },
          ],
        },
        {
          id: C,
          parent: B,
          kind: "message",
          title: "Ship it",
          summary: "Shipped the parser.",
          at: "2026-10-20T10:00:00.000Z",
        },
      ],
    });
    const s2 = session({
      sessionId: "s2",
      title: "Later chat",
      startedAt: "2026-10-21T10:00:00.000Z",
      updatedAt: "2026-10-21T10:10:00.000Z",
      nodes: [
        {
          id: D,
          parent: "s1:h111111111111",
          kind: "message",
          title: "Continue the parser",
          at: "2026-10-21T10:00:00.000Z",
          branch: { title: "Next", asked: "What next?", outcome: "More parsing.", open: "Tests" },
        },
      ],
    });
    await writeFile(projectPaths(root).session("s1"), JSON.stringify(s1));
    await writeFile(projectPaths(root).session("s2"), JSON.stringify(s2));
    // A session with no messages yet: the log still shows its header.
    await writeFile(
      projectPaths(root).session("old"),
      JSON.stringify(
        session({
          sessionId: "old",
          title: "Empty chat",
          startedAt: "2026-10-19T08:00:00.000Z",
          updatedAt: "2026-10-19T08:00:00.000Z",
        }),
      ),
    );
    // The stored conversation outlives the transcript, which no test has.
    await appendConversationTurns(root, "s1", [
      {
        id: "m1",
        uuid: "u1",
        hash: A,
        at: "2026-10-20T09:00:00.000Z",
        text: "Start the parser",
        replies: ["On it."],
        tools: { commands: 2, files: ["src/app.ts"], other: 0 },
      },
      {
        id: "m2",
        uuid: "u2",
        hash: B,
        at: "2026-10-20T09:30:00.000Z",
        text: "Fix the loop",
        replies: [],
        tools: { commands: 0, files: [], other: 0 },
      },
    ]);
  });

  async function effective() {
    return loadEffectiveSessions(root, io);
  }

  it("shows a short hash, a prefix and a session:mN ref", () => {
    expect(shortHash(A)).toBe("h1111111");
  });

  it("resolves full hashes, unique prefixes and session labels", async () => {
    const sessions = await effective();
    const full = resolveRef(sessions, A);
    expect(full.kind).toBe("ok");
    if (full.kind !== "ok") return;
    expect(full.hit.message.label).toBe("m1");
    expect(full.hit.session.sessionId).toBe("s1");

    const prefix = resolveRef(sessions, "h222222");
    expect(prefix.kind).toBe("ok");
    if (prefix.kind === "ok") expect(prefix.hit.message.title).toBe("Ship it");

    const sessionLabel = resolveRef(sessions, "s1:m2");
    expect(sessionLabel.kind).toBe("ok");
    if (sessionLabel.kind === "ok") expect(sessionLabel.hit.message.id).toBe(B);
  });

  it("lists candidates for an ambiguous prefix", async () => {
    const result = resolveRef(await effective(), "h111111");
    expect(result.kind).toBe("ambiguous");
    if (result.kind !== "ambiguous") return;
    expect(result.candidates.map((candidate) => candidate.id)).toEqual([A, B]);
  });

  it("says plainly when a ref is unknown or malformed", async () => {
    const sessions = await effective();
    expect(resolveRef(sessions, "h999999")).toMatchObject({ kind: "unknown" });
    expect(resolveRef(sessions, "s1:m9")).toMatchObject({ kind: "unknown" });
    expect(resolveRef(sessions, "nope:m1")).toMatchObject({ kind: "unknown" });
    expect(resolveRef(sessions, "m3")).toMatchObject({ kind: "invalid" });
  });

  it("lists the sessions that match an ambiguous session prefix", async () => {
    const result = resolveRef(await effective(), "s:m1");
    expect(result.kind).toBe("ambiguous");
    if (result.kind !== "ambiguous") return;
    expect(result.candidates.map((candidate) => candidate.sessionId)).toEqual(["s1", "s2"]);
  });

  it("validates -n before Commander runs the command", () => {
    expect(positiveCount("3")).toBe(3);
    expect(() => positiveCount("0")).toThrow(/positive whole number/);
    expect(() => positiveCount("1.5")).toThrow(/positive whole number/);
  });

  it("prints sessions newest first with labels, return marks and commits", async () => {
    const model = await log({ dir: root, io });
    const lines = formatLog(model);
    expect(lines[0]).toContain("## Later chat (s2) · unassigned");
    const byAuthor = lines.find((line) => line.startsWith("## Ship the parser"));
    expect(byAuthor).toContain("· by Eren ·");
    expect(lines[0]).toContain(stamp("2026-10-21T10:00:00.000Z"));
    expect(lines[1]).toContain(shortHash(D));
    expect(lines[1]).toContain("m1");
    expect(lines[1]).toContain("╭ Next · Continue the parser");
    const s1 = model.sessions.find((entry) => entry.sessionId === "s1");
    expect(s1?.messages.map((message) => message.label)).toEqual(["m3", "m2", "m1"]);
    const fix = lines.find((line) => line.includes("Fix the loop"));
    expect(fix).toContain("↩ m1");
    expect(fix).toContain("[abc1234]");
    const start = lines.find((line) => line.includes("Start the parser"));
    expect(start).toContain("╭ Parser · Start the parser");
  });

  it("filters by session and limits the number of messages", async () => {
    const only = await log({ dir: root, io, session: "s1" });
    expect(only.sessions.map((entry) => entry.sessionId)).toEqual(["s1"]);

    const one = await log({ dir: root, io, limit: 1 });
    expect(one.sessions.map((entry) => entry.sessionId)).toEqual(["s2"]);
    expect(one.sessions[0]?.messages).toHaveLength(1);

    await expect(log({ dir: root, io, session: "s" })).rejects.toThrow(/matches 2 sessions/);
    await expect(log({ dir: root, io, session: "nope" })).rejects.toThrow(/no session matches/);
  });

  it("keeps a header for a session with no messages yet", async () => {
    const model = await log({ dir: root, io });
    const lines = formatLog(model);
    expect(lines.join("\n")).toContain("## Empty chat (old)");
    expect(lines.join("\n")).toContain("(no recorded messages)");
  });

  it("limits branch summaries too", async () => {
    const model = buildLog(await effective(), { limit: 1, branchesOnly: true });
    expect(model.sessions).toHaveLength(1);
    expect(model.sessions[0]?.sessionId).toBe("s2");
    expect(model.sessions[0]?.branches).toHaveLength(1);
  });

  it("compresses to branch summaries with --branches", async () => {
    const model = await log({ dir: root, io, branchesOnly: true });
    const lines = formatLog(model, true);
    expect(lines.join("\n")).toContain("╭ Parser  m1–m3, 3 messages");
    expect(lines.join("\n")).toContain("asked: How to read a file?");
    expect(lines.join("\n")).toContain("open: —");
    expect(lines.join("\n")).toContain("╭ Next  m1–m1, 1 message");
    expect(lines.join("\n")).toContain("open: Tests");
    expect(model.sessions[0]?.messages).toEqual([]);
  });

  it("builds branch ranges from the messages that carry them", async () => {
    const sessions = await effective();
    const s1 = sessions.find((entry) => entry.session.sessionId === "s1");
    expect(branchesOf("s1", s1?.messages ?? [])).toMatchObject([
      { title: "Parser", count: 3, start: { id: A }, end: { id: C } },
    ]);
  });

  it("shows one message with its graph neighbours and its stored turn", async () => {
    const model = await show({ dir: root, ref: B, io });
    expect(model).toMatchObject({
      id: B,
      label: "m2",
      title: "Fix the loop",
      sessionId: "s1",
      decidedBy: "user",
      why: "The loop ate one line.",
    });
    expect(model.parent).toMatchObject({ sessionId: "s1", id: A, label: "m1" });
    expect(model.children.map((child) => child.id)).toEqual([C]);
    expect(model.links[0]).toMatchObject({ id: A, label: "m1" });
    expect(model.branch?.title).toBe("Parser");
    expect(model.commits).toEqual([{ hash: "abc1234" }]);
    expect(model.chat).toMatchObject({ text: "Fix the loop", replies: [] });

    const text = formatShow(model).join("\n");
    expect(text).toContain(`${B}  m2  Fix the loop`);
    expect(text).toContain(`Parent: m1 ${shortHash(A)}`);
    expect(text).toContain(`Children: m3 ${shortHash(C)}`);
    expect(text).toContain(`Returns to: m1 ${shortHash(A)}`);
    expect(text).toContain("Branch: Parser (m1–m3, 3 messages)");
    expect(text).toContain("Considered and rejected:");
    expect(text).toContain("Agent decisions:");
    expect(text).toContain("  - Kept the parser — It works.");
    expect(text).toContain("    not: Rewrite — Too slow.");
    expect(text).toContain("abc1234 (not in this repository)");
    expect(text).toContain("User: Fix the loop");
  });

  it("says when the transcript and the store are both gone, and can skip the chat", async () => {
    const gone = await show({ dir: root, ref: C, io });
    expect(gone.chat).toBeNull();
    expect(formatShow(gone).join("\n")).toContain("Conversation: not available");

    const skipped = await show({ dir: root, ref: A, io, chat: false });
    expect(skipped.chat).toBeUndefined();
    expect(formatShow(skipped).join("\n")).not.toContain("Conversation:");
  });

  it("prints a cross-session parent as that session's ref", async () => {
    const model = await show({ dir: root, ref: D, io });
    expect(model.parent).toMatchObject({ sessionId: "s1", id: A, label: "m1" });
    expect(formatShow(model).join("\n")).toContain(`Parent: s1:m1 ${shortHash(A)}`);
  });

  it("exits non-zero for an ambiguous ref after listing the candidates", async () => {
    await expect(show({ dir: root, ref: "h111111", io })).rejects.toThrow(/ambiguous/);
    expect(io.lines.join("\n")).toContain("s1 · m1");
    expect(io.lines.join("\n")).toContain("s1 · m2");
  });

  it("runs both verbs through the CLI", async () => {
    const program = createProgram(() => io);
    await program.parseAsync(["log", root, "--session", "s1", "--json"], { from: "user" });
    const model = JSON.parse(io.lines.join("\n")) as { sessions: { sessionId: string }[] };
    expect(model.sessions[0]?.sessionId).toBe("s1");

    io.lines.length = 0;
    const limited = createProgram(() => io);
    await limited.parseAsync(["log", root, "-n", "1"], { from: "user" });
    expect(io.lines[0]).toContain("## Later chat (s2)");
    expect(io.lines.filter((line) => line.includes("  m1  "))).toHaveLength(1);

    io.lines.length = 0;
    const showProgram = createProgram(() => io);
    await showProgram.parseAsync(["show", B, root], { from: "user" });
    expect(io.lines.join("\n")).toContain("Session: Ship the parser (s1)");

    io.lines.length = 0;
    const jsonProgram = createProgram(() => io);
    await jsonProgram.parseAsync(["show", B, root, "--no-chat", "--json"], { from: "user" });
    const shown = JSON.parse(io.lines.join("\n")) as { id: string; chat?: unknown };
    expect(shown.id).toBe(B);
    expect(shown.chat).toBeUndefined();
  });

  it("refuses an uninitialized project", async () => {
    const empty = join(dir, "empty");
    await mkdir(empty);
    await expect(log({ dir: empty, io })).rejects.toThrow(/not initialized/);
    await expect(show({ dir: empty, ref: A, io })).rejects.toThrow(/not initialized/);
  });

  it("keeps the log model through the pure builder", async () => {
    const model = buildLog(await effective(), { session: "s1" });
    expect(model.sessions[0]?.branches).toHaveLength(1);
  });
});
