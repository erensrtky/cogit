import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import {
  hookBlock,
  installGitHook,
  isShellHook,
  runGitHook,
  sameRepository,
  withHookBlock,
  withoutHookBlock,
} from "../src/git-hooks.js";
import {
  findPushArgs,
  isDryRun,
  type ProcessInfo,
  pushIsDryRun,
  readProc,
  readProcess,
  readPs,
} from "../src/push-command.js";
import { noGitDir, tempDir } from "./helpers.js";

const run = promisify(execFile);

/**
 * The block under a real `git push` / `git commit`, with a stub `cogit` on PATH
 * that logs what it was given: the user's own hook lines must not be able to
 * skip it or starve it of git's stdin.
 */
describe("the cogit block in a user's hook", () => {
  let dir: string;
  let root: string;
  let log: string;
  let env: NodeJS.ProcessEnv;

  const git = async (...args: string[]): Promise<{ stdout: string; stderr: string }> =>
    run("git", ["-C", root, ...args], { env });

  const hook = async (event: string, userLines: string): Promise<void> => {
    const file = join(root, ".git", "hooks", event);
    await writeFile(file, `#!/bin/sh\n${userLines}`);
    await chmod(file, 0o755);
    await writeFile(
      file,
      withHookBlock(await readFile(file, "utf8"), hookBlock(event, root, null)),
    );
  };

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "repo");
    log = join(dir, "cogit.log");
    const bin = join(dir, "bin");
    await mkdir(bin);
    // Logs its arguments and stdin; for prepare-commit-msg it appends a trailer.
    await writeFile(
      join(bin, "cogit"),
      [
        "#!/bin/sh",
        `echo "args: $*" >> '${log}'`,
        `[ "$2" = pre-push ] && { echo "stdin: $(cat)" >> '${log}'; }`,
        `[ "$2" = prepare-commit-msg ] && printf '\\nThought: h123456\\n' >> "$5"`,
        "exit 0",
      ].join("\n"),
    );
    await chmod(join(bin, "cogit"), 0o755);
    env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      GIT_CONFIG_NOSYSTEM: "1",
      HOME: dir,
      GIT_AUTHOR_NAME: "A",
      GIT_AUTHOR_EMAIL: "a@example.com",
      GIT_COMMITTER_NAME: "A",
      GIT_COMMITTER_EMAIL: "a@example.com",
    };
    await run("git", ["init", "-q", "--bare", join(dir, "remote.git")], { env });
    await run("git", ["init", "-q", "-b", "main", root], { env });
    await git("remote", "add", "origin", join(dir, "remote.git"));
    await writeFile(join(root, "a.txt"), "a\n");
    await git("add", "a.txt");
    await git("commit", "-qm", "first");
  });

  it("runs before a user pre-push hook that exits early and hands it git's stdin", async () => {
    const seen = join(dir, "user.log");
    await hook("pre-push", `cat > '${seen}'\nexit 0\necho never\n`);
    await git("push", "-q", "origin", "main");
    const sha = (await git("rev-parse", "HEAD")).stdout.trim();
    const logged = await readFile(log, "utf8");
    expect(logged).toContain(`args: hook pre-push --dir ${root} origin`);
    expect(logged).toContain(`stdin: refs/heads/main ${sha} refs/heads/main`);
    expect(await readFile(seen, "utf8")).toBe(
      `refs/heads/main ${sha} refs/heads/main ${"0".repeat(40)}\n`,
    );
  });

  it("keeps the user's exit status, so their hook can still stop a push", async () => {
    await hook("pre-push", "exit 1\n");
    await expect(git("push", "-q", "origin", "main")).rejects.toThrow();
    expect(await readFile(log, "utf8")).toContain("args: hook pre-push");
  });

  it("adds the Thought trailer after a user prepare-commit-msg hook that rewrites and exits", async () => {
    await hook("prepare-commit-msg", `echo "rewritten by the user" > "$1"\nexit 0\n`);
    await writeFile(join(root, "b.txt"), "b\n");
    await git("add", "b.txt");
    await git("commit", "-qm", "original");
    const message = (await git("log", "-1", "--format=%B")).stdout;
    expect(message).toContain("rewritten by the user");
    expect(message).toContain("Thought: h123456");
  });

  it("adds the Thought trailer past a user's own EXIT trap and a closing exec", async () => {
    const trapped = join(dir, "trap.log");
    await hook("prepare-commit-msg", `trap 'echo trap ran > "${trapped}"' EXIT\nexec true\n`);
    await writeFile(join(root, "d.txt"), "d\n");
    await git("add", "d.txt");
    await git("commit", "-qm", "exec");
    expect((await git("log", "-1", "--format=%B")).stdout).toContain("Thought: h123456");
    await hook("prepare-commit-msg", `trap 'echo trap ran > "${trapped}"' EXIT\n`);
    await writeFile(join(root, "e.txt"), "e\n");
    await git("add", "e.txt");
    await git("commit", "-qm", "trap");
    expect((await git("log", "-1", "--format=%B")).stdout).toContain("Thought: h123456");
    expect(await readFile(trapped, "utf8")).toBe("trap ran\n");
    // One trailer per commit: the child run of the hook skips the block.
    expect((await readFile(log, "utf8")).match(/prepare-commit-msg/g)).toHaveLength(2);
  });

  it("keeps a failing prepare-commit-msg hook failing", async () => {
    await hook("prepare-commit-msg", "exit 3\n");
    await writeFile(join(root, "c.txt"), "c\n");
    await git("add", "c.txt");
    await expect(git("commit", "-qm", "blocked")).rejects.toThrow();
  });

  it("moves a block older versions appended to the top, and takes it out cleanly", () => {
    const user = "#!/bin/sh\necho mine\n\n";
    const block = hookBlock("post-commit", "/p", null);
    const appended = `${user}\n${block}\n`;
    const moved = withHookBlock(appended, block);
    expect(moved).toBe(`#!/bin/sh\n${block}\necho mine\n\n`);
    expect(withHookBlock(moved, block)).toBe(moved);
    // The user's own trailing blank line stays.
    expect(withoutHookBlock(moved)).toBe(user);
  });

  it("leaves a hook written in another language alone", async () => {
    const file = join(root, ".git", "hooks", "pre-push");
    const python = "#!/usr/bin/env python3\nimport sys\n";
    await writeFile(file, python);
    expect(await installGitHook(root, "pre-push")).toBe(false);
    expect(await readFile(file, "utf8")).toBe(python);
    expect(isShellHook("#!/usr/bin/env bash\n")).toBe(true);
    expect(isShellHook("#!/bin/sh -e\n")).toBe(true);
    expect(isShellHook("echo no shebang\n")).toBe(true);
    expect(isShellHook("#!/usr/bin/env node\n")).toBe(false);
  });
});

