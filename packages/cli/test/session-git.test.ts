import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import { configGit, configGitShow, configSet } from "../src/commands/config.js";
import { hooksInstall, hooksUninstall } from "../src/commands/hooks.js";
import { sessionAuthor, sessionWrite } from "../src/commands/session.js";
import {
  cogitGitignore,
  commitBetween,
  ensureGitignore,
  refreshCogitGitignore,
} from "../src/git.js";
import {
  currentCliPath,
  hookBlock,
  installGitHook,
  refreshGitHooks,
  withHookBlock,
} from "../src/git-hooks.js";
import { runHook } from "../src/hooks/run.js";
import type { Session } from "../src/schema/session.js";
import {
  commitSessionFiles,
  maybeAutoCommit,
  readSessionHead,
  recordMessage,
  stageSessionFiles,
  uncommittedSession,
} from "../src/session-git.js";
import { projectPaths } from "../src/store/paths.js";
import { loadSession, projectJson } from "../src/store/stores.js";
import { envFor, fakeIo, noGitDir, T0, tempDir } from "./helpers.js";

const run = promisify(execFile);

describe("the record travels with the repo (Story 9.3)", () => {
  let dir: string;
  let root: string;
  let env: NodeJS.ProcessEnv;

  const git = async (...args: string[]): Promise<string> => {
    const { stdout } = await run("git", ["-C", root, ...args], {
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", HOME: dir },
    });
    return stdout;
  };

  const gitEnv = async (extra: NodeJS.ProcessEnv, ...args: string[]): Promise<string> => {
    const { stdout } = await run("git", ["-C", root, ...args], {
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", HOME: dir, ...extra },
    });
    return stdout;
  };

  const session = (id: string, title: string): Session => ({
    schema: 1,
    sessionId: id,
    agent: "claude-code",
    title,
    startedAt: T0,
    updatedAt: T0,
    status: { goal: "", done: [], pending: [], next: "" },
    nodes: [],
  });

  /** A `.cogit/` a repository could carry: project, one session and its events. */
  const makeProject = async (): Promise<void> => {
    const paths = projectPaths(root);
    await mkdir(paths.sessions, { recursive: true });
    await writeFile(paths.project, projectJson({ schema: 1, name: "proj" }));
    await writeFile(paths.session("s1"), JSON.stringify(session("s1", "My session")));
    await writeFile(paths.events("s1"), "");
  };

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
    env = envFor(dir);
    await git("init", "-q");
    await git("config", "user.email", "t@example.com");
    await git("config", "user.name", "Tester");
    await writeFile(join(root, "a.txt"), "one\n");
    await git("add", "a.txt");
    await git("commit", "-q", "-m", "feat: base");
  });

  it("treats a missing repository as no commit between two messages (9.5)", async () => {
    await expect(commitBetween(join(dir, "not-a-repo"), T0, T0)).resolves.toBe(false);
  });

  it("parses and rejects the session HEAD", async () => {
    expect(await readSessionHead(root)).toBeUndefined();
    await makeProject();
    await writeFile(projectPaths(root).head, JSON.stringify({ sessionId: "s1", at: T0 }));
    expect(await readSessionHead(root)).toEqual({ sessionId: "s1", at: T0 });
    await writeFile(projectPaths(root).head, "{not json");
    expect(await readSessionHead(root)).toBeUndefined();
  });

  it("stages the current session only when something else is already staged", async () => {
    await makeProject();
    await writeFile(projectPaths(root).head, JSON.stringify({ sessionId: "s1", at: T0 }));
    // Nothing staged: the hook must not create a record-only commit.
    expect(await stageSessionFiles(root)).toBe(false);
    expect((await git("diff", "--cached", "--name-only")).trim()).toBe("");

    await writeFile(join(root, "a.txt"), "two\n");
    await git("add", "a.txt");
    expect(await stageSessionFiles(root)).toBe(true);
    const staged = (await git("diff", "--cached", "--name-only")).trim().split("\n");
    expect(staged).toContain(".cogit/sessions/s1.json");
    expect(staged).toContain(".cogit/sessions/s1.events.jsonl");
  });

  it("stages into the temporary index of git commit <paths>", async () => {
    await makeProject();
    await writeFile(projectPaths(root).head, JSON.stringify({ sessionId: "s1", at: T0 }));
    // git commit <paths> builds a temporary index; its path arrives as GIT_INDEX_FILE.
    const tempEnv = { GIT_INDEX_FILE: join(dir, "temp-index") };
    await gitEnv(tempEnv, "read-tree", "HEAD");
    expect(await stageSessionFiles(root, { ...process.env, ...tempEnv })).toBe(false);
    await writeFile(join(root, "a.txt"), "three\n");
    await gitEnv(tempEnv, "add", "a.txt");
    expect(await stageSessionFiles(root, { ...process.env, ...tempEnv })).toBe(true);
    const temp = (await gitEnv(tempEnv, "diff", "--cached", "--name-only")).trim();
    expect(temp).toContain(".cogit/sessions/s1.json");
    // The real index is untouched by the temporary one.
    expect((await git("diff", "--cached", "--name-only")).trim()).toBe("");
  });

  it("does nothing when the ignore policy hides the record", async () => {
    await makeProject();
    await writeFile(projectPaths(root).head, JSON.stringify({ sessionId: "s1", at: T0 }));
    await writeFile(join(root, ".gitignore"), "/.cogit/\n");
    await writeFile(join(root, "a.txt"), "two\n");
    await git("add", "a.txt");
    expect(await stageSessionFiles(root)).toBe(false);
    expect(await uncommittedSession(root, "s1")).toBe(false);
    expect((await git("diff", "--cached", "--name-only")).trim()).toBe("a.txt");
  });

  it("commits exactly the record files, leaving other staged changes alone", async () => {
    await makeProject();
    await writeFile(join(root, "a.txt"), "two\n");
    await git("add", "a.txt");
    expect(await commitSessionFiles(root, "s1", "My session")).toBe(true);
    expect((await git("log", "-1", "--format=%s")).trim()).toBe("chore(cogit): record My session");
    const files = (await git("show", "--name-only", "--format=")).trim().split("\n");
    expect(files).toContain(".cogit/sessions/s1.json");
    expect(files).not.toContain("a.txt");
    expect((await git("diff", "--cached", "--name-only")).trim()).toBe("a.txt");
    expect(await uncommittedSession(root, "s1")).toBe(false);
  });

  it("commits at session end only in auto mode", async () => {
    await makeProject();
    const io = fakeIo(env);
    await configSet("recordCommit", "off", io);
    expect(await maybeAutoCommit(root, "s1", env)).toBe(false);
    expect((await git("log", "--format=%s")).trim().split("\n")).toEqual(["feat: base"]);

    await configSet("recordCommit", "auto", io);
    expect(await maybeAutoCommit(root, "s1", env)).toBe(true);
    expect((await git("log", "-1", "--format=%s")).trim()).toBe("chore(cogit): record My session");
    // Nothing left to commit is a quiet no-op, not an error.
    expect(await commitSessionFiles(root, "s1", "My session")).toBe(false);
    // Changing the sharing setting also walks the registry's ignore files.
    await configSet("shareConversations", "true", io);
  });

  it("keeps the record commit message to one short line", () => {
    expect(recordMessage("  Multi\nline   title ", "s1")).toBe(
      "chore(cogit): record Multi line title",
    );
    expect(recordMessage("", "s1")).toBe("chore(cogit): record s1");
    expect(recordMessage("x".repeat(200), "s1")).toHaveLength("chore(cogit): record ".length + 120);
  });

  it("stamps the author from git on the first write, else the OS user", async () => {
    await makeProject();
    expect(await sessionAuthor(root, env)).toBe("Tester");

    await sessionWrite({ dir: root }, fakeIo(env), async () =>
      JSON.stringify({ sessionId: "s9", title: "Authored" }),
    );
    expect((await loadSession(root, "s9")).found).toBe(true);
    const saved = await loadSession(root, "s9");
    expect(saved.found && saved.ok ? saved.data.author : undefined).toBe("Tester");

    // No git name anywhere: the OS user is the fallback.
    const noName = {
      ...env,
      GIT_CONFIG_GLOBAL: join(dir, "no-global-config"),
      GIT_CONFIG_SYSTEM: "/dev/null",
    };
    await git("config", "--unset", "user.name");
    expect(await sessionAuthor(root, noName)).toBe(userInfo().username);
  });

  it("writes stable project.json, one sorted key per line", () => {
    expect(projectJson({ schema: 1, name: "p" })).toBe('{\n  "name": "p",\n  "schema": 1\n}\n');
  });
});

