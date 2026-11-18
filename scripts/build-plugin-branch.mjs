#!/usr/bin/env node
// Every agent's marketplace installs the plugin from the `plugin` branch: only what the agents
// load, built, with no source, one folder per agent (AGENT_FOLDERS). main keeps dist/ out of git, so this writes the branch with git
// plumbing (a private index, no checkout) after `npm run build`. The release Action runs it on
// every v* tag; run it by hand to create the branch the first time.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Each agent's own folder on the branch, keyed like AGENTS in src/agents: the files that agent
 * loads, relative to packages/cli, plus SHARED_FILES. Every agent installs the same way, from
 * this branch with only its folder fetched (a `git-subdir` source), so a new agent gets a row
 * here; a test fails while one is missing.
 */
export const AGENT_FOLDERS = {
  "claude-code": {
    dir: "claude",
    files: [".claude-plugin/plugin.json", "hooks/hooks.json", "skills"],
    marketplace: ".claude-plugin/marketplace.json",
  },
  codex: {
    dir: "codex",
    files: [".codex-plugin/plugin.json", "hooks/codex.json"],
    marketplace: ".agents/plugins/marketplace.json",
  },
};

/** The source every agent's marketplace (`marketplace`, from the repository root) lists. */
export function pluginSource(dir) {
  return { source: "git-subdir", url: "https://github.com/erensrtky/cogit.git", ref: "plugin", path: dir };
}
/** What every agent folder holds besides its own files. */
export const SHARED_FILES = ["dist"];
export const ROOT_FILES = ["README.md", "LICENSE"];

/**
 * What the branch root holds: every agent's files together, as before the folders. Installs
 * whose marketplace still names the root (no `path`) read it; drop it once those are gone.
 */
export const PLUGIN_FILES = [
  ...new Set([...Object.values(AGENT_FOLDERS).flatMap((agent) => agent.files), ...SHARED_FILES]),
].sort();

/** Copies the built plugin into `target`; throws when the build is missing. */
export function stagePlugin(root, target) {
  const pkg = join(root, "packages/cli");
  if (!existsSync(join(pkg, "dist/cli.js")))
    throw new Error("packages/cli/dist/cli.js is missing: run `npm run build` first");
  const copy = (from, to) => cpSync(from, join(target, to), { recursive: true });
  for (const rel of PLUGIN_FILES) copy(join(pkg, rel), rel);
  for (const rel of ROOT_FILES) copy(join(root, rel), rel);
  for (const { dir, files } of Object.values(AGENT_FOLDERS)) {
    for (const rel of [...files, ...SHARED_FILES]) copy(join(pkg, rel), join(dir, rel));
    for (const rel of ROOT_FILES) copy(join(root, rel), join(dir, rel));
  }
  return [...PLUGIN_FILES, ...ROOT_FILES, ...Object.values(AGENT_FOLDERS).map((agent) => agent.dir)];
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
