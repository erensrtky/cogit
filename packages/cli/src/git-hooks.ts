import { chmod, mkdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { findGitRoot, gitHooksDir } from "./git.js";
import { stageSessionFiles } from "./session-git.js";
import { atomicWrite } from "./store/fs.js";
import { addThoughtTrailer } from "./thought.js";

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

/** Removes the marked block and the blank separator `withHookBlock` added. */
export function withoutHookBlock(text: string): string {
  const next = text.replace(/# >>> cogit\n[\s\S]*?# <<< cogit\n?/, "");
  return next.endsWith("\n\n") ? next.slice(0, -1) : next;
}

/** True when what is left is only the shebang `installGitHook` wrote itself. */
function onlyGeneratedShebang(text: string): boolean {
  return text.split("\n").every((line) => line.trim() === "" || line.trim() === "#!/bin/sh");
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
 * The git-side events cogit answers (Stories 9.3, 9.4). A git hook's stdin is
 * not the Claude Code hook JSON, so these never go through `runHook`.
 * `pre-commit` carries the session record with a code commit; `prepare-commit-msg`
 * adds the `Thought:` trailer that names the message behind it.
 */
export const GIT_HOOK_EVENTS = ["pre-commit", "prepare-commit-msg"] as const;
export type GitHookEvent = (typeof GIT_HOOK_EVENTS)[number];

export function isGitHookEvent(event: string): event is GitHookEvent {
  return (GIT_HOOK_EVENTS as readonly string[]).includes(event);
}

/** Installs the cogit block into every hook git would run; returns the events added. */
export async function installGitHooks(root: string): Promise<GitHookEvent[]> {
  const installed: GitHookEvent[] = [];
  for (const event of GIT_HOOK_EVENTS) {
    if (await installGitHook(root, event)) installed.push(event);
  }
  return installed;
}

/**
 * Removes only cogit's block from the hooks it installed (Story 9.4): the user's
 * own lines stay, and a file that held nothing but the shebang cogit wrote is
 * deleted. Returns the events that changed.
 */
export async function uninstallGitHooks(root: string): Promise<GitHookEvent[]> {
  const gitRoot = await findGitRoot(root);
  if (gitRoot === undefined) return [];
  const dir = await gitHooksDir(gitRoot);
  if (dir === undefined) return [];
  const removed: GitHookEvent[] = [];
  for (const event of GIT_HOOK_EVENTS) {
    const file = join(dir, event);
    const current = await readFile(file, "utf8").catch(() => undefined);
    if (current === undefined || !current.includes(BLOCK_START)) continue;
    const next = withoutHookBlock(current);
    if (onlyGeneratedShebang(next)) await rm(file, { force: true });
    else await atomicWrite(file, next);
    removed.push(event);
  }
  return removed;
}

/**
 * Runs one git hook. A git hook that fails would block the user's commit, so the
 * CLI calls this inside its own silence: nothing here throws or prints. `args`
 * are what the hook script was given (`$@`): for `prepare-commit-msg` the message
 * file and the commit source.
 */
export async function runGitHook(
  event: GitHookEvent,
  dir: string,
  env: NodeJS.ProcessEnv = process.env,
  args: readonly string[] = [],
  now: Date = new Date(),
): Promise<void> {
  if (event === "pre-commit") {
    await stageSessionFiles(dir, env);
    return;
  }
  const [messageFile, source] = args;
  if (messageFile === undefined || messageFile === "") return;
  await addThoughtTrailer({
    dir,
    messageFile,
    ...(source === undefined ? {} : { source }),
    env,
    now,
  });
}