describe("ignore files and git hooks", () => {
  let dir: string;
  let root: string;
  let env: NodeJS.ProcessEnv;

  const git = async (...args: string[]): Promise<string> => {
    const { stdout } = await run("git", ["-C", root, ...args], {
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", HOME: dir },
    });
    return stdout;
  };

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
    env = envFor(dir);
    await git("init", "-q");
    await git("config", "user.email", "t@example.com");
    await git("config", "user.name", "Tester");
    await mkdir(projectPaths(root).base, { recursive: true });
    await writeFile(projectPaths(root).project, projectJson({ schema: 1, name: "proj" }));
  });

  it("adds and removes the root ignore line with the policy", async () => {
    await ensureGitignore(root, "ignore");
    await expect(readFile(join(root, ".gitignore"), "utf8")).resolves.toBe("# cogit\n/.cogit/\n");
    await ensureGitignore(root, "commit");
    await expect(refreshCogitGitignore(root, false)).resolves.toBe(true);
    await expect(readFile(projectPaths(root).gitignore, "utf8")).resolves.toBe(
      cogitGitignore(false),
    );
    // A project that still ignores .cogit/ keeps no inner file.
    await ensureGitignore(root, "ignore");
    await expect(refreshCogitGitignore(root, true)).resolves.toBe(false);
  });

  it("switches an existing project between commit and ignore", async () => {
    const io = fakeIo(env);
    await configGit(root, "commit", io);
    await expect(readFile(projectPaths(root).gitignore, "utf8")).resolves.toBe(
      cogitGitignore(false),
    );
    const hook = await readFile(join(root, ".git", "hooks", "pre-commit"), "utf8");
    expect(hook).toContain("# >>> cogit");
    expect(hook).toContain("cogit hook pre-commit --dir");
    expect(await readFile(projectPaths(root).project, "utf8")).toContain('"proj"');

    await configGitShow(root, io);
    await configGit(root, "ignore", io);
    await expect(readFile(join(root, ".gitignore"), "utf8")).resolves.toBe("# cogit\n/.cogit/\n");
    await configGitShow(root, io);
    expect(io.lines.filter((line) => line.startsWith("Git policy"))).toEqual([
      "Git policy for proj: commit",
      "Git policy for proj: commit",
      "Git policy for proj: ignore",
      "Git policy for proj: ignore",
    ]);
    await expect(configGitShow(join(root, "nowhere"), io)).rejects.toThrow(/not initialized/);
    // Switching policy never deletes a record.
    await expect(readFile(projectPaths(root).project, "utf8")).resolves.toContain('"proj"');
  });

  it("keeps an existing hook and installs once", async () => {
    const file = join(root, ".git", "hooks", "pre-commit");
    await writeFile(file, "#!/bin/sh\necho user-hook\n");
    await chmod(file, 0o755);
    expect(await installGitHook(root, "pre-commit")).toBe(true);
    const text = await readFile(file, "utf8");
    expect(text.startsWith("#!/bin/sh\necho user-hook\n")).toBe(true);
    expect(text).toContain(hookBlock("pre-commit", root));
    expect(await installGitHook(root, "pre-commit")).toBe(false);
  });

  it("installs into the hooks directory git uses with core.hooksPath", async () => {
    await git("config", "core.hooksPath", ".husky");
    expect(await installGitHook(root, "pre-commit")).toBe(true);
    const text = await readFile(join(root, ".husky", "pre-commit"), "utf8");
    expect(text).toContain("cogit hook pre-commit");
  });

  it("replaces an old cogit block in place", () => {
    const old = "#!/bin/sh\n# >>> cogit\ncogit hook pre-commit || true\n# <<< cogit\n";
    const next = withHookBlock(old, hookBlock("pre-commit", "/p"));
    expect(next.match(/# >>> cogit/g)).toHaveLength(1);
    expect(next).not.toContain("cogit hook pre-commit || true");
    expect(next).toContain("--dir '/p'");
  });

  it("carries project.json and the inner ignore file with the first record", async () => {
    await mkdir(projectPaths(root).sessions, { recursive: true });
    await writeFile(projectPaths(root).session("s1"), "{}\n");
    await writeFile(projectPaths(root).gitignore, cogitGitignore(false));
    await writeFile(projectPaths(root).head, JSON.stringify({ sessionId: "s1", at: T0 }));
    await writeFile(join(root, "a.txt"), "two\n");
    await git("add", "a.txt");
    expect(await stageSessionFiles(root)).toBe(true);
    const staged = (await git("diff", "--cached", "--name-only")).trim().split("\n");
    expect(staged).toEqual(
      expect.arrayContaining([
        "a.txt",
        ".cogit/sessions/s1.json",
        ".cogit/project.json",
        ".cogit/.gitignore",
      ]),
    );
  });

  it("falls back to the installing CLI under node, else does nothing", () => {
    const withCli = hookBlock("pre-commit", "/p", "/opt/cogit/cli.js");
    expect(withCli).toContain("if command -v cogit >/dev/null 2>&1; then");
    expect(withCli).toContain(`  cogit hook pre-commit --dir '/p' "$@" || true`);
    expect(withCli).toContain(`  node '/opt/cogit/cli.js' hook pre-commit --dir '/p' "$@" || true`);
    const bare = hookBlock("pre-commit", "/p", null);
    expect(bare).not.toContain("node ");
    expect(bare.endsWith("fi\n# <<< cogit")).toBe(true);
  });

  it("has no fallback CLI path when the entry script is unknown", () => {
    const saved = process.argv[1];
    try {
      process.argv[1] = join(dir, "missing.js");
      expect(currentCliPath()).toBeUndefined();
      process.argv[1] = "";
      expect(currentCliPath()).toBeUndefined();
    } finally {
      process.argv[1] = saved as string;
    }
  });

  it("runs the CLI through node when cogit is not on PATH", async () => {
    // A stand-in CLI that records the arguments the hook passed.
    const marker = join(dir, "called.txt");
    const cli = join(dir, "cli.js");
    await writeFile(
      cli,
      `require("node:fs").writeFileSync(${JSON.stringify(marker)}, process.argv.slice(2).join(" "));\n`,
    );
    const hook = join(dir, "hook.sh");
    await writeFile(hook, `#!/bin/sh\n${hookBlock("pre-commit", root, cli)}\n`);
    // Only node in its own directory: a global `npm install -g @cogit/cli` puts cogit
    // next to node, which would take this test off the path it checks.
    const bin = join(dir, "bin");
    await mkdir(bin);
    await symlink(process.execPath, join(bin, "node"));
    await run("sh", [hook, "x"], { env: { PATH: `${bin}:/usr/bin:/bin` } });
    expect(await readFile(marker, "utf8")).toBe(`hook pre-commit --dir ${root} x`);
  });

  it("stays silent and succeeds with neither cogit nor the CLI", async () => {
    const hook = join(dir, "hook.sh");
    await writeFile(hook, `#!/bin/sh\n${hookBlock("pre-commit", root, join(dir, "gone.js"))}\n`);
    const { stderr } = await run("sh", [hook], { env: { PATH: "/usr/bin:/bin" } });
    expect(stderr).toBe("");
  });

  it("refreshes only the hooks that already carry a cogit block", async () => {
    const hooks = join(root, ".git", "hooks");
    await writeFile(
      join(hooks, "pre-commit"),
      "#!/bin/sh\n# >>> cogit\ncogit hook pre-commit || true\n# <<< cogit\n",
    );
    await writeFile(join(hooks, "prepare-commit-msg"), "#!/bin/sh\necho mine\n");
    expect(await refreshGitHooks(root)).toEqual(["pre-commit"]);
    expect(await readFile(join(hooks, "pre-commit"), "utf8")).toContain(
      hookBlock("pre-commit", root),
    );
    expect(await readFile(join(hooks, "prepare-commit-msg"), "utf8")).toBe(
      "#!/bin/sh\necho mine\n",
    );
    expect(await refreshGitHooks(root)).toEqual([]);
    expect(await refreshGitHooks(await noGitDir())).toEqual([]);
  });

  it("installs the hooks on request and with the ignore policy", async () => {
    const io = fakeIo(env);
    const other = join(dir, "other");
    await mkdir(other);
    await expect(hooksInstall(other, io)).rejects.toThrow(/not initialized/);
    await hooksInstall(root, io);
    await hooksInstall(root, io);
    expect(io.lines).toEqual([
      "Added the cogit block to: pre-commit, prepare-commit-msg",
      "The cogit hook blocks are already current.",
    ]);
    await hooksUninstall(root, io);
    await configGit(root, "ignore", io);
    const hook = await readFile(join(root, ".git", "hooks", "prepare-commit-msg"), "utf8");
    expect(hook).toContain("hook prepare-commit-msg --dir");
  });

  it("offers the uncommitted record at session start only in ask mode", async () => {
    const paths = projectPaths(root);
    await mkdir(paths.sessions, { recursive: true });
    const earlier: Session = {
      schema: 1,
      sessionId: "s0",
      agent: "claude-code",
      title: "Earlier work",
      startedAt: T0,
      updatedAt: T0,
      status: { goal: "", done: [], pending: [], next: "" },
      nodes: [],
    };
    await writeFile(paths.session("s0"), JSON.stringify(earlier));
    await writeFile(paths.events("s0"), "");
    const io = fakeIo(env);
    await configSet("recordCommit", "ask", io);

    const start = async (): Promise<string> => {
      const out = await runHook(
        "sessionstart",
        JSON.stringify({ session_id: "s1", cwd: root, source: "startup" }),
        env,
        T0,
        () => {},
      );
      return (
        (JSON.parse(out ?? "{}") as { hookSpecificOutput?: { additionalContext?: string } })
          .hookSpecificOutput?.additionalContext ?? ""
      );
    };

    expect(await start()).toContain("The last session's record is not committed");
    expect(await start()).toContain("chore(cogit): record Earlier work");

    await git("add", "-A");
    await git("commit", "-q", "-m", "chore(cogit): record Earlier work");
    expect(await start()).not.toContain("The last session's record is not committed");

    // `off` and `auto` never ask the agent.
    await configSet("recordCommit", "auto", io);
    await writeFile(paths.head, JSON.stringify({ sessionId: "s0", at: T0 }));
    await writeFile(paths.session("s0"), JSON.stringify({ ...earlier, title: "Changed" }));
    expect(await start()).not.toContain("The last session's record is not committed");
  });
});
