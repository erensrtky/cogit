import { realpathSync } from "node:fs";
import { chmod, mkdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { findGitRoot, gitHooksDir, resolveCommit } from "./git.js";
import { spawnDetachedProcess } from "./hooks/run.js";
import { pushIsDryRun } from "./push-command.js";
import { countUnsentRecords } from "./record-sync.js";
import { atomicWrite } from "./store/fs.js";
import { captureDisabled, projectPaths } from "./store/paths.js";
import { loadConfig } from "./store/stores.js";
import { addThoughtTrailer } from "./thought.js";

/**
 * Git hook installation (Story 9.3). cogit never owns a hook file: it adds a
 * marked block that calls back into the CLI, leaves whatever the user (or Husky)
 * put there alone, and a failure never blocks `init` or a commit.
 */

export const BLOCK_START = "# >>> cogit";
export const BLOCK_END = "# <<< cogit";

/**
 * The CLI that installs the hooks: the fallback when `cogit` is not on PATH, the
 * common case for a plugin-only install. A path that later disappears (a plugin
 * update) is refreshed by the next UserPromptSubmit hook.
 */
export function currentCliPath(): string | undefined {
  const entry = process.argv[1];
  if (entry === undefined || entry === "") return undefined;
  try {
    return realpathSync(entry);
  } catch {
    return undefined;
  }
}

/**
 * The block `init` adds to a hook, at the top so a user line that exits early
 * (`exit 0`) can never skip it. A `cogit` on PATH wins; otherwise the CLI that
 * installed the block runs under `node`; with neither, the hook does nothing and
 * the commit goes on.
 *
 * - `pre-push` reads git's stdin itself and hands it back to the lines below,
 *   so a user hook that reads it still gets it and cogit always sees the refs.
 * - `prepare-commit-msg` runs at exit, after the user's lines: a tool that
 *   rewrites the message file (commitizen) keeps the `Thought:` trailer, and the
 *   user's exit status stays the hook's.
 */
export function hookBlock(
  event: string,
  projectRoot: string,
  cliPath: string | null = currentCliPath() ?? null,
): string {
  if (event === "pre-push") {
    return [
      BLOCK_START,
      "cogit_stdin=$(cat)",
      ...cogitCall(event, projectRoot, cliPath, `printf '%s' "$cogit_stdin" | `, ""),
      'if [ -n "$cogit_stdin" ]; then exec <<COGIT_STDIN',
      "$cogit_stdin",
      "COGIT_STDIN",
      "else exec </dev/null; fi",
      BLOCK_END,
    ].join("\n");
  }
  if (event === "prepare-commit-msg") {
    return [
      BLOCK_START,
      "cogit_msg=${1-} cogit_source=${2-}",
      "cogit_thought() {",
      ...cogitCall(event, projectRoot, cliPath, "", "  "),
      "}",
      `trap 'cogit_status=$?; cogit_thought "$cogit_msg" "$cogit_source"; exit $cogit_status' EXIT`,
      BLOCK_END,
    ].join("\n");
  }
  return [BLOCK_START, ...cogitCall(event, projectRoot, cliPath, "", ""), BLOCK_END].join("\n");
}

/** The `cogit` / `node <cli>` branches that run one hook; `"$@"` passes git's arguments. */
function cogitCall(
  event: string,
  projectRoot: string,
  cliPath: string | null,
  pipe: string,
  indent: string,
): string[] {
  const args = `hook ${event} --dir ${shellQuote(projectRoot)} "$@"`;
  const lines = ["if command -v cogit >/dev/null 2>&1; then", `  ${pipe}cogit ${args} || true`];
  if (cliPath !== null) {
    const cli = shellQuote(cliPath);
    lines.push(
      `elif command -v node >/dev/null 2>&1 && [ -f ${cli} ]; then`,
      `  ${pipe}node ${cli} ${args} || true`,
    );
  }
  lines.push("fi");
  return lines.map((line) => `${indent}${line}`);
}

/**
 * The line of a block that names the project and the hook command; doctor
 * compares only this one, since the fallback CLI path differs between installs.
 */
export function hookCommandLine(event: string, projectRoot: string): string {
  return (
    hookBlock(event, projectRoot, null)
      .split("\n")
      .find((line) => line.includes("cogit hook ")) ?? ""
  );
}

/**
 * True when cogit can add its block: a new or empty file, one without a
 * shebang, or a `sh`-family script. A Python or Node hook is left alone, since
 * shell lines would break it; doctor reports it.
 */
export function isShellHook(text: string): boolean {
  const first = text.split("\n", 1)[0] ?? "";
  if (!first.startsWith("#!")) return true;
  return /(^|[/\s])(sh|bash|dash|zsh|ksh|ash)(\s|$)/.test(first.slice(2).trim());
}

/** Single quotes for the shell, with the embedded single quote escaped. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * Puts the cogit block right under the shebang, keeping the file's own content.
 * An older block anywhere in the file (past versions appended it) moves up.
 */
export function withHookBlock(text: string, block: string): string {
  const rest = text.includes(BLOCK_START) ? withoutHookBlock(text) : text;
  // An empty file still has to be runnable: git execs the hook directly.
  if (rest === "") return `#!/bin/sh\n${block}\n`;
  if (!rest.startsWith("#!")) return `${block}\n${rest}`;
  const cut = rest.indexOf("\n");
  if (cut === -1) return `${rest}\n${block}\n`;
  return `${rest.slice(0, cut + 1)}${block}\n${rest.slice(cut + 1)}`;
}

/**
 * Removes the marked block, and the blank line older versions put before it
 * when they appended it; the user's own blank lines stay.
 */
export function withoutHookBlock(text: string): string {
  return text.replace(/(\n\n)?# >>> cogit\n[\s\S]*?# <<< cogit\n?/, (_all, gap) =>
    gap === undefined ? "" : "\n",
  );
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
  if (!isShellHook(current)) return false;
  const next = withHookBlock(current, hookBlock(event, root));
  if (exists && next === current) return false;
  await atomicWrite(file, next);
  await chmod(file, 0o755);
  return true;
}

/**
 * The git-side events cogit answers (Stories 9.3, 9.4, 13.6). A git hook's stdin
 * is not the Claude Code hook JSON, so these never go through `runHook`.
 * `pre-push` sends the session records along with the code; `prepare-commit-msg`
 * adds the `Thought:` trailer that names the message behind it; `post-commit`
 * queues the Shape of a message that landed commits, outside the commit.
 */
export const GIT_HOOK_EVENTS = ["prepare-commit-msg", "post-commit", "pre-push"] as const;

/** Hooks older versions installed: their block is removed on the next refresh. */
const RETIRED_GIT_HOOK_EVENTS = ["pre-commit"] as const;
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
 * Rewrites the blocks that are already there, so they point at the CLI running
 * now (a plugin update moves it). Never adds a block to a hook that has none.
 */
export async function refreshGitHooks(root: string): Promise<GitHookEvent[]> {
  const gitRoot = await findGitRoot(root);
  if (gitRoot === undefined) return [];
  const dir = await gitHooksDir(gitRoot);
  if (dir === undefined) return [];
  const refreshed: GitHookEvent[] = [];
  const hasBlock = async (event: string): Promise<boolean> =>
    ((await readFile(join(dir, event), "utf8").catch(() => undefined)) ?? "").includes(BLOCK_START);
  // A hook this version added reaches a clone that already has cogit's others.
  const installed = await hasBlock("prepare-commit-msg");
  for (const event of GIT_HOOK_EVENTS) {
    if (!installed && !(await hasBlock(event))) continue;
    if (await installGitHook(root, event)) refreshed.push(event);
  }
  await removeHookBlocks(dir, RETIRED_GIT_HOOK_EVENTS);
  return refreshed;
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
  await removeHookBlocks(dir, RETIRED_GIT_HOOK_EVENTS);
  return removeHookBlocks(dir, GIT_HOOK_EVENTS);
}

/** Takes cogit's block out of these hooks; returns the ones that had one. */
async function removeHookBlocks<Event extends string>(
  dir: string,
  events: readonly Event[],
): Promise<Event[]> {
  const removed: Event[] = [];
  for (const event of events) {
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

const NO_OBJECT = /^0+$/;

/**
 * The `pre-push` hook (`pushedRefs` is git's stdin: one `<ref> <sha> <remote ref> <sha>` a
 * line): hands the records to a background run that waits for this
 * push to land, so the user's push never waits for the network, never meets a second
 * SSH prompt and never fails because of a record. A push that only deletes sends
 * nothing. The line is the only sign that something else is leaving the machine.
 */
async function sendWithPush(
  dir: string,
  env: NodeJS.ProcessEnv,
  pushedRemote: string | undefined,
  pushedRefs: string,
  spawn: typeof spawnDetachedProcess,
  dryRun: () => boolean,
): Promise<void> {
  if (captureDisabled(env)) return;
  if (dryRun()) return;
  const lines = pushedRefs.split("\n").filter(Boolean);
  const going = lines
    .map((line) => line.split(" "))
    .find((part) => !NO_OBJECT.test(part[1] ?? "0"));
  if (lines.length > 0 && going === undefined) return;
  const unsent = await countUnsentRecords(dir, env, pushedRemote);
  if (unsent === 0) return;
  const cli = currentCliPath();
  if (cli === undefined) return;
  process.stderr.write(
    `cogit: ${unsent} session record${unsent === 1 ? "" : "s"} will follow this push to ${pushedRemote}\n`,
  );
  const after = going === undefined ? [] : ["--after", `${going[2]}=${going[1]}`];
  spawn(
    cli,
    ["record-sync", "send-pushed", ...after, "-C", dir],
    env,
    projectPaths(dir).detachedLog,
  );
}

/**
 * Starts the Shape of the commit that just landed (Story 13.6). The commit's
 * `Thought:` trailer, read by the shape run, names the message, so the Shape
 * lands on the session that committed, not on whichever session wrote
 * `.cogit/HEAD` last. Detached and silent: a commit never waits for a
 * side-model run, and a failure lands in the detached log like the session-end
 * pass. In `agent` mode the record skill writes the Shape itself.
 */
async function queueShape(
  dir: string,
  env: NodeJS.ProcessEnv,
  spawn: typeof spawnDetachedProcess,
): Promise<void> {
  if (captureDisabled(env)) return;
  const config = await loadConfig(env).catch(() => undefined);
  if (config === undefined || !config.shapes || config.recorder === "agent") return;
  const gitRoot = await findGitRoot(dir);
  if (gitRoot === undefined) return;
  const commit = await resolveCommit(gitRoot, "HEAD");
  if (commit === undefined) return;
  const cli = currentCliPath();
  if (cli === undefined) return;
  spawn(cli, ["shape", "--commit", commit, "-C", dir], env, projectPaths(dir).detachedLog);
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
  spawn: typeof spawnDetachedProcess = spawnDetachedProcess,
  pushedRefs: () => Promise<string> = async () => "",
  dryRun: () => boolean = pushIsDryRun,
): Promise<void> {
  if (event === "pre-push") {
    await sendWithPush(dir, env, args[0], await pushedRefs(), spawn, dryRun);
    return;
  }
  if (event === "post-commit") {
    await queueShape(dir, env, spawn);
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
