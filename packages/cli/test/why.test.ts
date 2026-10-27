import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import { configSet } from "../src/commands/config.js";
import { init } from "../src/commands/init.js";
import {
  collectWhy,
  formatWhy,
  rejectedItems,
  TRY_BEFORE_MAX_CHARS,
  TRY_BEFORE_MAX_ITEMS,
  tryBeforeNote,
  type WhyHit,
  why,
} from "../src/commands/why.js";
import { runHook } from "../src/hooks/run.js";
import type { Session } from "../src/schema/session.js";
import { projectPaths } from "../src/store/paths.js";
import { envFor, fakeIo, noGitProject, T0, tempDir } from "./helpers.js";

const run = promisify(execFile);

const A = "h111111111111";
const B = "h222222222222";

function session(over: Partial<Session> = {}): Session {
  return {
    schema: 1,
    sessionId: "s1",
    agent: "claude-code",
    title: "Ship the parser",
    epoch: null,
    startedAt: "2026-10-20T09:00:00.000Z",
    updatedAt: "2026-10-20T10:00:00.000Z",
    status: { goal: "", done: [], pending: [], next: "" },
    nodes: [],
    ...over,
  };
}

function hit(over: Partial<WhyHit> = {}): WhyHit {
  return {
    sessionId: "s1",
    sessionTitle: "Ship the parser",
    messageId: A,
    label: "m1",
    at: "2026-10-20T09:00:00.000Z",
    title: "Parse the file",
    decisions: [
      {
        title: "Parse the file",
        why: "",
        alternatives: [{ option: "Keep the loop", why: "It loses data." }],
      },
    ],
    ...over,
  };
}

