import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import { init } from "../src/commands/init.js";
import { logFile } from "../src/commands/log.js";
import { projectFiles } from "../src/git.js";
import { createProgram } from "../src/program.js";
import type { Session } from "../src/schema/session.js";
import { projectPaths } from "../src/store/paths.js";
import { buildFileHistory, type FileSourceSession, modelSessions } from "../src/view/files.js";
import type { ViewNode } from "../src/view/model.js";
import { envFor, type FakeIo, fakeIo, T0, tempDir } from "./helpers.js";

const run = promisify(execFile);

function message(over: Partial<ViewNode> & { id: string; title: string }): ViewNode {
  return { kind: "message", parent: null, ...over };
}

function source(sessionId: string, title: string, messages: ViewNode[]): FileSourceSession {
  return { sessionId, title, messages };
}

describe("buildFileHistory", () => {
  it("unions the message's files with the files of its commits, once per path", () => {
    const files = buildFileHistory(
      [
        source("s1", "Ship it", [
          message({
            id: "h1",
            label: "m1",
            title: "Add a and b",
            at: "2026-10-24T10:00:00.000Z",
            files: ["src/a.ts"],
            commits: ["c1"],
          }),
        ]),
      ],
      new Map([["c1", ["src/a.ts", "src/b.ts"]]]),
    );
    expect(files.map((file) => file.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(files[0]?.count).toBe(1);
    expect(files[0]?.hits[0]).toMatchObject({
      sessionId: "s1",
      sessionTitle: "Ship it",
      messageId: "h1",
      label: "m1",
      title: "Add a and b",
      commits: ["c1"],
    });
  });

  it("lists files by last touch and messages newest first", () => {
    const files = buildFileHistory([
      source("s1", "First chat", [
        message({ id: "h1", title: "Older", at: "2026-10-20T09:00:00.000Z", files: ["old.ts"] }),
        message({ id: "h2", title: "Newer", at: "2026-10-24T09:00:00.000Z", files: ["new.ts"] }),
        message({ id: "h3", title: "Back", at: "2026-10-24T11:00:00.000Z", files: ["new.ts"] }),
      ]),
    ]);
    expect(files.map((file) => [file.path, file.count, file.lastAt])).toEqual([
      ["new.ts", 2, "2026-10-24T11:00:00.000Z"],
      ["old.ts", 1, "2026-10-20T09:00:00.000Z"],
    ]);
    expect(files[0]?.hits.map((hit) => hit.messageId)).toEqual(["h3", "h2"]);
  });

  it("files a message under the branch that was running when it was sent", () => {
    const branch = {
      title: "Parser",
      asked: "How?",
      outcome: "Done.",
      open: "",
    };
    const files = buildFileHistory([
      source("s1", "Ship it", [
        message({ id: "h1", title: "Start", files: ["a.ts"], branch }),
        message({ id: "h2", title: "Continue", files: ["b.ts"] }),
      ]),
    ]);
    const a = files.find((file) => file.path === "a.ts");
    const b = files.find((file) => file.path === "b.ts");
    expect(a?.hits[0]?.branch).toBe("Parser");
    expect(b?.hits[0]?.branch).toBe("Parser");
  });

  it("keeps recorded commits git cannot read, and drops ones that missed the file", () => {
    const files = buildFileHistory(
      [
        source("s1", "Ship it", [
          message({
            id: "h1",
            title: "Known and unknown",
            files: ["a.ts"],
            commits: ["c1", "gone"],
          }),
          message({ id: "h2", title: "Two commits", files: ["b.ts"], commits: ["c1", "c2"] }),
        ]),
      ],
      new Map([
        ["c1", ["a.ts"]],
        ["c2", ["c.ts"]],
      ]),
    );
    expect(files.find((file) => file.path === "a.ts")?.hits[0]?.commits).toEqual(["c1", "gone"]);
    expect(files.find((file) => file.path === "b.ts")?.hits[0]?.commits).toEqual([]);
  });

  it("returns nothing for a project with no recorded files", () => {
    expect(buildFileHistory([source("s1", "Empty", [])])).toEqual([]);
  });

  it("lists a page's sessions for the union", () => {
    const sessions = modelSessions({
      kind: "lineage",
      schema: 1,
      project: { name: "p", path: "/p", generatedAt: T0 },
      status: { goal: "", done: [], pending: [], next: "", lastActivity: null },
      sessions: [
        {
          sessionId: "s1",
          agent: "claude-code",
          title: "Epoch chat",
          startedAt: T0,
          updatedAt: T0,
          status: { goal: "", done: [], pending: [], next: "" },
          messages: [],
          transcriptAvailable: true,
        },
        {
          sessionId: "s2",
          agent: "claude-code",
          title: "Loose chat",
          startedAt: T0,
          updatedAt: T0,
          status: { goal: "", done: [], pending: [], next: "" },
          messages: [],
          transcriptAvailable: true,
        },
      ],
    });
    expect(sessions.map((session) => session.sessionId)).toEqual(["s1", "s2"]);
  });
});

describe("projectFiles", () => {
  it("passes a project at the repository root through unchanged", () => {
    const files = new Map([["c1", ["src/a.ts"]]]);
    expect(projectFiles("/repo", "/repo", files)).toEqual(files);
  });

  it("rebases commit paths onto a project below the repository root", () => {
    const out = projectFiles(
      "/repo",
      "/repo/packages/app",
      new Map([
        ["c1", ["packages/app/src/a.ts", "packages/other/b.ts"]],
        ["c2", ["README.md"]],
      ]),
    );
    expect(out.get("c1")).toEqual(["src/a.ts"]);
    // A commit that only touched files outside the project is left out.
    expect(out.has("c2")).toBe(false);
  });
});

describe("cogit log --file", () => {
  let dir: string;
  let root: string;
  let io: FakeIo;
  let shortA: string;

  const git = async (...args: string[]) => run("git", ["-C", root, ...args]);

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
    await git("init", "-q");
    await git("config", "user.email", "t@example.com");
    await git("config", "user.name", "T");
    await writeFile(join(root, "a.txt"), "one\n");
    await git("add", "a.txt");
    await git("commit", "-q", "-m", "feat: add a");
    shortA = (await git("rev-parse", "--short", "HEAD")).stdout.trim();

    const record = session({
      sessionId: "s1",
      title: "Ship the parser",
      nodes: [
        {
          id: "h1",
          parent: null,
          kind: "message",
          title: "Add a.txt",
          at: "2026-10-20T09:00:00.000Z",
          commits: [shortA],
        },
        {
          id: "h2",
          parent: "h1",
          kind: "message",
          title: "Come back to a.txt",
          at: "2026-10-20T10:00:00.000Z",
          files: ["a.txt"],
        },
      ],
    });
    await writeFile(projectPaths(root).session("s1"), JSON.stringify(record));
  });

  it("lists the messages that touched the file, newest first", async () => {
    const file = await logFile({ dir: root, file: "a.txt", io });
    expect(file?.count).toBe(2);
    expect(io.lines[0]).toBe("a.txt  2 messages  (newest first)");
    expect(io.lines[1]).toContain("h2");
    expect(io.lines[1]).toContain("m2");
    expect(io.lines[1]).toContain("Come back to a.txt");
    expect(io.lines[1]).toContain("Ship the parser");
    expect(io.lines[2]).toContain(`[${shortA.slice(0, 7)}]`);
    expect(io.lines[2]).toContain("Add a.txt");
  });

  it("normalizes a leading ./ and prints JSON on request", async () => {
    await logFile({ dir: root, file: "./a.txt", io, json: true });
    const parsed = JSON.parse(io.lines.join("\n")) as { path: string; count: number };
    expect(parsed.path).toBe("a.txt");
    expect(parsed.count).toBe(2);
  });

  it("says plainly when no record touched the file", async () => {
    const file = await logFile({ dir: root, file: "b.txt", io });
    expect(file).toBeNull();
    expect(io.lines).toEqual(["No recorded message touched b.txt."]);
  });

  it("runs through the CLI", async () => {
    const program = createProgram(() => io);
    await program.parseAsync(["log", "--file", "a.txt", "-C", root], { from: "user" });
    expect(io.lines[0]).toContain("a.txt");
    expect(io.lines[1]).toContain("Come back to a.txt");
  });
});
