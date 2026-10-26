import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { relative, sep } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { findGitRoot } from "./git.js";
import { Slug } from "./schema/common.js";
import { readJson } from "./store/fs.js";
import { projectPaths } from "./store/paths.js";
import { loadConfig, loadSession } from "./store/stores.js";

const exec = promisify(execFile);

/**
 * What the UserPromptSubmit hook leaves in `.cogit/HEAD` (Story 9.3): the session
 * a code commit in this working tree carries, and where its transcript is.
 */
export const SessionHead = z.object({
  sessionId: Slug,
  transcriptPath: z.string().optional(),
  at: z.string().optional(),
});
export type SessionHead = z.infer<typeof SessionHead>;

export async function readSessionHead(root: string): Promise<SessionHead | undefined> {
  const read = await readJson(projectPaths(root).head);
  if (!read.found || "error" in read) return undefined;
  const parsed = SessionHead.safeParse(read.value);
  return parsed.success ? parsed.data : undefined;
}

interface GitResult {
  code: number;
  stdout: string;
}

/** Git with `-C`, never throwing: the exit code and stdout are what callers need. */
async function git(
  root: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<GitResult> {
  try {
    const { stdout } = await exec("git", ["-C", root, ...args], { env });
    return { code: 0, stdout };
  } catch (err) {
    const failure = err as { code?: number | string; stdout?: string };
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
    };
  }
}

/**
 * The current session's files as paths git understands, relative to the git
 * root. A project inside a repository subdirectory keeps its own prefix, so the
 * hook stages what it actually wrote. Missing files are left out: a session that
 * recorded nothing has nothing to carry.
 */
async function sessionPaths(gitRoot: string, root: string, sessionId: string): Promise<string[]> {
  const paths = projectPaths(root);
  return [paths.session(sessionId), paths.events(sessionId)]
    .filter((file) => existsSync(file))
    .map((file) => relative(gitRoot, file).split(sep).join("/"))
    .filter((file) => file !== "" && !file.startsWith(".."));
}

/** True when the ignore policy keeps these paths out of git: staging would fail. */
async function ignored(gitRoot: string, path: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  return (await git(gitRoot, ["check-ignore", "-q", "--", path], env)).code === 0;
}

/**
 * Something other than the session files is already staged. The pre-commit hook
 * must never create a record-only commit, so with an empty index it does nothing.
 * An initial commit (no HEAD yet) counts as staged: the user is committing.
 */
async function hasStagedChanges(gitRoot: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  return (await git(gitRoot, ["diff", "--cached", "--quiet", "--exit-code"], env)).code !== 0;
}

/** True when this session's files differ from HEAD (or are untracked). */
export async function uncommittedSession(
  root: string,
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const gitRoot = await findGitRoot(root);
  if (gitRoot === undefined) return false;
  const paths = await sessionPaths(gitRoot, root, sessionId);
  if (paths.length === 0) return false;
  if (await ignored(gitRoot, paths[0] as string, env)) return false;
  return (await git(gitRoot, ["status", "--porcelain", "--", ...paths], env)).stdout.trim() !== "";
}

/**
 * Git pre-commit hook (Story 9.3): stage the current session's record so a code
 * commit carries its "why". The session comes from `.cogit/HEAD`, written by the
 * UserPromptSubmit hook. Everything is best-effort: a missing HEAD, an ignored
 * project, an empty index or a failing git all end quietly and the commit runs.
 */
export async function stageSessionFiles(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const head = await readSessionHead(root);
  if (head === undefined) return false;
  const gitRoot = await findGitRoot(root);
  if (gitRoot === undefined) return false;
  const paths = await sessionPaths(gitRoot, root, head.sessionId);
  if (paths.length === 0) return false;
  if (await ignored(gitRoot, paths[0] as string, env)) return false;
  if (!(await hasStagedChanges(gitRoot, env))) return false;
  return (await git(gitRoot, ["add", "--", ...paths], env)).code === 0;
}

/** The message an `auto` record commit carries; the title is kept to one short line. */
export function recordMessage(title: string, sessionId: string): string {
  const clean = title.replace(/\s+/g, " ").trim() || sessionId;
  return `chore(cogit): record ${clean.length > 120 ? `${clean.slice(0, 119)}…` : clean}`;
}

/**
 * Commits exactly this session's record files (Story 9.3, `recordCommit: auto`).
 * Other staged changes stay staged: the commit is restricted to these paths. A
 * missing git, an ignored project or nothing to commit is not an error.
 */
export async function commitSessionFiles(
  root: string,
  sessionId: string,
  title: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const gitRoot = await findGitRoot(root);
  if (gitRoot === undefined) return false;
  const paths = await sessionPaths(gitRoot, root, sessionId);
  if (paths.length === 0) return false;
  if (await ignored(gitRoot, paths[0] as string, env)) return false;
  if ((await git(gitRoot, ["status", "--porcelain", "--", ...paths], env)).stdout.trim() === "")
    return false;
  if ((await git(gitRoot, ["add", "--", ...paths], env)).code !== 0) return false;
  // --no-verify: the record commit must not set off the hooks it is part of.
  const message = recordMessage(title, sessionId);
  return (
    (await git(gitRoot, ["commit", "--no-verify", "-m", message, "--", ...paths], env)).code === 0
  );
}

/** The `recordCommit` setting applied at session end: only `auto` commits here. */
export async function maybeAutoCommit(
  root: string,
  sessionId: string,
  env: NodeJS.ProcessEnv,
): Promise<boolean> {
  if ((await loadConfig(env)).recordCommit !== "auto") return false;
  const loaded = await loadSession(root, sessionId);
  const title = loaded.found && loaded.ok ? loaded.data.title : "";
  return commitSessionFiles(root, sessionId, title, env);
}
