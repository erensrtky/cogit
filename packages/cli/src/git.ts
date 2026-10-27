import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { promisify } from "node:util";
import { atomicWrite } from "./store/fs.js";

const exec = promisify(execFile);

export type GitPolicy = "ignore" | "commit";

/** Walks up from `dir` looking for `.git` (a directory, or a file in worktrees). */
export async function findGitRoot(dir: string): Promise<string | undefined> {
  for (let cur = dir; ; cur = dirname(cur)) {
    if (
      await stat(join(cur, ".git")).then(
        () => true,
        () => false,
      )
    )
      return cur;
    if (dirname(cur) === cur) return undefined;
  }
}

const HEADER = "# cogit";

/** The root line that keeps the whole `.cogit/` out under the ignore policy. */
const IGNORE_ALL = "/.cogit/";

/**
 * What the root `.gitignore` needs for a policy (Story 9.3). Under `commit` the
 * root lists nothing: the project's own `.cogit/.gitignore` keeps local state out
 * and lets the session records travel. Under `ignore` a single line hides it all.
 */
export function gitignoreLines(policy: GitPolicy): string[] {
  return policy === "ignore" ? [IGNORE_ALL] : [];
}

/**
 * Applies the policy to `<root>/.gitignore`: adds the ignore line, or removes the
 * one an older init wrote when the project switches to `commit`. User lines are
 * never touched. Returns the lines added (none when switching to commit).
 */
export async function ensureGitignore(root: string, policy: GitPolicy): Promise<string[]> {
  const file = join(root, ".gitignore");
  const text = await readFile(file, "utf8").catch(() => "");
  if (policy === "commit") {
    const lines = text.split(/\r?\n/);
    const kept = lines.filter((line) => line.trim() !== IGNORE_ALL);
    if (kept.length !== lines.length) await atomicWrite(file, kept.join("\n"));
    return [];
  }
  const present = new Set(text.split(/\r?\n/).map((l) => l.trim()));
  const missing = gitignoreLines(policy).filter((l) => !present.has(l));
  if (missing.length === 0) return [];
  const block = [present.has(HEADER) ? [] : [HEADER], missing].flat().join("\n");
  const sep = text === "" || text.endsWith("\n") ? "" : "\n";
  await atomicWrite(file, `${text}${sep}${block}\n`);
  return missing;
}

/** True when the root `.gitignore` hides all of `.cogit/` (the ignore policy). */
export async function cogitIgnored(root: string): Promise<boolean> {
  const text = await readFile(join(root, ".gitignore"), "utf8").catch(() => "");
  return text.split(/\r?\n/).some((line) => line.trim() === IGNORE_ALL);
}

/**
 * The `.cogit/.gitignore` the commit policy writes (Story 9.3): everything in the
 * directory stays local except the session records, `project.json` and these
 * rules themselves. The file has to travel: without it a clone would not ignore
 * the conversation store and one `git add -A` would publish the raw chat. The
 * list has no timestamps and a stable order, so switching a setting rewrites it
 * once and later builds leave it alone.
 */
export function cogitGitignore(shareConversations: boolean): string {
  return [
    HEADER,
    "*",
    "!.gitignore",
    "!sessions/",
    "!sessions/**",
    "!project.json",
    ...(shareConversations ? ["!conversations/", "!conversations/**"] : []),
    "",
  ].join("\n");
}

/**
 * Writes `.cogit/.gitignore` for the commit policy; a no-op under `ignore`
 * (the root already hides everything). Returns true when the file changed.
 */
export async function ensureCogitGitignore(
  root: string,
  policy: GitPolicy,
  shareConversations: boolean,
): Promise<boolean> {
  if (policy !== "commit") return false;
  const file = join(root, ".cogit", ".gitignore");
  const content = cogitGitignore(shareConversations);
  const current = await readFile(file, "utf8").catch(() => undefined);
  if (current === content) return false;
  await atomicWrite(file, content);
  return true;
}

/**
 * Keeps an existing project's `.cogit/.gitignore` in step with the settings
 * (Story 9.3): reads the policy from the root ignore file, so a project that
 * committed its records before this story gets the new rules on its next build.
 */
export async function refreshCogitGitignore(
  root: string,
  shareConversations: boolean,
): Promise<boolean> {
  if ((await findGitRoot(root)) === undefined) return false;
  if (await cogitIgnored(root)) return false;
  return ensureCogitGitignore(root, "commit", shareConversations);
}

interface CommitLine {
  full: string;
  short: string;
  subject: string;
}

/** `%H%x00%h%x00%s` lines from `git log` / `git show`, one commit each. */
function parseCommitLines(stdout: string): CommitLine[] {
  const out: CommitLine[] = [];
  for (const line of stdout.split("\n")) {
    const [full, short, subject] = line.split("\0");
    if (full === undefined || !/^[0-9a-f]{40}$/.test(full)) continue;
    out.push({ full, short: short ?? "", subject: subject ?? "" });
  }
  return out;
}