describe("telling a dry-run push apart", () => {
  it("reads --dry-run and -n, also bundled, but not option values or refspecs", () => {
    expect(isDryRun(["git", "push", "--dry-run", "origin", "main"])).toBe(true);
    expect(isDryRun(["git", "push", "-n"])).toBe(true);
    expect(isDryRun(["git", "-c", "a=b", "push", "-fn"])).toBe(true);
    expect(isDryRun(["/usr/libexec/git-core/git", "push", "--dry-run"])).toBe(true);
    expect(isDryRun(["git", "push"])).toBe(false);
    expect(isDryRun(["git", "push", "origin", "main"])).toBe(false);
    expect(isDryRun(["git", "push", "-o", "-n"])).toBe(false);
    expect(isDryRun(["git", "push", "-onotify"])).toBe(false);
    expect(isDryRun(["git", "push", "--push-option", "-n"])).toBe(false);
    expect(isDryRun(["git", "push", "--", "-n"])).toBe(false);
  });

  it("finds the git push above the hook's shell, and gives up on an unreadable tree", () => {
    const tree: Record<number, ProcessInfo> = {
      30: { ppid: 20, args: ["sh", "-c", "pipeline"] },
      20: { ppid: 10, args: ["/bin/sh", ".git/hooks/pre-push", "origin"] },
      10: { ppid: 1, args: ["git", "push", "--dry-run"] },
    };
    expect(findPushArgs(30, (pid) => tree[pid])).toEqual(["git", "push", "--dry-run"]);
    expect(findPushArgs(20, () => undefined)).toBeUndefined();
    const noGit: Record<number, ProcessInfo> = { 5: { ppid: 1, args: ["bash"] } };
    expect(findPushArgs(5, (pid) => noGit[pid])).toBeUndefined();
  });

  it("reads a real process on Linux and through ps, and nothing on other systems", () => {
    // /proc is Linux's own, and Windows has no ps.
    const readers = [
      ...(process.platform === "linux" ? [readProc] : []),
      ...(process.platform === "win32"
        ? []
        : [readPs, (pid: number) => readProcess(pid, "darwin")]),
    ];
    for (const read of readers) {
      expect(read(process.pid)?.ppid).toBe(process.ppid);
      expect(read(process.pid)?.args.join(" ")).toContain("node");
      expect(read(2 ** 30)).toBeUndefined();
    }
    expect(readProcess(process.pid, "win32")).toBeUndefined();
    // Under vitest no git push is running, so the push counts as real.
    expect(pushIsDryRun()).toBe(false);
    expect(pushIsDryRun(() => ({ ppid: 1, args: ["git", "push", "-n"] }))).toBe(true);
  });
});

describe("a hooks folder shared by every repository", () => {
  it("tells the project's repository and its worktrees from any other", async () => {
    const dir = await tempDir();
    const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", HOME: dir };
    const repo = async (name: string): Promise<string> => {
      const path = join(dir, name);
      await run("git", ["init", "-q", "-b", "main", path], { env });
      await run(
        "git",
        [
          "-C",
          path,
          "-c",
          "user.name=A",
          "-c",
          "user.email=a@x.io",
          "commit",
          "-q",
          "--allow-empty",
          "-m",
          "init",
        ],
        { env },
      );
      return path;
    };
    const project = await repo("project");
    const other = await repo("other");
    const tree = join(dir, "tree");
    await run("git", ["-C", project, "worktree", "add", "-q", tree, "-b", "wt"], { env });

    expect(await sameRepository(project, project)).toBe(true);
    expect(await sameRepository(join(tree), project)).toBe(true);
    expect(await sameRepository(other, project)).toBe(false);
    // Outside any repository nothing is known: as before, the hook runs.
    expect(await sameRepository(await noGitDir(), project)).toBe(true);

    // Git's own variables in the hook must not make the project look like this repository.
    const saved = process.env.GIT_DIR;
    process.env.GIT_DIR = join(other, ".git");
    try {
      expect(await sameRepository(other, project)).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = saved;
    }

    // A hook run from the other repository does nothing at all.
    const started: string[][] = [];
    const spawned = ((_cli: string, args: string[]) => {
      started.push(args);
    }) as never;
    await runGitHook(
      "pre-push",
      project,
      env,
      ["origin", "x"],
      new Date(),
      spawned,
      async () => `refs/heads/main ${"a".repeat(40)} refs/heads/main ${"0".repeat(40)}\n`,
      () => false,
      other,
    );
    expect(started).toEqual([]);
  });
});
