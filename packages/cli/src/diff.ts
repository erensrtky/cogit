import { execFile } from "node:child_process";
import { relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { findGitRoot, projectFiles } from "./git.js";

const exec = promisify(execFile);

/**
 * The biggest diff the map shows (Story 10.5). GitHub-sized reading, not a
 * memory guard: past this the page says to run `git show` instead.
 */
export const DIFF_MAX_BYTES = 400 * 1024;

/** A reader must get an answer in a moment; a huge commit must not hang the page. */
const DIFF_TIMEOUT_MS = 10_000;

/** `git show` may print more than the cap so the cap can be detected, not crash. */
const READ_MAX_BUFFER = DIFF_MAX_BYTES * 8;

/** A commit as the URL may name it: 7–40 hex characters, never an option. */
export function isDiffSha(value: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(value);
}

/** What the page says when the diff is past the cap. */
export function diffTooLarge(sha: string): string {
  return `diff too large, run \`git show ${sha}\``;
}

/**
 * Git prints a placeholder for binary files. The map has no renderer for the
 * bytes, so it says the same thing for every binary file (Story 10.5).
 */
export function normalizeDiff(text: string): { text: string; binary: boolean } {
  let binary = false;
  const normalized = text
    .split("\n")
    .map((line) => {
      if (/^Binary files .+ and .+ differ$/.test(line)) {
        binary = true;
        return "binary file changed";
      }
      return line;
    })
    .join("\n");
  return { text: normalized, binary };
}

export type CommitDiffResult =
  | { ok: true; text: string }
  | { ok: false; reason: "no-git" | "unknown-commit" | "file-not-in-commit" | "too-large" };

/** Files a commit touched, relative to the repository root. */
async function commitFiles(gitRoot: string, sha: string): Promise<string[]> {
  const { stdout } = await exec("git", ["-C", gitRoot, "show", "--format=", "--name-only", sha], {
    maxBuffer: READ_MAX_BUFFER,
    timeout: DIFF_TIMEOUT_MS,
  });
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/**
 * One commit's patch for the map (Story 10.5): `git show --format= --patch
 * --no-color`, optionally limited to a file the commit touched. `root` is the
 * project directory; git may sit above it. No shell: the hash is checked to be
 * hex and the file is passed after `--`.
 */
export async function readCommitDiff(
  root: string,
  input: string,
  file?: string,
): Promise<CommitDiffResult> {
  if (!isDiffSha(input)) return { ok: false, reason: "unknown-commit" };
  const sha = input.toLowerCase();
  const gitRoot = await findGitRoot(root);
  if (gitRoot === undefined) return { ok: false, reason: "no-git" };

  try {
    // Resolve first, so an unknown hash is a 404 and never a git error page.
    await exec("git", ["-C", gitRoot, "rev-parse", "--verify", "--quiet", `${sha}^{commit}`], {
      maxBuffer: READ_MAX_BUFFER,
      timeout: DIFF_TIMEOUT_MS,
    });
  } catch {
    return { ok: false, reason: "unknown-commit" };
  }

  const files = await commitFiles(gitRoot, sha);

  let repoFile: string | undefined;
  if (file !== undefined) {
    // The page holds project-relative paths; git wants repository-relative ones.
    const wanted = file.split("\\").join("/").replace(/^\.\//, "");
    repoFile = relative(gitRoot, resolve(root, wanted)).split(sep).join("/");
    const kept = projectFiles(gitRoot, root, new Map([[sha, files]])).get(sha) ?? [];
    if (!kept.includes(wanted)) return { ok: false, reason: "file-not-in-commit" };
  }

  const args = ["-C", gitRoot, "show", "--format=", "--patch", "--no-color", sha];
  if (repoFile !== undefined) args.push("--", repoFile);
  try {
    const { stdout } = await exec("git", args, {
      maxBuffer: READ_MAX_BUFFER,
      timeout: DIFF_TIMEOUT_MS,
    });
    if (Buffer.byteLength(stdout, "utf8") > DIFF_MAX_BYTES) {
      return { ok: false, reason: "too-large" };
    }
    return { ok: true, text: normalizeDiff(stdout).text };
  } catch {
    // maxBuffer or the timeout: either way the patch is not worth sending.
    return { ok: false, reason: "too-large" };
  }
}
