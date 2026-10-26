import { chmod, mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { findGitRoot, gitHooksDir } from "./git.js";
import { stageSessionFiles } from "./session-git.js";
import { atomicWrite } from "./store/fs.js";

/**
 * Git hook installation (Story 9.3). cogit never owns a hook file: it adds a
 * marked block that calls back into the CLI, leaves whatever the user (or Husky)
 * put there alone, and a failure never blocks `init` or a commit.
 */

export const BLOCK_START = "# >>> cogit";
export const BLOCK_END = "# <<< cogit";

/** The block `init` adds to a hook; `"$@"` passes git's arguments through. */
export function hookBlock(event: string, projectRoot: string): string {
  return [
    BLOCK_START,
    `cogit hook ${event} --dir ${shellQuote(projectRoot)} "$@" || true`,
    BLOCK_END,
  ].join("\n");
}

/** Single quotes for the shell, with the embedded single quote escaped. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** Replaces an existing cogit block, or appends one, keeping the file's own content. */
export function withHookBlock(text: string, block: string): string {
  const pattern = /# >>> cogit[\s\S]*?# <<< cogit/g;
  if (pattern.test(text)) return text.replace(pattern, block);
  // An empty file still has to be runnable: git execs the hook directly.
  if (text === "") return `#!/bin/sh\n\n${block}\n`;
  const sep = text.endsWith("\n") ? "" : "\n";
  return `${text}${sep}\n${block}\n`;
}

/**
 * Installs the block into the hook file git actually uses. Returns true when the
 * file changed, false when the block was already current or the repository does
 * not expose a hooks directory (a bare `.git` directory in tests, a non-repo).
 */
export async function installGitHook(root: string, event: string): Promise<boolean> {
  const gitRoot = await findGitRoot(root);
  if (gitRoot === undefined) return false;
  const dir = await gitHooksDir(gitRoot);
  if (dir === undefined) return false;
  await mkdir(dir, { recursive: true });
  const file = join(dir, event);
  const exists = await stat(file).then(
    () => true,
    () => false,
  );
  const current = exists ? await readFile(file, "utf8") : "";
  const block = hookBlock(event, root);
  const next = exists ? withHookBlock(current, block) : `#!/bin/sh\n\n${block}\n`;
  if (exists && next === current) return false;
  await atomicWrite(file, next);
  await chmod(file, 0o755);
  return true;
}

/**
 * The git-side events cogit answers (Story 9.3). A git hook's stdin is not the
 * Claude Code hook JSON, so these never go through `runHook`.
 */
export const GIT_HOOK_EVENTS = ["pre-commit"] as const;
export type GitHookEvent = (typeof GIT_HOOK_EVENTS)[number];

export function isGitHookEvent(event: string): event is GitHookEvent {
  return (GIT_HOOK_EVENTS as readonly string[]).includes(event);
}

/**
 * Runs one git hook. A git hook that fails would block the user's commit, so the
 * CLI calls this inside its own silence: nothing here throws or prints.
 */
export async function runGitHook(
  event: GitHookEvent,
  dir: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (event === "pre-commit") await stageSessionFiles(dir, env);
}
