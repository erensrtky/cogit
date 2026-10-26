import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import {
  allowSkill,
  readRetention,
  readSkillAllowed,
  SKILL_RULE,
  setRetention,
} from "../src/agents/claude/settings.js";
import { init } from "../src/commands/init.js";
import { cogitGitignore, ensureCogitGitignore, ensureGitignore, findGitRoot } from "../src/git.js";
import { loadConfig, loadProject, loadRegistry } from "../src/store/stores.js";
import { envFor, fakeIo, T0, tempDir } from "./helpers.js";

let dir: string;
let root: string;
let env: NodeJS.ProcessEnv;
beforeEach(async () => {
  dir = await tempDir();
  root = join(dir, "proj");
  await mkdir(root);
  env = envFor(dir);
});

const settingsFile = () => join(dir, "claude", "settings.json");
const readText = (f: string) => readFile(f, "utf8");

describe("init", () => {
  it("recognizes a pre-rename .codelineage project and renames it", async () => {
    await mkdir(join(root, ".codelineage"), { recursive: true });
    await writeFile(
      join(root, ".codelineage", "project.json"),
      `${JSON.stringify({ schema: 1, name: "old", epochs: [] })}\n`,
    );
    const io = fakeIo(env);

    await init(root, { retention: "keep" }, io);

    expect(io.lines[0]).toBe(`Already initialized: old (${root})`);
    expect(await loadProject(root)).toMatchObject({ ok: true, data: { name: "old" } });
    expect(existsSync(join(root, ".codelineage"))).toBe(false);
  });

  it("creates the project with defaults and registers it", async () => {
    const io = fakeIo(env);
    await init(root, {}, io);
    expect(await loadProject(root)).toMatchObject({ ok: true, data: { name: "proj", epochs: [] } });
    expect(await readdir(join(root, ".cogit"))).toContain("sessions");
    expect(await loadRegistry(env)).toMatchObject({
      ok: true,
      data: { projects: [{ path: root, name: "proj" }] },
    });
    expect((await loadConfig(env)).language).toBe("auto");
    // not a git repo: name, retention, skill permission and language were asked
    expect(io.asked).toHaveLength(4);
    expect(await readSkillAllowed(env)).toBe(true);
    expect(io.lines.at(-2)).toMatch(/^Initialized proj/);
    // Outside a git repository there is nothing to ignore and no hook to install.
    expect(existsSync(join(root, ".cogit", ".gitignore"))).toBe(false);
    expect(io.lines).toContain(
      "Conversations are stored in .cogit/conversations/ (kept out of git; turn on shareConversations to share them).",
    );
  });

  it("writes the project ignore file once for the commit policy", async () => {
    await mkdir(join(root, ".cogit"));
    expect(await ensureCogitGitignore(root, "commit", false)).toBe(true);
    expect(await ensureCogitGitignore(root, "commit", false)).toBe(false);
    expect(await readText(join(root, ".cogit", ".gitignore"))).toBe(cogitGitignore(false));
    // Sharing the conversation store un-ignores it in the same file.
    expect(await ensureCogitGitignore(root, "commit", true)).toBe(true);
    expect(await readText(join(root, ".cogit", ".gitignore"))).toContain("!conversations/");
  });

  it("asks nothing when every answer is given as an option", async () => {
    await mkdir(join(root, ".git"));
    const io = fakeIo(env, [], true);
    await init(
      root,
      { name: "P", git: "commit", retention: "keep", allowSkill: false, language: "Turkish" },
      io,
    );
    expect((await loadConfig(env)).language).toBe("Turkish");
    // Commit policy: the root file stays untouched, the project writes its own rules.
    expect(existsSync(join(root, ".gitignore"))).toBe(false);
    expect(await readText(join(root, ".cogit", ".gitignore"))).toBe(cogitGitignore(false));
  });

  it("asks for the git policy in a repo and writes .gitignore", async () => {
    await mkdir(join(root, ".git"));
    const io = fakeIo(env, ["proj", "ignore"]);
    await init(root, {}, io);
    expect(await readText(join(root, ".gitignore"))).toBe("# cogit\n/.cogit/\n");
    expect(io.lines).toContain("Added to .gitignore: /.cogit/");
  });

  it("raises transcript retention when asked, keeping other settings", async () => {
    await mkdir(join(dir, "claude"));
    await writeFile(settingsFile(), JSON.stringify({ model: "x" }));
    const io = fakeIo(env, ["proj", "365"]);
    await init(root, {}, io);
    expect(JSON.parse(await readText(settingsFile()))).toEqual({
      model: "x",
      cleanupPeriodDays: 365,
      permissions: { allow: [SKILL_RULE] },
    });
    // two changes in one run keep a single backup holding the original
    const backups = (await readdir(join(dir, "claude"))).filter((f) =>
      f.startsWith("settings.json.cogit-bak-"),
    );
    expect(backups).toHaveLength(1);
    expect(JSON.parse(await readText(join(dir, "claude", backups[0] as string)))).toEqual({
      model: "x",
    });
    expect(io.lines.some((l) => l.includes("Set cleanupPeriodDays to 365"))).toBe(true);
  });

  it("does not ask about retention when it is already long", async () => {
    await mkdir(join(dir, "claude"));
    await writeFile(settingsFile(), JSON.stringify({ cleanupPeriodDays: 365 }));
    const io = fakeIo(env);
    await init(root, {}, io);
    expect(io.lines).toContain("Claude Code keeps transcripts for 365 days.");
    expect(io.asked).toHaveLength(3);
  });

  it("applies a retention option without asking, and skips an unchanged one", async () => {
    await init(
      root,
      { name: "p", retention: 90, allowSkill: false, language: "auto" },
      fakeIo(env, [], true),
    );
    expect(await readRetention(env)).toBe(90);
    const again = join(dir, "other");
    await mkdir(again);
    const io = fakeIo(env, [], true);
    await init(again, { name: "o", retention: 90, allowSkill: false }, io);
    expect(io.lines.some((l) => l.includes("cleanupPeriodDays"))).toBe(false);
  });

  it("warns and moves on when Claude Code settings are unreadable", async () => {
    await mkdir(join(dir, "claude"));
    await writeFile(settingsFile(), "{oops");
    const io = fakeIo(env);
    await init(root, {}, io);
    expect(io.warnings[0]).toMatch(/retention left unchanged/);
    expect(io.warnings[1]).toMatch(/add Skill\(cogit:record\) to permissions.allow yourself/);
    expect(await readText(settingsFile())).toBe("{oops");
  });

  it("asks which fixed language on the first run only", async () => {
    await init(root, {}, fakeIo(env, ["proj", "keep", "yes", "fixed", "Turkish"]));
    expect((await loadConfig(env)).language).toBe("Turkish");
    const second = join(dir, "second");
    await mkdir(second);
    const io = fakeIo(env);
    await init(second, {}, io);
    expect(io.asked.some((q) => q.startsWith("Language"))).toBe(false);
  });

  it("adds the skill rule to existing permissions, and only once", async () => {
    await mkdir(join(dir, "claude"));
    await writeFile(
      settingsFile(),
      JSON.stringify({ permissions: { allow: ["Bash(ls)"], deny: [] } }),
    );
    const io = fakeIo(env, ["proj", "keep", "yes"]);
    await init(root, {}, io);
    expect(JSON.parse(await readText(settingsFile())).permissions).toEqual({
      allow: ["Bash(ls)", SKILL_RULE],
      deny: [],
    });
    expect(io.lines.some((l) => l.startsWith(`Allowed ${SKILL_RULE} in`))).toBe(true);
    const second = join(dir, "second");
    await mkdir(second);
    const again = fakeIo(env);
    await init(second, {}, again);
    expect(again.asked.some((q) => q.startsWith("Let the agent"))).toBe(false);
  });

  it("leaves permissions alone when declined", async () => {
    const io = fakeIo(env, ["proj", "keep", "no"]);
    await init(root, {}, io);
    expect(await readSkillAllowed(env)).toBe(false);
    expect(io.lines).toContain(
      `Claude Code will ask before each lineage update; allow ${SKILL_RULE} to stop that.`,
    );
  });

  it("warns when permissions.allow has an unexpected shape", async () => {
    await mkdir(join(dir, "claude"));
    await writeFile(settingsFile(), JSON.stringify({ permissions: { allow: "all" } }));
    const io = fakeIo(env);
    await init(root, {}, io);
    expect(io.warnings[0]).toMatch(/could not read Claude Code permissions/);
    expect(JSON.parse(await readText(settingsFile()))).toEqual({ permissions: { allow: "all" } });
  });

  it("can allow the skill for an already initialized project", async () => {
    await init(root, { allowSkill: false }, fakeIo(env));
    const io = fakeIo(env, [], true);
    await init(root, { allowSkill: true }, io);
    expect(await readSkillAllowed(env)).toBe(true);
    expect(io.lines.at(-1)).toBe(`Already initialized: proj (${root})`);
  });

  it("is idempotent for an initialized project", async () => {
    await init(root, {}, fakeIo(env));
    const io = fakeIo(env, [], true);
    await init(root, {}, io);
    expect(io.lines).toEqual([`Already initialized: proj (${root})`]);
    const reg = await loadRegistry(env);
    expect(reg.found && reg.ok && reg.data.projects).toHaveLength(1);
  });

  it("refuses a corrupt project.json", async () => {
    await mkdir(join(root, ".cogit"));
    await writeFile(join(root, ".cogit", "project.json"), "[]");
    await expect(init(root, {}, fakeIo(env))).rejects.toThrow(/not a JSON object/);
  });

  it("still initializes when the global dir is not writable", async () => {
    await writeFile(join(dir, "home"), "a file, not a dir");
    const io = fakeIo(env);
    await init(root, {}, io);
    expect(io.warnings.map((w) => w.split(":")[0])).toEqual([
      "could not save global config",
      "could not register the project in the global panel",
    ]);
    expect(await loadProject(root)).toMatchObject({ ok: true });
  });
});

