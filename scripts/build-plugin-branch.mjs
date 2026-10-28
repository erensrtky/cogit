#!/usr/bin/env node
// The marketplace installs the plugin from the `plugin` branch: only what Claude Code loads,
// built, with no source. main keeps dist/ out of git, so this writes the branch with git
// plumbing (a private index, no checkout) after `npm run build`. The release Action runs it on
// every v* tag; run it by hand to create the branch the first time.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** What the branch holds, relative to packages/cli; README and LICENSE come from the root. */
export const PLUGIN_FILES = [".claude-plugin/plugin.json", "dist", "hooks/hooks.json", "skills"];
export const ROOT_FILES = ["README.md", "LICENSE"];

/** Copies the built plugin into `target`; throws when the build is missing. */
export function stagePlugin(root, target) {
  const pkg = join(root, "packages/cli");
  if (!existsSync(join(pkg, "dist/cli.js")))
    throw new Error("packages/cli/dist/cli.js is missing: run `npm run build` first");
  for (const rel of PLUGIN_FILES) cpSync(join(pkg, rel), join(target, rel), { recursive: true });
  for (const rel of ROOT_FILES) cpSync(join(root, rel), join(target, rel));
  return [...PLUGIN_FILES, ...ROOT_FILES];
}

/**
 * Commits the built plugin onto `branch` in the repository at `root` without touching its
 * working tree or index. Returns the branch's commit and whether this run added one.
 */
export function writePluginBranch(root, { branch = "plugin" } = {}) {
  const git = (args, env = {}) =>
    execFileSync("git", args, { cwd: root, env: { ...process.env, ...env }, encoding: "utf8" }).trim();
  const version = readFileSync(join(root, "VERSION"), "utf8").trim();
  const scratch = mkdtempSync(join(tmpdir(), "cogit-plugin-"));
  try {
    const tree = join(scratch, "tree");
    stagePlugin(root, tree);
    const env = { GIT_INDEX_FILE: join(scratch, "index") };
    // -f: a global or .git/info excludes rule must not drop dist/ from the branch.
    git(["--work-tree", tree, "add", "-A", "-f", "."], env);
    const treeId = git(["write-tree"], env);
    let parent = "";
    try {
      parent = git(["rev-parse", "--verify", "-q", `refs/heads/${branch}`]);
    } catch {}
    if (parent && git(["rev-parse", `${parent}^{tree}`]) === treeId)
      return { commit: parent, changed: false, version };
    const commit = git([
      "commit-tree",
      treeId,
      ...(parent ? ["-p", parent] : []),
      "-m",
      `plugin v${version}`,
    ]);
    // The old value guards against another writer moving the branch meanwhile.
    git(["update-ref", `refs/heads/${branch}`, commit, ...(parent ? [parent] : [])]);
    return { commit, changed: true, version };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Writes the branch of `root` (this repository by default) and prints what happened. */
export function run(log = console.log, root = join(dirname(fileURLToPath(import.meta.url)), "..")) {
  const result = writePluginBranch(root);
  log(
    result.changed
      ? `plugin: v${result.version} at ${result.commit.slice(0, 7)}`
      : `plugin: v${result.version} unchanged at ${result.commit.slice(0, 7)}`,
  );
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
