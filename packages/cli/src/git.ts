import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
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

const HEADER = "# codelineage";

/** Machine-local data that must never be committed, whatever the policy. */
const ALWAYS = [
  "/.codelineage/state/",
  "/.codelineage/locks/",
  "/.codelineage/inbox/",
  "/.codelineage/lineage.html",
];

export function gitignoreLines(policy: GitPolicy): string[] {
  return policy === "ignore" ? ["/.codelineage/"] : ALWAYS;
}

/** Appends the policy's lines to `<root>/.gitignore`, skipping lines already there. */
export async function ensureGitignore(root: string, policy: GitPolicy): Promise<string[]> {
  const file = join(root, ".gitignore");
  const text = await readFile(file, "utf8").catch(() => "");
  const present = new Set(text.split(/\r?\n/).map((l) => l.trim()));
  const missing = gitignoreLines(policy).filter((l) => !present.has(l));
  if (missing.length === 0) return [];
  const block = [present.has(HEADER) ? [] : [HEADER], missing].flat().join("\n");
  const sep = text === "" || text.endsWith("\n") ? "" : "\n";
  await atomicWrite(file, `${text}${sep}${block}\n`);
  return missing;
}

/**
 * `.codelineage/.gitignore` keeps the conversation store out of git, even when
 * the user chose to commit `.codelineage/`: the raw chat stays on this machine.
 * Returns true when the line had to be added; a second call changes nothing.
 */
export async function ensureConversationGitignore(root: string): Promise<boolean> {
  const file = join(root, ".codelineage", ".gitignore");
  const text = await readFile(file, "utf8").catch(() => "");
  const present = new Set(text.split(/\r?\n/).map((l) => l.trim()));
  if (present.has("conversations/")) return false;
  const sep = text === "" || text.endsWith("\n") ? "" : "\n";
  await atomicWrite(file, `${text}${sep}conversations/\n`);
  return true;
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

/**
 * Full hashes git blames for `file`; `file:line` asks about one line and a bare
 * file means every commit that touched it (Story 8.8). `file` is relative to
 * `root`, the repository's worktree.
 */
export async function blameCommitHashes(
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