/** The recorded hash may be short or full; either way it names the same commit. */
function matches(recorded: string, commit: CommitLine): boolean {
  return commit.full.startsWith(recorded) || recorded.startsWith(commit.short);
}

/**
 * Subjects of the given commit hashes in the repository at `root`, keyed by the
 * hash the record holds (Story 8.8: commit tags on the map). Missing commits and
 * a missing git binary are not errors: the map shows those tags greyed. One
 * `git log` call covers the common case; a hash git no longer knows makes that
 * call fail, so the fallback asks for each hash alone and keeps the rest.
 */
export async function readCommitSubjects(
  root: string,
  hashes: Iterable<string>,
): Promise<Map<string, string>> {
  const wanted = [...new Set(hashes)];
  const out = new Map<string, string>();
  if (wanted.length === 0) return out;

  const remember = (entries: CommitLine[]): void => {
    for (const hash of wanted) {
      const commit = entries.find((entry) => matches(hash, entry));
      if (commit) out.set(hash, commit.subject);
    }
  };

  try {
    const { stdout } = await exec("git", [
      "-C",
      root,
      "log",
      "--no-walk=unsorted",
      "--format=%H%x00%h%x00%s",
      ...wanted,
    ]);
    remember(parseCommitLines(stdout));
  } catch {
    for (const hash of wanted) {
      try {
        const { stdout } = await exec("git", [
          "-C",
          root,
          "show",
          "-s",
          "--format=%H%x00%h%x00%s",
          hash,
        ]);
        remember(parseCommitLines(stdout));
      } catch {
        // gone from this repository (rebased away, or another checkout)
      }
    }
  }
  return out;
}

/** One commit with the files it changed, as `git log --name-only` printed it. */
interface CommitFiles {
  full: string;
  short: string;
  files: string[];
}

/**
 * Parses `%x00%H --name-only` output: a NUL-prefixed hash line starts a commit,
 * the file lines after it belong to that commit until the next hash line.
 */
function parseFileSections(stdout: string): CommitFiles[] {
  const out: CommitFiles[] = [];
  let current: CommitFiles | null = null;
  for (const line of stdout.split("\n")) {
    if (line.startsWith("\0")) {
      const full = line.slice(1).trim();
      current = /^[0-9a-f]{40}$/.test(full) ? { full, short: "", files: [] } : null;
      if (current) out.push(current);
      continue;
    }
    const file = line.trim();
    if (current !== null && file !== "") current.files.push(file);
  }
  return out;
}

/**
 * The files each given commit changed, keyed by the hash the record holds
 * (Story 8.15: the map's file history). Paths are relative to the repository
 * root. Missing commits and a missing git binary only drop entries, never fail
 * the build — same policy as `readCommitSubjects`.
 */
export async function readCommitFiles(
  root: string,
  hashes: Iterable<string>,
): Promise<Map<string, string[]>> {
  const wanted = [...new Set(hashes)];
  const out = new Map<string, string[]>();
  if (wanted.length === 0) return out;

  const remember = (entries: CommitFiles[]): void => {
    for (const hash of wanted) {
      const commit = entries.find(
        (entry) => entry.full.startsWith(hash) || hash.startsWith(commitShort(entry)),
      );
      if (commit && !out.has(hash)) out.set(hash, commit.files);
    }
  };

  try {
    const { stdout } = await exec("git", [
      "-C",
      root,
      "log",
      "--no-walk=unsorted",
      "--format=%x00%H",
      "--name-only",
      ...wanted,
    ]);
    remember(parseFileSections(stdout));
  } catch {
    for (const hash of wanted) {
      try {
        const { stdout } = await exec("git", [
          "-C",
          root,
          "show",
          "--format=%x00%H",
          "--name-only",
          hash,
        ]);
        remember(parseFileSections(stdout));
      } catch {
        // gone from this repository (rebased away, or another checkout)
      }
    }
  }
  return out;
}

/** A commit with its numstat totals and the files it changed. */
export interface CommitChange {
  /** The full hash, so two recorded hashes of one commit count once. */
  full: string;
  added: number;
  removed: number;
  /** Repository-relative paths, in git's order (a binary file counts as one). */
  files: string[];
}

interface ChangeSection {
  full: string;
  added: number;
  removed: number;
  files: string[];
}

/**
 * Parses `%x00%H` + `--numstat` output: a NUL-prefixed hash line starts a
 * commit, `added\tremoved\tpath` lines follow until the next hash. A binary file
 * prints `-` for both counts; it still counts as a file touched.
 */
function parseChangeSections(stdout: string): ChangeSection[] {
  const out: ChangeSection[] = [];
  let current: ChangeSection | null = null;
  for (const line of stdout.split("\n")) {
    if (line.startsWith("\0")) {
      const full = line.slice(1).trim();
      current = /^[0-9a-f]{40}$/.test(full) ? { full, added: 0, removed: 0, files: [] } : null;
      if (current) out.push(current);
      continue;
    }
    if (current === null) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const [added, removed, ...rest] = parts;
    const path = rest.join("\t").trim();
    if (path === "") continue;
    current.added += Number.parseInt(added ?? "", 10) || 0;
    current.removed += Number.parseInt(removed ?? "", 10) || 0;
    current.files.push(path);
  }
  return out;
}

