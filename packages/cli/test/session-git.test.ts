import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import { configGit, configGitShow } from "../src/commands/config.js";
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
import type { Session } from "../src/schema/session.js";
import { readSessionHead } from "../src/session-git.js";
import { projectPaths } from "../src/store/paths.js";
import { loadSession, projectJson } from "../src/store/stores.js";
import { envFor, fakeIo, noGitDir, T0, tempDir } from "./helpers.js";

const run = promisify(execFile);

describe("the session HEAD and author (Story 9.3)", () => {
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

  it("leaves out a commit this repository does not have", async () => {
    // A hash pasted from another repository reads like this session's commit.
    await makeProject();
    const own = (await git("rev-parse", "--short=7", "HEAD")).trim();
    const io = fakeIo(env);
    await sessionWrite({ dir: root }, io, async () =>
      JSON.stringify({
        sessionId: "s1",
        nodes: [
          {
            id: "h111111111111",
            kind: "message",
            title: "Commit it",
            commits: [own, "5d05a88"],
            shape: { tools: [], commits: [own, "5d05a88"] },
          },
        ],
      }),
    );
    const saved = await loadSession(root, "s1");
    const node = saved.found && saved.ok ? saved.data.nodes[0] : undefined;
    expect(node?.commits).toEqual([own]);
    expect(node?.shape?.commits).toEqual([own]);
    expect(io.warnings.join("\n")).toContain("does not have: 5d05a88");
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
    await ensureGitignore(root, "share");
    await expect(refreshCogitGitignore(root)).resolves.toBe(true);
    await expect(readFile(projectPaths(root).gitignore, "utf8")).resolves.toBe(cogitGitignore());
    // A project that still ignores .cogit/ keeps no inner file.
    await ensureGitignore(root, "ignore");
    await expect(refreshCogitGitignore(root)).resolves.toBe(false);
  });

  it("switches an existing project between share and ignore", async () => {
    const io = fakeIo(env);
    await configGit(root, "share", io);
    await expect(readFile(projectPaths(root).gitignore, "utf8")).resolves.toBe(cogitGitignore());
    const hook = await readFile(join(root, ".git", "hooks", "pre-push"), "utf8");
    expect(hook).toContain("# >>> cogit");
    expect(hook).toContain("cogit hook pre-push --dir");
    expect(await readFile(projectPaths(root).project, "utf8")).toContain('"proj"');

    await configGitShow(root, io);
    await configGit(root, "ignore", io);
    await expect(readFile(join(root, ".gitignore"), "utf8")).resolves.toBe("# cogit\n/.cogit/\n");
    await configGitShow(root, io);
    expect(io.lines.filter((line) => line.startsWith("Git policy"))).toEqual([
      "Git policy for proj: share",
      "Git policy for proj: share",
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
    // Under the shebang, so an early `exit` in the user's lines cannot skip it.
    expect(text).toBe(`#!/bin/sh\n${hookBlock("pre-commit", root)}\necho user-hook\n`);
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

  // The hook runs through sh, which a Windows PATH lacks.

  it.skipIf(process.platform === "win32")(
    "runs the CLI through node when cogit is not on PATH",
    async () => {
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
    },
  );

  // The hook runs through sh, which a Windows PATH lacks.

  it.skipIf(process.platform === "win32")(
    "stays silent and succeeds with neither cogit nor the CLI",
    async () => {
      const hook = join(dir, "hook.sh");
      await writeFile(hook, `#!/bin/sh\n${hookBlock("pre-commit", root, join(dir, "gone.js"))}\n`);
      const { stderr } = await run("sh", [hook], { env: { PATH: "/usr/bin:/bin" } });
      expect(stderr).toBe("");
    },
  );

  it("puts back blocks a tool wiped, but none after hooks uninstall", async () => {
    const hooks = join(root, ".git", "hooks");
    await writeFile(
      join(hooks, "post-commit"),
      "#!/bin/sh\n# >>> cogit\ncogit hook post-commit || true\n# <<< cogit\n",
    );
    // Like Husky after `npm install`: the hooks are there, cogit's block is not.
    await writeFile(join(hooks, "prepare-commit-msg"), "#!/bin/sh\necho mine\n");
    expect(await refreshGitHooks(root)).toEqual(["prepare-commit-msg", "post-commit", "pre-push"]);
    expect(await readFile(join(hooks, "prepare-commit-msg"), "utf8")).toBe(
      `#!/bin/sh\n${hookBlock("prepare-commit-msg", root)}\necho mine\n`,
    );
    expect(await refreshGitHooks(root)).toEqual([]);
    expect(await refreshGitHooks(await noGitDir())).toEqual([]);

    // The user took them out on purpose: the refresh leaves them out.
    const io = fakeIo(env);
    await hooksUninstall(root, io);
    expect(existsSync(projectPaths(root).hooksOff)).toBe(true);
    expect(await refreshGitHooks(root)).toEqual([]);
    expect(await readFile(join(hooks, "prepare-commit-msg"), "utf8")).toBe(
      "#!/bin/sh\necho mine\n",
    );
    // Installing again clears that, so a later wipe is mended again.
    await hooksInstall(root, io);
    expect(existsSync(projectPaths(root).hooksOff)).toBe(false);
  });

  it("adds pre-push to an installed clone and retires an old pre-commit block", async () => {
    const hooks = join(root, ".git", "hooks");
    const block = (event: string): string =>
      `#!/bin/sh\n# >>> cogit\ncogit hook ${event} || true\n# <<< cogit\n`;
    await writeFile(join(hooks, "prepare-commit-msg"), block("prepare-commit-msg"));
    await writeFile(
      join(hooks, "pre-commit"),
      `#!/bin/sh\necho mine\n${block("pre-commit").slice(10)}`,
    );
    await refreshGitHooks(root);
    expect(await readFile(join(hooks, "pre-push"), "utf8")).toContain("cogit hook pre-push");
    expect(await readFile(join(hooks, "pre-commit"), "utf8")).toBe("#!/bin/sh\necho mine\n");
  });

  it("installs the hooks on request and with the ignore policy", async () => {
    const io = fakeIo(env);
    const other = join(dir, "other");
    await mkdir(other);
    await expect(hooksInstall(other, io)).rejects.toThrow(/not initialized/);
    await hooksInstall(root, io);
    await hooksInstall(root, io);
    expect(io.lines).toEqual([
      "Added the cogit block to: prepare-commit-msg, post-commit, pre-push",
      "The cogit hook blocks are already current.",
    ]);
    await hooksUninstall(root, io);
    await configGit(root, "ignore", io);
    const hook = await readFile(join(root, ".git", "hooks", "prepare-commit-msg"), "utf8");
    expect(hook).toContain("hook prepare-commit-msg --dir");
  });
});