describe("git helpers", () => {
  it("finds the repo root from a subdirectory, also for worktree .git files", async () => {
    await writeFile(join(root, ".git"), "gitdir: /elsewhere");
    const sub = join(root, "a", "b");
    await mkdir(sub, { recursive: true });
    expect(await findGitRoot(sub)).toBe(root);
    expect(await findGitRoot("/")).toBeUndefined();
  });

  it("adds the ignore line under the ignore policy and removes it when switching", async () => {
    const gi = join(root, ".gitignore");
    await writeFile(gi, "node_modules/");
    expect(await ensureGitignore(root, "commit")).toEqual([]);
    expect(await readText(gi)).toBe("node_modules/");
    expect(await ensureGitignore(root, "ignore")).toEqual(["/.cogit/"]);
    expect(await ensureGitignore(root, "ignore")).toEqual([]);
    const text = await readText(gi);
    expect(text).toBe("node_modules/\n# cogit\n/.cogit/\n");
    expect(text.match(/# cogit/g)).toHaveLength(1);
    // Switching back removes only our line, never the user's.
    expect(await ensureGitignore(root, "commit")).toEqual([]);
    expect(await readText(gi)).toBe("node_modules/\n# cogit\n");
    expect(basename(gi)).toBe(".gitignore");
  });

  it("installs the git hooks with the ignore policy too, for the trailer", async () => {
    const run = promisify(execFile);
    await run("git", ["-C", root, "init", "-q"]);
    await init(
      root,
      { name: "P", git: "ignore", retention: "keep", allowSkill: false, language: "auto" },
      fakeIo(env),
    );
    const hook = await readText(join(root, ".git", "hooks", "prepare-commit-msg"));
    expect(hook).toContain("hook prepare-commit-msg --dir");
    // Running init again on the ignore project keeps the hooks current.
    await rm(join(root, ".git", "hooks", "prepare-commit-msg"));
    await init(root, { allowSkill: false }, fakeIo(env));
    expect(existsSync(join(root, ".git", "hooks", "prepare-commit-msg"))).toBe(true);
  });

  it("restores the record hook when init runs again on a commit project", async () => {
    const run = promisify(execFile);
    const git = (...args: string[]) => run("git", ["-C", root, ...args]);
    await git("init", "-q");
    await git("config", "user.email", "t@example.com");
    await git("config", "user.name", "Tester");
    await init(
      root,
      { name: "P", git: "commit", retention: "keep", allowSkill: false, language: "auto" },
      fakeIo(env),
    );
    const hook = join(root, ".git", "hooks", "pre-commit");
    expect(existsSync(hook)).toBe(true);
    await rm(hook);
    const io = fakeIo(env);
    await init(root, { retention: "keep" }, io);
    expect(io.lines[0]).toMatch(/^Already initialized: P/);
    expect(existsSync(hook)).toBe(true);
  });

  it("warns about an unwritable root ignore file and still initializes", async () => {
    // A directory where .gitignore belongs makes the write fail.
    await mkdir(join(root, ".git"));
    await mkdir(join(root, ".gitignore"));
    const io = fakeIo(env);
    await init(
      root,
      { name: "P", git: "ignore", retention: "keep", allowSkill: false, language: "auto" },
      io,
    );
    expect(io.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/^could not update \.gitignore: /)]),
    );
    expect(await loadProject(root)).toMatchObject({ ok: true });
  });
});