/**
 * Lines added and removed, plus the files changed, for each given commit
 * (Story 10.3: how much code landed after a message). Keyed by the hash the
 * record holds; a commit git no longer knows is left out, never an error —
 * same policy as `readCommitSubjects` and `readCommitFiles`.
 */
export async function readCommitChanges(
  root: string,
  hashes: Iterable<string>,
): Promise<Map<string, CommitChange>> {
  const wanted = [...new Set(hashes)];
  const out = new Map<string, CommitChange>();
  if (wanted.length === 0) return out;

  const remember = (entries: ChangeSection[]): void => {
    for (const hash of wanted) {
      const commit = entries.find(
        (entry) => entry.full.startsWith(hash) || hash.startsWith(entry.full.slice(0, 7)),
      );
      if (commit && !out.has(hash))
        out.set(hash, {
          full: commit.full,
          added: commit.added,
          removed: commit.removed,
          files: commit.files,
        });
    }
  };

  try {
    const { stdout } = await exec("git", [
      "-C",
      root,
      "log",
      "--no-walk=unsorted",
      "--format=%x00%H",
      "--numstat",
      ...wanted,
    ]);
    remember(parseChangeSections(stdout));
  } catch {
    for (const hash of wanted) {
      try {
        const { stdout } = await exec("git", [
          "-C",
          root,
          "show",
          "--format=%x00%H",
          "--numstat",
          hash,
        ]);
        remember(parseChangeSections(stdout));
      } catch {
        // gone from this repository (rebased away, or another checkout)
      }
    }
  }
  return out;
}

/** A commit's short hash, computed when git printed only the full one. */
function commitShort(commit: CommitFiles): string {
  return commit.short === "" ? commit.full.slice(0, 7) : commit.short;
}

/**
 * Rebases repository-relative file paths onto the project root and drops the
 * files outside it, so the map compares commit files with the paths the records
 * hold (Story 8.15). A project at the repository root passes through unchanged.
 */
export function projectFiles(
  gitRoot: string,
  root: string,
  files: ReadonlyMap<string, string[]>,
): Map<string, string[]> {
  if (gitRoot === root) return new Map(files);
  const out = new Map<string, string[]>();
  for (const [hash, list] of files) {
    const kept = list.flatMap((file) => {
      const rel = relative(root, join(gitRoot, file));
      if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return [];
      return [rel.split(sep).join("/")];
    });
    if (kept.length > 0) out.set(hash, kept);
  }
  return out;
}

/**
 * Full hashes git blames for `file`; `file:line` asks about one line and a bare
 * file means every commit that touched it (Story 8.8). `file` is relative to
 * `root`, the repository's worktree.
 */ export async function blameCommitHashes(
  root: string,
  file: string,
  line?: number,
): Promise<string[]> {
  const args =
    line === undefined
      ? ["-C", root, "log", "--format=%H", "--", file]
      : ["-C", root, "blame", "--porcelain", "-L", `${line},${line}`, "--", file];
  const { stdout } = await exec("git", args);
  const out = new Set<string>();
  for (const row of stdout.split("\n")) {
    const hash = row.slice(0, 40);
    if (!/^[0-9a-f]{40}$/.test(hash)) continue;
    // `blame --porcelain` rows continue with the line numbers; a bare `git log`
    // row is the hash alone.
    if (row.length === 40 || /^[0-9a-f]{40} \d+ \d+/.test(row)) out.add(hash);
  }
  return [...out];
}

/** The name a commit in this repository would carry; undefined outside git or unset. */
export async function gitUserName(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  try {
    const { stdout } = await exec("git", ["-C", root, "config", "user.name"], { env });
    const name = stdout.trim();
    return name === "" ? undefined : name;
  } catch {
    return undefined;
  }
}

/**
 * True when this repository has a commit made between two moments (Story 9.5).
 * The transcript only shows that a `git commit` command ran; this asks git
 * whether one actually landed here, so a failed or other-repository commit is
 * not a hint. A missing git, an uninitialized repository or bad dates are all
 * "no commit": a hint must never fail the command it decorates.
 */
export async function commitBetween(
  root: string,
  from: string,
  to: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  try {
    const { stdout } = await exec(
      "git",
      ["-C", root, "log", "--max-count=1", "--format=%H", `--since=${from}`, `--until=${to}`],
      { env },
    );
    return stdout.trim() !== "";
  } catch {
    return false;
  }
}

/** The hooks directory git really uses here: `core.hooksPath`, Husky and worktrees included. */
export async function gitHooksDir(root: string): Promise<string | undefined> {
  try {
    const { stdout } = await exec("git", ["-C", root, "rev-parse", "--git-path", "hooks"]);
    const path = stdout.trim();
    if (path === "") return undefined;
    return isAbsolute(path) ? path : join(root, path);
  } catch {
    return undefined;
  }
}
