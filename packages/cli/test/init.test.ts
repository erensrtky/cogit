import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { readRetention, setRetention } from "../src/claude-settings.js";
import { init } from "../src/commands/init.js";
import { ensureGitignore, findGitRoot } from "../src/git.js";
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
  it("creates the project with defaults and registers it", async () => {
    const io = fakeIo(env);
    await init(root, {}, io);
    expect(await loadProject(root)).toMatchObject({ ok: true, data: { name: "proj", epochs: [] } });
    expect(await readdir(join(root, ".codelineage"))).toContain("sessions");
    expect(await loadRegistry(env)).toMatchObject({
      ok: true,
      data: { projects: [{ path: root, name: "proj" }] },
    });
    expect((await loadConfig(env)).language).toBe("auto");
    // not a git repo: name, retention and language were asked
    expect(io.asked).toHaveLength(3);
    expect(io.lines.at(-2)).toMatch(/^Initialized proj/);
  });

  it("asks nothing when every answer is given as an option", async () => {
    await mkdir(join(root, ".git"));
    const io = fakeIo(env, [], true);
    await init(root, { name: "P", git: "commit", retention: "keep", language: "Turkish" }, io);
    expect((await loadConfig(env)).language).toBe("Turkish");
    expect(await readText(join(root, ".gitignore"))).toContain("/.codelineage/snapshots/");
  });

  it("asks for the git policy in a repo and writes .gitignore", async () => {
    await mkdir(join(root, ".git"));
    const io = fakeIo(env, ["proj", "ignore"]);
    await init(root, {}, io);
    expect(await readText(join(root, ".gitignore"))).toBe("# codelineage\n/.codelineage/\n");
    expect(io.lines).toContain("Added to .gitignore: /.codelineage/");
  });

  it("raises transcript retention when asked, keeping other settings", async () => {
    await mkdir(join(dir, "claude"));
    await writeFile(settingsFile(), JSON.stringify({ model: "x" }));
    const io = fakeIo(env, ["proj", "365"]);
    await init(root, {}, io);
    expect(JSON.parse(await readText(settingsFile()))).toEqual({
      model: "x",
      cleanupPeriodDays: 365,
    });
    const files = await readdir(join(dir, "claude"));
    expect(files.some((f) => f.startsWith("settings.json.codelineage-bak-"))).toBe(true);
    expect(io.lines.some((l) => l.includes("Set cleanupPeriodDays to 365"))).toBe(true);
  });

  it("does not ask about retention when it is already long", async () => {
    await mkdir(join(dir, "claude"));
    await writeFile(settingsFile(), JSON.stringify({ cleanupPeriodDays: 365 }));
    const io = fakeIo(env);
    await init(root, {}, io);
    expect(io.lines).toContain("Claude Code keeps transcripts for 365 days.");
    expect(io.asked).toHaveLength(2);
  });

  it("applies a retention option without asking, and skips an unchanged one", async () => {
    await init(root, { name: "p", retention: 90, language: "auto" }, fakeIo(env, [], true));
    expect(await readRetention(env)).toBe(90);
    const again = join(dir, "other");
    await mkdir(again);
    const io = fakeIo(env, [], true);
    await init(again, { name: "o", retention: 90 }, io);
    expect(io.lines.some((l) => l.includes("cleanupPeriodDays"))).toBe(false);
  });

  it("warns and moves on when Claude Code settings are unreadable", async () => {
    await mkdir(join(dir, "claude"));
    await writeFile(settingsFile(), "{oops");
    const io = fakeIo(env);
    await init(root, {}, io);
    expect(io.warnings[0]).toMatch(/retention left unchanged/);
    expect(await readText(settingsFile())).toBe("{oops");
  });

  it("asks which fixed language on the first run only", async () => {
    await init(root, {}, fakeIo(env, ["proj", "keep", "fixed", "Turkish"]));
    expect((await loadConfig(env)).language).toBe("Turkish");
    const second = join(dir, "second");
    await mkdir(second);
    const io = fakeIo(env);
    await init(second, {}, io);
    expect(io.asked.some((q) => q.startsWith("Language"))).toBe(false);
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
    await mkdir(join(root, ".codelineage"));
    await writeFile(join(root, ".codelineage", "project.json"), "[]");
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

  it("appends only missing lines and keeps existing content", async () => {
    const gi = join(root, ".gitignore");
    await writeFile(gi, "node_modules/");
    expect(await ensureGitignore(root, "commit")).toHaveLength(4);
    expect(await ensureGitignore(root, "commit")).toEqual([]);
    expect(await ensureGitignore(root, "ignore")).toEqual(["/.codelineage/"]);
    const text = await readText(gi);
    expect(text.startsWith("node_modules/\n# codelineage\n")).toBe(true);
    expect(text.match(/# codelineage/g)).toHaveLength(1);
    expect(basename(gi)).toBe(".gitignore");
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