describe("setRetention", () => {
  it("rejects invalid day counts and unparsable files", async () => {
    await expect(setRetention(0, env, T0)).rejects.toThrow(/at least 1/);
    await mkdir(join(dir, "claude"));
    await writeFile(settingsFile(), "[1]");
    await expect(setRetention(90, env, T0)).rejects.toThrow(/not a valid JSON object/);
    expect(await readRetention(env)).toBeUndefined();
  });

  it("creates the settings file without a backup when there was none", async () => {
    expect(await setRetention(90, env, T0)).toEqual({ file: settingsFile() });
    expect(await readRetention(env)).toBe(90);
  });
});

describe("allowSkill", () => {
  it("treats a non-object permissions value as unreadable and refuses to change it", async () => {
    await mkdir(join(dir, "claude"));
    await writeFile(settingsFile(), JSON.stringify({ permissions: ["x"] }));
    expect(await readSkillAllowed(env)).toBeUndefined();
    await expect(allowSkill(env, T0)).rejects.toThrow(/unexpected permissions.allow/);
  });

  it("keeps the file as it is when the rule is already there", async () => {
    await allowSkill(env, T0);
    await allowSkill(env, T0);
    expect(JSON.parse(await readText(settingsFile()))).toEqual({
      permissions: { allow: [SKILL_RULE] },
    });
  });
});
