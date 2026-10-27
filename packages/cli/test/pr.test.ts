import { execFile } from "node:child_process";
import { access, chmod, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import { init } from "../src/commands/init.js";
import { shortHash } from "../src/commands/log.js";
import {
  copyToClipboard,
  formatPr,
  type PrModel,
  parsePrCommits,
  pr,
  renderPr,
  resolvePrBase,
} from "../src/commands/pr.js";
import { createProgram } from "../src/program.js";
import type { Session } from "../src/schema/session.js";
import { appendConversationTurns } from "../src/store/conversations.js";
import { projectPaths } from "../src/store/paths.js";
import { envFor, type FakeIo, fakeIo, T0, tempDir } from "./helpers.js";

const run = promisify(execFile);

/** The thought behind the parser work, and another one of the same session. */
const A = "h111111111111";
const D = "h444444444444";
/** A trailer value the record does not hold. */
const C = "h333333333333";
const SECRET = "the user's private words that must never reach a public PR";

function session(): Session {
  return {
    schema: 1,
    sessionId: "s1",
    agent: "claude-code",
    title: "Ship the parser",
    epoch: null,
    startedAt: "2026-10-20T09:00:00.000Z",
    updatedAt: "2026-10-20T10:00:00.000Z",
    status: {
      goal: "Ship the parser without losing data",
      done: [],
      pending: [],
      next: "",
    },
    nodes: [
      {
        id: A,
        parent: null,
        kind: "message",
        title: "Start the parser",
        summary: "Shipped the parser.",
        at: "2026-10-20T09:00:00.000Z",
        decidedBy: "user",
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
        id: D,
        parent: A,
        kind: "message",
        title: "Share the token",
        at: "2026-10-20T10:00:00.000Z",
      },
    ],
  };
}

async function findExecutable(name: string): Promise<string> {
  for (const dir of (process.env.PATH ?? "").split(":")) {
    const path = join(dir, name);
    if (
      await access(path).then(
        () => true,
        () => false,
      )
    )
      return path;
  }
  throw new Error(`no ${name} on PATH`);
}

describe("cogit pr (Story 10.1)", () => {
  let dir: string;
  let root: string;
  let env: NodeJS.ProcessEnv;
  let io: FakeIo;
  let commitHashes: string[];

  const git = async (...args: string[]): Promise<string> =>
    (await run("git", ["-C", root, ...args], { env })).stdout.trim();

  const commit = async (
    files: Record<string, string>,
    subject: string,
    thought?: string,
  ): Promise<void> => {
    for (const [name, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, name)), { recursive: true });
      await writeFile(join(root, name), content);
    }
    await git("add", ...Object.keys(files));
    const args = ["commit", "-q", "-m", subject];
    if (thought !== undefined) args.push("-m", `Thought: ${thought}`);
    await git(...args);
    commitHashes.push(await git("rev-parse", "HEAD"));
  };

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
    env = {
      ...envFor(dir),
      HOME: dir,
      GIT_CONFIG_NOSYSTEM: "1",
      PATH: process.env.PATH ?? "/usr/bin:/bin",
    };
    io = fakeIo(env);
    commitHashes = [];

    await run("git", ["-C", root, "init", "-q", "-b", "master"], { env });
    await git("config", "user.email", "t@example.com");
    await git("config", "user.name", "Tester");
    await writeFile(join(root, "base.txt"), "base\n");
    await git("add", "base.txt");
    await git("commit", "-q", "-m", "base");
    // A PR branch: main stays at the base commit while the work lands on master.
    await git("branch", "main");
    await init(
      root,
      { name: "proj", git: "commit", retention: "keep", language: "auto" },
      fakeIo(env),
    );
    await writeFile(projectPaths(root).session("s1"), JSON.stringify(session()));
    // The stored conversation is readable but its text must never reach the PR.
    await appendConversationTurns(root, "s1", [
      {
        id: "m1",
        uuid: "u1",
        hash: A,
        at: "2026-10-20T09:00:00.000Z",
        text: SECRET,
        replies: [],
        tools: { commands: 0, files: [], other: 0 },
      },
    ]);

    await commit({ "src/one.ts": "one\n" }, "feat(parser): read the first token", A);
    await commit({ "src/two.ts": "two\n" }, "refactor(parser): share the token", D);
    await commit({ "src/three.ts": "three\n" }, "fix(parser): stop the loop eating a line", A);
    await commit({ "docs.md": "docs\n" }, "docs: describe the parser", C);
    await commit({ "notes.txt": "notes\n" }, "chore: tidy notes");
  });

  it("groups the branch's commits by thought, in commit order", async () => {
    const model = await pr({ dir: root, io });
    expect(model.base.ref).toBe("main");
    expect(model.thoughts.map((thought) => thought.id)).toEqual([A, D]);
    expect(model.thoughts[0]?.commits.map((entry) => entry.subject)).toEqual([
      "feat(parser): read the first token",
      "fix(parser): stop the loop eating a line",
    ]);
    expect(model.thoughts[1]?.commits.map((entry) => entry.subject)).toEqual([
      "refactor(parser): share the token",
    ]);
    expect(model.thoughts[0]?.commits[1]?.files).toEqual(["src/three.ts"]);
    expect(model.unlinked.map((entry) => entry.subject)).toEqual([
      "docs: describe the parser",
      "chore: tidy notes",
    ]);
    expect(model.unlinked[0]?.thought).toBe(C);
    expect(model.unlinked[1]?.thought).toBeUndefined();
    expect(model.sessions[0]).toMatchObject({
      from: "m1",
      to: "m2",
      thoughtCount: 2,
      commitCount: 3,
    });

    const text = io.lines.join("\n");
    expect(text).toContain("## Goal");
    expect(text).toContain("- Ship the parser without losing data — Ship the parser (s1)");
    expect(text).toContain("## Sessions");
    expect(text).toContain("· m1–m2 ·");
    expect(text).toContain("`cogit log --session <id>`");
    expect(text).toContain(`### \`${shortHash(A)}\` s1:m1 — Start the parser`);
    expect(text).toContain("Shipped the parser.");
    expect(text).toContain("- Why: The old loop ate one line.");
    expect(text).toContain("- Decided by: user");
    expect(text).toContain("- considered and rejected: Keep the loop — It loses data.");
    expect(text).toContain("- agent decision: Kept the parser — It works.");
    expect(text).toContain("  - considered and rejected: Rewrite — Too slow.");
    expect(text).toContain("- `src/three.ts`");
    expect(text).toContain(
      `- \`${commitHashes[3]?.slice(0, 7)}\` docs: describe the parser — thought \`${C}\` not recorded yet`,
    );
    expect(text).toContain("## Dig deeper");
    expect(text).toContain("a reviewer who checks it out");
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("Conversation:");
  });

  it("prints the same content as JSON for other tools", async () => {
    const model = await pr({ dir: root, io, json: true });
    expect(model.thoughts[0]?.id).toBe(A);
    const data = JSON.parse(io.lines.at(-1) ?? "");
    expect(data.base.ref).toBe("main");
    expect(data.thoughts[0]).toMatchObject({
      id: A,
      shortId: shortHash(A),
      label: "m1",
      sessionId: "s1",
    });
    expect(data.thoughts[0].commits[1].files).toEqual(["src/three.ts"]);
    expect(data.unlinked[0].thought).toBe(C);
    expect(data.rendered).toEqual({ dropped: [], truncated: false });
    expect(io.lines.join("\n")).not.toContain(SECRET);
  });

  it("resolves the upstream's merge base before main", async () => {
    const base = await git("rev-parse", "HEAD~5");
    await git("branch", "--set-upstream-to=main");
    const resolved = await resolvePrBase(root, undefined, env);
    expect(resolved).toEqual({ ref: "@{upstream}", commit: base });
    const model = await pr({ dir: root, io });
    expect(model.base.ref).toBe("@{upstream}");
    expect(model.thoughts).toHaveLength(2);
  });

  it("falls back to main, takes an explicit base, and reports an unknown one", async () => {
    expect((await resolvePrBase(root, undefined, env)).ref).toBe("main");
    const explicit = await pr({ dir: root, base: "HEAD~2", io });
    expect(explicit.base.ref).toBe("HEAD~2");
    expect(explicit.unlinked.map((entry) => entry.subject)).toEqual([
      "docs: describe the parser",
      "chore: tidy notes",
    ]);
    await expect(pr({ dir: root, base: "nope", io })).rejects.toThrow(/unknown base "nope"/);
  });

  it("says plainly when no base can be found", async () => {
    await git("branch", "-D", "main");
    await git("branch", "-M", "trunk");
    await expect(pr({ dir: root, io })).rejects.toThrow(/cannot find a base/);
  });

  it("says when HEAD has no commits yet, or the directory is not a git repository", async () => {
    const empty = join(dir, "empty");
    await mkdir(empty);
    await run("git", ["-C", empty, "init", "-q"], { env });
    await init(
      empty,
      { name: "empty", git: "commit", retention: "keep", language: "auto" },
      fakeIo(env),
    );
    await expect(pr({ dir: empty, io })).rejects.toThrow(/HEAD has no commits yet/);

    const plain = join(dir, "plain");
    await mkdir(plain);
    await init(plain, { name: "plain", retention: "keep", language: "auto" }, fakeIo(env));
    await expect(pr({ dir: plain, io })).rejects.toThrow(/not in a git repository/);
  });

  it("keeps its sections and says so when the branch has no commits", async () => {
    const model = await pr({ dir: root, base: "HEAD", io });
    expect(model.thoughts).toEqual([]);
    const text = io.lines.join("\n");
    expect(text).toContain("_No session goal was recorded._");
    expect(text).toContain("_No recorded session is behind these commits._");
    expect(text).toContain("_No recorded thought is behind these commits._");
    expect(text).toContain("_None: every commit carries a recorded thought._");
  });

  it("switches the record policy sentence for the ignore policy", async () => {
    await writeFile(join(root, ".gitignore"), "# cogit\n/.cogit/\n");
    const model = await pr({ dir: root, io });
    expect(model.policy).toBe("ignore");
    expect(io.lines.join("\n")).toContain("resolve only on the author's machine");
  });

  it("drops the file lists first, then the summaries, and says what was left out", () => {
    const model: PrModel = {
      base: { ref: "main", commit: "0".repeat(40) },
      head: "1".repeat(40),
      policy: "commit",
      goals: [{ text: "A goal", sessionId: "s1", sessionTitle: "Session" }],
      sessions: [
        {
          sessionId: "s1",
          shortId: "s1",
          title: "Session",
          startedAt: T0,
          updatedAt: T0,
          from: "m1",
          to: "m1",
          thoughtCount: 1,
          commitCount: 1,
        },
      ],
      thoughts: [
        {
          id: A,
          shortId: shortHash(A),
          label: "m1",
          sessionId: "s1",
          shortSessionId: "s1",
          sessionTitle: "Session",
          title: "A thought",
          summary: "A summary that is dropped last.",
          alternatives: [],
          agentDecisions: [],
          commits: [
            {
              full: "2".repeat(40),
              short: "2222222",
              at: T0,
              subject: "feat: a change",
              files: ["src/a-very-long-file-name.ts", "src/another-long-file-name.ts"],
            },
          ],
        },
      ],
      unlinked: [],
    };

    const full = renderPr(model, 1_000_000);
    expect(full.dropped).toEqual([]);
    expect(full.text).toContain("src/a-very-long-file-name.ts");
    expect(full.text).toContain("A summary that is dropped last.");

    const withoutFiles = formatPr(model, {
      includeFiles: false,
      includeSummaries: true,
      dropped: ["files"],
    });
    const filesDropped = renderPr(model, withoutFiles.length);
    expect(filesDropped.dropped).toEqual(["files"]);
    expect(filesDropped.text).not.toContain("src/a-very-long-file-name.ts");
    expect(filesDropped.text).toContain("A summary that is dropped last.");
    expect(filesDropped.text).toContain("Left out to stay under the size cap: file lists.");

    const withoutBoth = formatPr(model, {
      includeFiles: false,
      includeSummaries: false,
      dropped: ["files", "summaries"],
    });
    const summariesDropped = renderPr(model, withoutBoth.length);
    expect(summariesDropped.dropped).toEqual(["files", "summaries"]);
    expect(summariesDropped.text).not.toContain("A summary that is dropped last.");
    expect(summariesDropped.text).toContain("file lists and summaries");

    const truncated = renderPr(model, 80);
    expect(truncated.truncated).toBe(true);
    expect(truncated.text.length).toBeLessThanOrEqual(80);

    const capped = renderPr(model, 200);
    expect(capped.truncated).toBe(true);
    expect(capped.text.length).toBeLessThanOrEqual(200);
    expect(capped.text).toContain("Truncated to fit the size cap");
  });

  it("runs through the CLI", async () => {
    const cliIo = fakeIo(env);
    const program = createProgram(() => cliIo);
    await program.parseAsync(["pr", "-C", root], { from: "user" });
    expect(cliIo.lines.join("\n")).toContain("## Goal");
    expect(cliIo.lines.join("\n")).toContain("Session");
  });

  it("copies with the first clipboard tool that exists", async () => {
    const bin = join(dir, "bin");
    const empty = join(dir, "empty-bin");
    await mkdir(bin);
    await mkdir(empty);
    const out = join(dir, "clipboard.txt");
    const wlCopy = join(bin, "wl-copy");
    await writeFile(wlCopy, `#!/bin/sh\ncat > "${out}"\n`);
    await chmod(wlCopy, 0o755);

    expect(await copyToClipboard("hello", { ...env, PATH: `${bin}:${env.PATH}` })).toBe(true);
    expect(await readFile(out, "utf8")).toBe("hello");
    expect(await copyToClipboard("hello", { ...env, PATH: empty })).toBe(false);
  });

  it("copies through pr and warns plainly when there is no clipboard tool", async () => {
    const bin = join(dir, "bin");
    await mkdir(bin);
    const out = join(dir, "clipboard.txt");
    const wlCopy = join(bin, "wl-copy");
    await writeFile(wlCopy, `#!/bin/sh\ncat > "${out}"\n`);
    await chmod(wlCopy, 0o755);

    const copied = fakeIo({ ...env, PATH: `${bin}:${env.PATH}` });
    await pr({ dir: root, io: copied, copy: true });
    expect(await readFile(out, "utf8")).toContain("## Goal");
    expect(copied.warnings).toEqual([]);

    const gitOnly = join(dir, "git-only");
    await mkdir(gitOnly);
    await symlink(await findExecutable("git"), join(gitOnly, "git"));
    const bare = fakeIo({ ...env, PATH: gitOnly });
    await pr({ dir: root, io: bare, copy: true });
    expect(bare.warnings.join("\n")).toContain("no clipboard tool found");
  });

  it("parses only well-formed commit lines", () => {
    const line = ["a".repeat(40), "aaaaaaa", T0, "feat: a"].join("\0");
    const emptyShort = ["b".repeat(40), "", T0, "feat: b"].join("\0");
    expect(parsePrCommits(`not a commit\n${line}\n${emptyShort}`)).toEqual([
      { full: "a".repeat(40), short: "aaaaaaa", at: T0, subject: "feat: a" },
    ]);
  });
});