describe("cogit why", () => {
  let dir: string;
  let root: string;
  let env: NodeJS.ProcessEnv;
  let secondCommit: string;
  const git = async (...args: string[]) => run("git", ["-C", root, ...args]);

  const edit = (extra: Record<string, unknown> = {}) =>
    runHook(
      "pretooluse",
      JSON.stringify({
        session_id: "s1",
        cwd: root,
        tool_name: "Edit",
        tool_input: { file_path: join(root, "a.txt") },
        ...extra,
      }),
      env,
      T0,
      () => {},
    );

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    env = envFor(dir);
    await mkdir(root);
    await init(root, { name: "proj", retention: "keep", language: "auto" }, fakeIo(env));
    await git("init", "-q");
    await git("config", "user.email", "t@example.com");
    await git("config", "user.name", "T");

    await writeFile(join(root, "a.txt"), "one\n");
    await git("add", "a.txt");
    // The first commit names its message only through the trailer (Story 9.4).
    await git("commit", "-q", "-m", "feat: add a", "-m", `Thought: ${A}`);

    await writeFile(join(root, "a.txt"), "one\ntwo\n");
    await git("add", "a.txt");
    await git("commit", "-q", "-m", "feat: extend a", "-m", `Thought: ${B}`);
    secondCommit = (await git("rev-parse", "--short", "HEAD")).stdout.trim();

    const record = session({
      nodes: [
        {
          id: A,
          parent: null,
          kind: "message",
          title: "Parse the file",
          at: "2026-10-20T09:00:00.000Z",
          // No `commits`: only the trailer links this message to the commit.
          why: "The old loop ate one line.",
          alternatives: [{ option: "Keep the loop", why: "It loses data." }],
          agentDecisions: [
            {
              title: "Kept the parser",
              why: "It works.",
              alternatives: [{ option: "Rewrite", why: "Too slow." }],
            },
          ],
        },
        {
          id: B,
          parent: A,
          kind: "message",
          title: "Extend the parser",
          at: "2026-10-20T10:00:00.000Z",
          commits: [secondCommit],
          alternatives: [{ option: "Split the module", why: "Extra files." }],
        },
      ],
    });
    await writeFile(projectPaths(root).session("s1"), JSON.stringify(record));
  });

  it("follows a trailer-linked commit to its thought, newest first", async () => {
    const hits = await collectWhy(root, "a.txt", env);
    expect(hits.map((entry) => entry.messageId)).toEqual([B, A]);
    const older = hits[1];
    expect(older).toMatchObject({ label: "m1", title: "Parse the file" });
    expect(older?.decisions.flatMap((decision) => decision.alternatives)).toEqual([
      { option: "Keep the loop", why: "It loses data." },
      { option: "Rewrite", why: "Too slow." },
    ]);
    expect(older?.decisions.map((decision) => decision.title)).toEqual([
      "Parse the file",
      "Kept the parser",
    ]);
    // Without an env the lookup still runs (git uses the process environment).
    expect(await collectWhy(root, "a.txt")).toHaveLength(2);
  });

  it("prints each thought with its hash, label, date and rejected options", async () => {
    const lines = formatWhy(await collectWhy(root, "a.txt", env));
    expect(lines[0]).toContain("h2222222  m2");
    expect(lines[0]).toContain("Extend the parser");
    expect(lines.join("\n")).toContain("not: Split the module — Extra files.");
    expect(lines.join("\n")).toContain("h1111111  m1");
    expect(lines.join("\n")).toContain("not: Keep the loop — It loses data.");
    expect(lines.join("\n")).toContain("decision: Parse the file — The old loop ate one line.");
    expect(lines.join("\n")).toContain("decision: Kept the parser — It works.");
  });

  it("prints the lookup, or a plain line when nothing was recorded", async () => {
    const io = fakeIo(env);
    const hits = await why({ dir: root, file: "a.txt", io });
    expect(hits).toHaveLength(2);
    const text = io.lines.join("\n");
    expect(text).toContain("h2222222  m2");
    expect(text).toContain("not: Split the module — Extra files.");
    expect(text).toContain(
      "`cogit show <hash>` opens the thought; the record is the agent's summary.",
    );

    await writeFile(join(root, "loose.txt"), "x\n");
    const none = fakeIo(env);
    await why({ dir: root, file: "loose.txt", io: none });
    expect(none.lines).toEqual(["No decisions or rejected alternatives recorded for loose.txt."]);
  });

  it("refuses an uninitialized project, a non-repository and a missing file", async () => {
    const bare = join(dir, "bare");
    await mkdir(bare);
    await expect(why({ dir: bare, file: "a.txt", io: fakeIo(env) })).rejects.toThrow(
      /not initialized/,
    );

    const plain = await noGitProject(env);
    await expect(why({ dir: plain, file: "a.txt", io: fakeIo(env) })).rejects.toThrow(
      /not inside a git repository/,
    );
    await expect(why({ dir: root, file: "missing.txt", io: fakeIo(env) })).rejects.toThrow(
      /does not exist/,
    );
  });

  it("treats a repository with no commits as nothing known", async () => {
    const empty = join(dir, "empty");
    await mkdir(empty);
    await init(empty, { name: "empty", retention: "keep", language: "auto" }, fakeIo(env));
    await run("git", ["-C", empty, "init", "-q"]);
    await writeFile(join(empty, "a.txt"), "x\n");
    expect(await collectWhy(empty, "a.txt", env)).toEqual([]);
  });

  it("says plainly when the thoughts recorded no decisions", async () => {
    const record = session({
      nodes: [
        {
          id: A,
          parent: null,
          kind: "message",
          title: "Parse the file",
          at: "2026-10-20T09:00:00.000Z",
        },
      ],
    });
    await writeFile(projectPaths(root).session("s1"), JSON.stringify(record));
    expect(await collectWhy(root, "a.txt", env)).toEqual([]);
    expect(tryBeforeNote("a.txt", [])).toBeUndefined();
  });

  it("ignores a file no thought links to a commit", async () => {
    await writeFile(join(root, "other.txt"), "x\n");
    await git("add", "other.txt");
    await git("commit", "-q", "-m", "chore: other");
    expect(await collectWhy(root, "other.txt", env)).toEqual([]);
    // Outside the project, or a file that never existed.
    expect(await collectWhy(root, "../outside.txt", env)).toEqual([]);
    expect(await collectWhy(root, "missing.txt", env)).toEqual([]);
  });

  it("writes one note per file per session and then stays quiet", async () => {
    const first = await edit();
    expect(first).toBeDefined();
    const text = (JSON.parse(first ?? "") as { hookSpecificOutput: { additionalContext: string } })
      .hookSpecificOutput.additionalContext;
    expect(text).toContain("Earlier, for this file:");
    expect(text).toContain('"Keep the loop" was considered and rejected (h1111111,');
    expect(text).toContain("It loses data.");
    expect(text).toContain("Decide knowingly.");
    // A second edit of the same file in the same session: no second note.
    expect(await edit()).toBeUndefined();
    expect(JSON.parse(await readFile(projectPaths(root).state("s1"), "utf8"))).toMatchObject({
      notedFiles: ["a.txt"],
    });
  });

  it("does not note a file with nothing to say, and remembers the lookup", async () => {
    await writeFile(join(root, "other.txt"), "x\n");
    await git("add", "other.txt");
    await git("commit", "-q", "-m", "chore: other");
    expect(await edit({ tool_input: { file_path: join(root, "other.txt") } })).toBeUndefined();
    expect(JSON.parse(await readFile(projectPaths(root).state("s1"), "utf8"))).toMatchObject({
      notedFiles: ["other.txt"],
    });
  });

  it("stays quiet when the setting is off, for other tools, and outside the project", async () => {
    await configSet("tryBeforeNotes", "false", fakeIo(env));
    expect(await edit()).toBeUndefined();
    await configSet("tryBeforeNotes", "true", fakeIo(env));
    expect(await edit({ tool_name: "Bash", tool_input: { command: "ls" } })).toBeUndefined();
    expect(await edit({ tool_input: { file_path: join(dir, "outside.txt") } })).toBeUndefined();
    // Nothing was claimed by the skipped calls.
    expect(await edit()).toBeDefined();
  });

  it("keeps the note within five items and 600 characters", () => {
    const many: WhyHit[] = Array.from({ length: 9 }, (_, index) =>
      hit({
        messageId: `h${String(index + 1).repeat(12)}`,
        decisions: [
          {
            title: "d",
            why: "",
            alternatives: [{ option: `Option ${index}`, why: "it did not fit" }],
          },
        ],
      }),
    );
    const note = tryBeforeNote("a.txt", many);
    expect(note).toBeDefined();
    expect(note?.length).toBeLessThanOrEqual(TRY_BEFORE_MAX_CHARS);
    expect(note?.split("\n").filter((line) => line.startsWith("- "))).toHaveLength(
      TRY_BEFORE_MAX_ITEMS,
    );
    expect(note).toContain("`cogit why a.txt` for more.");

    const oneLong = tryBeforeNote("a.txt", [
      hit({
        decisions: [
          {
            title: "d",
            why: "",
            alternatives: [{ option: "A very long option", why: "y".repeat(500) }],
          },
        ],
      }),
    ]);
    expect(oneLong).toBeDefined();
    expect(oneLong?.length).toBeLessThanOrEqual(TRY_BEFORE_MAX_CHARS);
    expect(oneLong).toContain("Decide knowingly.");
  });

  it("counts every rejected option once", () => {
    expect(rejectedItems([hit(), hit()])).toHaveLength(2);
  });

  it("never throws when the hook's state cannot be written", async () => {
    // A regular file where the state directory belongs makes the state write fail.
    await writeFile(join(projectPaths(root).base, "state"), "not a directory");
    await expect(edit()).resolves.toBeUndefined();
  });
});
