import { type CommitChange, findGitRoot, projectFiles, readCommitChanges } from "../git.js";

/**
 * Numstat totals per commit, with file paths rebased onto the project (Story
 * 10.3). A project inside a larger repository must not count files outside its
 * own directory, so the paths go through the same projection the file history
 * uses. A commit whose files all sit outside the project keeps its line counts
 * but no files — it changed nothing here.
 */
export async function readProjectChanges(
  root: string,
  hashes: Iterable<string>,
): Promise<Map<string, CommitChange>> {
  const wanted = [...new Set(hashes)];
  if (wanted.length === 0) return new Map();
  const gitRoot = await findGitRoot(root);
  if (gitRoot === undefined) return new Map();
  const raw = await readCommitChanges(gitRoot, wanted);
  if (gitRoot === root) return raw;
  const files = projectFiles(
    gitRoot,
    root,
    new Map([...raw].map(([hash, change]) => [hash, change.files])),
  );
  const out = new Map<string, CommitChange>();
  for (const [hash, change] of raw) {
    out.set(hash, { ...change, files: files.get(hash) ?? [] });
  }
  return out;
}
