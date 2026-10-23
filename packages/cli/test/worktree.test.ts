import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildProject } from "../src/commands/build.js";
import { configSet } from "../src/commands/config.js";
import { epochAdd } from "../src/commands/epoch.js";
import { init } from "../src/commands/init.js";
import { sessionShow, sessionWrite } from "../src/commands/session.js";
import { runHook } from "../src/hooks/run.js";
import { projectPaths } from "../src/store/paths.js";
import { resolveProjectRoot } from "../src/store/root.js";
import { loadProject, loadSession } from "../src/store/stores.js";
import { DATA_ELEMENT_ID } from "../src/view/model.js";
import { envFor, fakeIo, T0, tempDir } from "./helpers.js";

/**
 * A git layout made of plain files, the way `git worktree add` leaves it: the
 * main checkout has a `.git/` directory, the worktree a `.git` file pointing at
 * `.git/worktrees/<name>/`, which holds `HEAD` and `commondir`.
 */
async function gitLayout(dir: string, head = "ref: refs/heads/feature\n") {
  const main = join(dir, "main");
  const wt = join(dir, "wt");
  const gitdir = join(main, ".git", "worktrees", "wt");
  await mkdir(gitdir, { recursive: true });
  await mkdir(join(wt, "src"), { recursive: true });
  await writeFile(join(gitdir, "HEAD"), head);
  await writeFile(join(gitdir, "commondir"), "../..\n");
  await writeFile(join(wt, ".git"), `gitdir: ${gitdir}\n`);
  return { main, wt, gitdir };
}

describe("resolveProjectRoot", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await tempDir();
  });

  it("keeps a directory outside git or in a main checkout", async () => {
    const { main } = await gitLayout(dir);
    expect(await resolveProjectRoot(join(dir, "nowhere"))).toEqual({ root: join(dir, "nowhere") });
    expect(await resolveProjectRoot(main)).toEqual({ root: main });
  });

  it("maps a worktree to the main checkout and names the branch", async () => {
    const { main, wt } = await gitLayout(dir);
    expect(await resolveProjectRoot(wt)).toEqual({
      root: main,
      worktree: { path: wt, branch: "feature" },
    });
    expect((await resolveProjectRoot(join(wt, "src"))).root).toBe(join(main, "src"));
  });

  it("keeps a worktree that has its own committed .codelineage/", async () => {
    const { wt } = await gitLayout(dir);
    await mkdir(join(wt, ".codelineage"));
    await writeFile(projectPaths(wt).project, "{}");
    expect(await resolveProjectRoot(wt)).toEqual({
      root: wt,
      worktree: { path: wt, branch: "feature" },
    });
  });

  it("reads a relative gitdir and a detached HEAD", async () => {
    const { main, wt } = await gitLayout(dir, "0123456789abcdef0123456789abcdef01234567\n");
    await writeFile(join(wt, ".git"), "gitdir: ../main/.git/worktrees/wt\n");
    expect(await resolveProjectRoot(wt)).toEqual({
      root: main,
      worktree: { path: wt, branch: null },
    });
  });

  it("falls back to the directory for a broken .git file", async () => {
    const { wt, gitdir } = await gitLayout(dir);
    await writeFile(join(wt, ".git"), "not a pointer\n");
    expect(await resolveProjectRoot(wt)).toEqual({ root: wt });
    await writeFile(join(wt, ".git"), `gitdir: ${join(gitdir, "..", "gone")}\n`);
    expect(await resolveProjectRoot(wt)).toEqual({ root: wt });
  });
});

describe("commands in a worktree", () => {
  let dir: string;
  let main: string;
  let wt: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    dir = await tempDir();
    ({ main, wt } = await gitLayout(dir));
    env = envFor(dir);
    await init(main, { name: "p", retention: "keep", language: "auto" }, fakeIo(env));
  });

  it("writes the record to the main checkout and keeps the worktree on it", async () => {
    await sessionWrite({ dir: wt }, fakeIo(env), async () => '{"sessionId":"s1","title":"a"}');
    expect(existsSync(join(wt, ".codelineage"))).toBe(false);
    const first = await loadSession(main, "s1");
    expect(first.found && first.ok && first.data.worktree).toEqual({ path: wt, branch: "feature" });

    // After a resume from the main checkout, a write there keeps the stored worktree.
    await sessionWrite({ dir: main }, fakeIo(env), async () => '{"sessionId":"s1","title":"b"}');
    const second = await loadSession(main, "s1");
    expect(second.found && second.ok && second.data).toMatchObject({
      title: "b",
      worktree: { path: wt },
    });

    const templateHtml = `<script id="${DATA_ELEMENT_ID}" type="application/json"></script>`;
    const model = await buildProject({ dir: wt, io: fakeIo(env), templateHtml });
    expect(model.unassigned[0]?.worktree).toEqual({ path: wt, branch: "feature" });
  });

  it("shows the main record, the worktree as dir and the inbox under it", async () => {
    const io = fakeIo(env);
    await sessionShow(wt, "s1", io);
    expect(JSON.parse(io.lines[0] ?? "")).toMatchObject({
      initialized: true,
      dir: wt,
      store: main,
      inbox: projectPaths(wt).inbox("s1"),
    });

    const plain = fakeIo(env);
    await sessionShow(main, "s1", plain);
    expect(JSON.parse(plain.lines[0] ?? "")).not.toHaveProperty("store");
  });

  it("reports the store of an uninitialized main checkout", async () => {
    const other = await gitLayout(join(dir, "x"));
    const io = fakeIo(env);
    await sessionShow(other.wt, "s1", io);
    expect(JSON.parse(io.lines[0] ?? "")).toEqual({
      initialized: false,
      dir: other.wt,
      store: other.main,
    });
  });

  it("adds epochs to the main project", async () => {
    await epochAdd(wt, "e1", "Epoch", fakeIo(env));
    const project = await loadProject(main);
    expect(project.found && project.ok && project.data.epochs.map((e) => e.id)).toEqual(["e1"]);
  });

  it("counts hook turns for a worktree session in the main checkout", async () => {
    await configSet("updateEveryTurns", "1", fakeIo(env));
    const input = JSON.stringify({ session_id: "s1", cwd: wt });
    const out = await runHook("stop", input, { ...env, CLAUDE_PROJECT_DIR: wt }, T0, () => {});
    expect(out).toBeDefined();
    expect(existsSync(projectPaths(main).state("s1"))).toBe(true);
  });
});
