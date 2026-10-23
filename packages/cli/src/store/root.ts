import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { projectPaths } from "./paths.js";

/** The linked git worktree a directory belongs to. */
export interface WorktreeInfo {
  /** The worktree's top directory. */
  path: string;
  /** Checked-out branch; null when HEAD is detached. */
  branch: string | null;
}

export interface ProjectRoot {
  /** Where `.codelineage/` lives for this directory. */
  root: string;
  /** Set when the directory is inside a linked worktree. */
  worktree?: WorktreeInfo;
}

interface LinkedWorktree {
  top: string;
  gitdir: string;
}

/** Walks up to the nearest `.git`; a file (not a directory) there marks a linked worktree. */
async function findLinkedWorktree(start: string): Promise<LinkedWorktree | undefined> {
  for (let dir = start; ; dir = dirname(dir)) {
    const dotGit = join(dir, ".git");
    const info = await stat(dotGit).catch(() => undefined);
    if (info?.isFile()) {
      const match = /^gitdir:\s*(.+?)\s*$/m.exec(await readFile(dotGit, "utf8"));
      return match ? { top: dir, gitdir: resolve(dir, match[1] as string) } : undefined;
    }
    if (info || dirname(dir) === dir) return undefined;
  }
}

async function readBranch(gitdir: string): Promise<string | null> {
  const head = await readFile(join(gitdir, "HEAD"), "utf8").catch(() => "");
  const match = /^ref:\s*refs\/heads\/(.+?)\s*$/m.exec(head);
  return match ? (match[1] as string) : null;
}

/**
 * Finds the `.codelineage/` for a directory. A linked git worktree has no copy of
 * a git-ignored `.codelineage/`, so it shares the main checkout's, the same way
 * Claude Code keeps worktree state in the main checkout. With `.codelineage/`
 * committed, the worktree has its own copy and keeps it. Only files are read
 * (`.git` → `gitdir` → `commondir`), so git itself is never needed.
 */
export async function resolveProjectRoot(dir: string): Promise<ProjectRoot> {
  const start = resolve(dir);
  try {
    const linked = await findLinkedWorktree(start);
    if (!linked) return { root: start };
    const worktree = { path: linked.top, branch: await readBranch(linked.gitdir) };
    if (existsSync(projectPaths(start).project)) return { root: start, worktree };
    const common = (await readFile(join(linked.gitdir, "commondir"), "utf8")).trim();
    const mainTop = dirname(resolve(linked.gitdir, common));
    return { root: join(mainTop, relative(linked.top, start)), worktree };
  } catch {
    // An unreadable or odd `.git` layout falls back to the directory itself.
    return { root: start };
  }
}
