import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import { blame, parseBlameTarget } from "../src/commands/blame.js";
import { init } from "../src/commands/init.js";
import { createProgram } from "../src/program.js";
import type { Session } from "../src/schema/session.js";
import { projectPaths } from "../src/store/paths.js";
import { envFor, type FakeIo, fakeIo, T0, tempDir } from "./helpers.js";

const run = promisify(execFile);

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

describe("parseBlameTarget", () => {
  it("splits file:line and leaves a bare path alone", () => {
    expect(parseBlameTarget("src/app.ts:42")).toEqual({ file: "src/app.ts", line: 42 });
    expect(parseBlameTarget("src/app.ts")).toEqual({ file: "src/app.ts" });
    // A colon without digits is part of the name, and a drive letter is not a line.
    expect(parseBlameTarget("notes:2026.md")).toEqual({ file: "notes:2026.md" });
    expect(parseBlameTarget("C:\\repo\\a.ts:3")).toEqual({ file: "C:\\repo\\a.ts", line: 3 });
  });
});

describe("cogit blame", () => {
  let dir: string;
  let root: string;
  let io: FakeIo;
  let shortA: string;
  const git = async (...args: string[]) => run("git", ["-C", root, ...args]);

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
    io = fakeIo(envFor(dir));
    await init(root, { name: "proj", retention: "keep", language: "auto" }, fakeIo(envFor(dir)));
    await git("init", "-q");
    await git("config", "user.email", "t@example.com");
    await git("config", "user.name", "T");
    await writeFile(join(root, "a.txt"), "one\ntwo\n");
    await git("add", "a.txt");
    await git("commit", "-q", "-m", "feat: add a");
    shortA = (await git("rev-parse", "--short", "HEAD")).stdout.trim();
    await writeFile(join(root, "b.txt"), "b\n");
    await git("add", "b.txt");
    await git("commit", "-q", "-m", "feat: add b");

    const record = session({
      sessionId: "s1",
      title: "Ship the parser",
      nodes: [
        {
          id: "h1",
          parent: null,
          kind: "message",
          title: "Parse the file",
          summary: "A line is read and parsed.",
          at: T0,
          commits: [shortA],
        },
      ],
    });
    await writeFile(projectPaths(root).session("s1"), JSON.stringify(record));
    // A second session keeps the output order deterministic (and exercises the sort).
    await writeFile(
      projectPaths(root).session("s0"),
      JSON.stringify(session({ sessionId: "s0", title: "Earlier chat" })),
    );
  });

  it("points a line at the message that recorded its commit", async () => {
    const hits = await blame({ dir: root, target: "a.txt:1", io });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      commit: shortA.slice(0, 7),
      sessionId: "s1",
      sessionTitle: "Ship the parser",
      label: "m1",
      title: "Parse the file",
      summary: "A line is read and parsed.",
    });
    expect(hits[0]?.url).toMatch(/#s=s1&m=h1$/);
    expect(io.lines[0]).toBe(`${shortA.slice(0, 7)}  Ship the parser · m1 Parse the file`);
    expect(io.lines[1]).toBe("  A line is read and parsed.");
    expect(io.lines[2]).toBe(`  ${hits[0]?.url}`);
  });

  it("runs through the CLI", async () => {
    const program = createProgram(() => io);
    await program.parseAsync(["blame", "a.txt:1", "-C", root], { from: "user" });
    expect(io.lines[0]).toContain("Parse the file");
  });

  it("accepts a file without a line and searches every commit that touched it", async () => {
    const hits = await blame({ dir: root, target: "a.txt", io });
    expect(hits.map((hit) => hit.title)).toEqual(["Parse the file"]);
  });

  it("says plainly when no recorded message knows the code", async () => {
    const hits = await blame({ dir: root, target: "b.txt", io });
    expect(hits).toEqual([]);
    expect(io.lines).toEqual(["No recorded message lists a commit that touched b.txt."]);
  });

  it("reports a file that does not exist", async () => {
    await expect(blame({ dir: root, target: "missing.txt", io })).rejects.toThrow(
      /missing\.txt does not exist/,
    );
  });

  it("reports a target git cannot blame", async () => {
    await writeFile(join(root, "untracked.txt"), "one\n");
    await expect(blame({ dir: root, target: "untracked.txt:1", io })).rejects.toThrow(
      /git could not read untracked\.txt:1/,
    );
  });

  it("refuses a file outside the repository", async () => {
    await expect(blame({ dir: root, target: "../other.txt", io })).rejects.toThrow(/outside/);
  });

  it("needs an initialized project", async () => {
    const empty = join(dir, "empty");
    await mkdir(empty);
    await expect(blame({ dir: empty, target: "a.txt", io })).rejects.toThrow(/not initialized/);
  });

  it("reports a broken project file", async () => {
    await writeFile(projectPaths(root).project, "{nope");
    await expect(blame({ dir: root, target: "a.txt", io })).rejects.toThrow(/invalid JSON/);
  });

  it("needs a git repository", async () => {
    const plain = join(dir, "plain");
    await mkdir(plain);
    await init(plain, { name: "plain", retention: "keep", language: "auto" }, fakeIo(envFor(dir)));
    await expect(blame({ dir: plain, target: "a.txt", io })).rejects.toThrow(
      /not inside a git repository/,
    );
  });
});
