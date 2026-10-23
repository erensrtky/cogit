import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { atomicWrite } from "./store/fs.js";

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
