import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import { init } from "../src/commands/init.js";
import { shapeMessage } from "../src/commands/shape.js";
import { runGitHook } from "../src/git-hooks.js";
import { createProgram } from "../src/program.js";
import type { Session } from "../src/schema/session.js";
import { drainShapeQueue, queuedShapes } from "../src/shape-queue.js";
import { withLock } from "../src/store/lock.js";
import { projectPaths } from "../src/store/paths.js";
import { loadSession } from "../src/store/stores.js";
import { envFor, fakeIo, T0, tempDir } from "./helpers.js";

const run = promisify(execFile);

const THOUGHT = "h0123456789ab";
const OLDER = "h0000000000aa";

const ANSWER = JSON.stringify({ tools: [{ kind: "pseudo", text: "1. Read it\n2. Write it" }] });

// The record's first write comes after the commits, as it does when a commit
// lands before the Stop hook records the message.
const LATER = "2099-01-01T00:00:00.000Z";

function session(nodes: Session["nodes"], id = "s1"): Session {
  return {
    schema: 1,
    sessionId: id,
    agent: "claude-code",
    title: "Ship it",
    startedAt: LATER,
    updatedAt: T0,
    status: { goal: "", done: [], pending: [], next: "" },
    nodes,
  };
}

describe("a Shape follows the commit's Thought trailer (Story 13.6)", () => {
  let dir: string;
  let root: string;
  let env: NodeJS.ProcessEnv;

  const git = async (...args: string[]): Promise<string> =>
    String(
      (
        await run("git", ["-C", root, ...args], {
          env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", HOME: dir },
        })
      ).stdout,
    ).trim();

  /** Commits `lines` new lines to `file`, with an optional Thought trailer. */
  const commit = async (file: string, lines: number, thought?: string): Promise<string> => {
    const body = Array.from({ length: lines }, (_, i) => `line ${i}`).join("\n");
    await writeFile(join(root, file), `${body}\n`);
    await git("add", file);
    const message = thought === undefined ? "feat: work" : `feat: work\n\nThought: ${thought}`;
    await git("commit", "-q", "--no-verify", "-m", message);
    return git("rev-parse", "HEAD");
  };

  const writeRecord = async (nodes: Session["nodes"]): Promise<void> => {
    await writeFile(projectPaths(root).session("s1"), JSON.stringify(session(nodes)));
  };

  /** A fake `claude` that prints one Shape answer and keeps how often it ran. */
  const fakeClaude = async (): Promise<NodeJS.ProcessEnv> => {
    const bin = join(dir, "bin");
    await mkdir(bin, { recursive: true });
    const file = join(bin, "claude");
    const count = JSON.stringify(join(dir, "runs.txt"));
    await writeFile(
      file,
      `#!/usr/bin/env node
process.stdin.resume();
process.stdin.on("end", () => {
  require("node:fs").appendFileSync(${count}, "x");
  process.stdout.write(JSON.stringify({ type: "result", subtype: "success", result: ${JSON.stringify(ANSWER)} }));
});
`,
    );
    await chmod(file, 0o755);
    return { ...env, PATH: `${bin}:${process.env.PATH ?? ""}` };
  };

  const shapeOf = async (id: string) => {
    const loaded = await loadSession(root, "s1");
    if (!loaded.found || !loaded.ok) return undefined;
    return loaded.data.nodes.find((node) => node.id === id)?.shape;
  };

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    env = envFor(dir);
    await mkdir(root, { recursive: true });
    await git("init", "-q");
    await git("config", "user.email", "t@example.com");
    await git("config", "user.name", "Tester");
    await init(
      root,
      { name: "proj", retention: "keep", language: "auto", allowSkill: false },
      fakeIo(env),
    );
  });

  it("queues a commit whose message is not recorded yet", async () => {
    const sha = await commit("a.txt", 12, THOUGHT);
    const io = fakeIo(env);
    await shapeMessage(root, undefined, io, { commit: "HEAD" });
    expect(io.lines).toContain(`queued ${sha.slice(0, 7)} until ${THOUGHT} is recorded`);
    expect(await queuedShapes(root)).toEqual([{ commit: sha, thought: THOUGHT }]);
  });

  it("starts the queued Shape once the record holds the message", async () => {
    const sha = await commit("a.txt", 12, THOUGHT);
    await shapeMessage(root, undefined, fakeIo(env), { commit: sha });
    const started: string[][] = [];
    const spawn = (_cli: string, args: string[]) => {
      started.push(args);
    };

    const before = session([{ id: OLDER, kind: "message", title: "Other", parent: null }]);
    expect(await drainShapeQueue(root, before, env, "/cli.js", spawn)).toBe(0);

    const after = session([{ id: THOUGHT, kind: "message", title: "Work", parent: null }]);
    expect(await drainShapeQueue(root, after, env, "/cli.js", spawn)).toBe(1);
    expect(started).toEqual([["shape", "--commit", sha, "-C", root]]);
  });

  it("drops a queued commit after a week", async () => {
    const sha = await commit("a.txt", 12, THOUGHT);
    await shapeMessage(root, undefined, fakeIo(env), { commit: sha });
    const file = join(projectPaths(root).shapeQueue, sha);
    const old = new Date(Date.now() - 8 * 24 * 3_600_000);
    await utimes(file, old, old);
    expect(await queuedShapes(root)).toEqual([]);
    expect(existsSync(file)).toBe(false);
  });

  it("shapes the trailer's message even before the record lists the commit", async () => {
    const sha = await commit("a.txt", 12, THOUGHT);
    await writeRecord([{ id: THOUGHT, kind: "message", title: "Work", parent: null }]);
    await shapeMessage(root, undefined, fakeIo(await fakeClaude()), { commit: sha });
    expect(await queuedShapes(root)).toEqual([]);
    const shape = await shapeOf(THOUGHT);
    expect(shape?.by).toBe("side");
    expect(shape?.commits).toEqual([sha]);
    expect(shape?.tools[0]?.kind).toBe("pseudo");
  });

  it("does nothing for a commit with no Thought trailer", async () => {
    await commit("a.txt", 12);
    const io = fakeIo(env);
    await shapeMessage(root, undefined, io, { commit: "HEAD" });
    expect(io.lines.at(-1)).toMatch(/no Thought trailer/);
    expect(await queuedShapes(root)).toEqual([]);
  });

  it("passes over a skipped message so an older one still gets its Shape", async () => {
    const big = await commit("a.txt", 12, OLDER);
    const tiny = await commit("b.txt", 1, THOUGHT);
    await writeRecord([
      { id: OLDER, kind: "message", title: "Big", parent: null, at: T0, commits: [big] },
      {
        id: THOUGHT,
        kind: "message",
        title: "Tiny",
        parent: null,
        at: "2026-10-21T11:00:00.000Z",
        commits: [tiny],
      },
    ]);
    const io = fakeIo(await fakeClaude());
    await shapeMessage(root, "s1", io);
    expect(io.lines).toContain(`no shape for ${THOUGHT}: only 1 changed line`);
    expect((await shapeOf(OLDER))?.commits).toEqual([big]);
    expect(await shapeOf(THOUGHT)).toBeUndefined();
    expect(await readFile(join(dir, "runs.txt"), "utf8")).toBe("x");
  });

  it("starts from the post-commit hook with the new commit", async () => {
    const sha = await commit("a.txt", 12, THOUGHT);
    const started: string[][] = [];
    await runGitHook("post-commit", root, env, [], new Date(), (_cli, args) => {
      started.push(args);
    });
    expect(started).toEqual([["shape", "--commit", sha, "-C", root]]);
  });

  it("says so for a commit git does not know, and runs through the CLI", async () => {
    await commit("a.txt", 12);
    const io = fakeIo(env);
    const program = createProgram(() => io);
    program.exitOverride().configureOutput({ writeOut: () => {}, writeErr: () => {} });
    await program.parseAsync(["shape", "--commit", "nope", "-C", root], { from: "user" });
    expect(io.lines).toEqual(["no commit nope"]);
  });

  it("leaves a Shape that is already being written alone", async () => {
    const io = fakeIo(env);
    await withLock(projectPaths(root).lock("shape-s1"), () => shapeMessage(root, "s1", io));
    expect(io.lines).toEqual(["a shape for s1 is already being written"]);
  });
});
