import { existsSync } from "node:fs";
import { readFile, rename, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { cogitIgnored } from "../git.js";
import { atomicWrite, atomicWriteJson } from "./fs.js";
import {
  CONFIG_DIR_NAME,
  configuredHome,
  DIR_NAME,
  defaultConfigBase,
  OLD_CONFIG_DIR_NAME,
  OLD_DIR_NAME,
} from "./paths.js";

/**
 * The codelineage → cogit rename (Story 9.1) must be invisible to the user and
 * must never lose a record. A migration runs on the first command or hook that
 * needs a project or the global config: rename only, no copy, and nothing is
 * touched when both the old and the new name exist (one warning instead).
 */

const checkedProjects = new Set<string>();
const checkedGlobals = new Set<string>();
const pendingWarnings: string[] = [];

/** Warnings collected by the migrations so far; the caller prints and clears them. */
export function takeMigrationWarnings(): string[] {
  return pendingWarnings.splice(0, pendingWarnings.length);
}

function warn(line: string): void {
  if (!pendingWarnings.includes(line)) pendingWarnings.push(line);
}

/** `# codelineage` and `/.codelineage/…` become their cogit spellings. */
export function renameGitignoreLines(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (line.trim() === "# codelineage") return line.replace("# codelineage", "# cogit");
      return line.replace(/^(\s*)\/\.codelineage(?=\/|$)/, "$1/.cogit");
    })
    .join("\n");
}

async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(
    (info) => info.isDirectory(),
    () => false,
  );
}

/** Renames a directory; false (never a throw) when the filesystem refuses. */
async function moveDir(from: string, to: string): Promise<boolean> {
  try {
    await rename(from, to);
    return true;
  } catch {
    return false;
  }
}

/**
 * Renames `<root>/.codelineage` to `<root>/.cogit` and fixes the project's
 * `.gitignore`. Idempotent and best-effort: a failure leaves the old dir for the
 * next command and never turns into an error.
 */
export async function migrateProject(root: string): Promise<boolean> {
  const dir = resolve(root);
  if (checkedProjects.has(dir)) return false;
  checkedProjects.add(dir);

  const oldDir = join(dir, OLD_DIR_NAME);
  const newDir = join(dir, DIR_NAME);
  const oldIsDir = await isDirectory(oldDir);
  if (!oldIsDir) return false;
  if (existsSync(newDir)) {
    warn(
      `both ${OLD_DIR_NAME}/ and ${DIR_NAME}/ exist in ${dir}; using ${DIR_NAME}/ and leaving ` +
        `the old directory untouched`,
    );
    return false;
  }
  // A read-only dir or a race: the next command tries again in a new process.
  if (!(await moveDir(oldDir, newDir))) return false;
  const gitignore = join(dir, ".gitignore");
  const text = await readFile(gitignore, "utf8").catch(() => undefined);
  if (text !== undefined) {
    const next = renameGitignoreLines(text);
    if (next !== text) await atomicWrite(gitignore, next).catch(() => undefined);
  }
  // A project that commits its record gets the git hooks the rename arrived with
  // (Story 9.4: the `Thought:` trailer). Dynamic import keeps this module — which
  // every command loads — free of the hook stack; a failure is silence.
  if (!(await cogitIgnored(dir))) {
    const { installGitHooks } = await import("../git-hooks.js");
    await installGitHooks(dir).catch(() => undefined);
  }
  return true;
}

interface RegistryFile {
  projects?: { path?: unknown }[];
}

/** Points registry entries that lived under the moved global dir at the new one. */
async function rewriteRegistryPaths(file: string, oldBase: string, newBase: string): Promise<void> {
  const text = await readFile(file, "utf8").catch(() => undefined);
  if (text === undefined) return;
  let json: RegistryFile;
  try {
    json = JSON.parse(text) as RegistryFile;
  } catch {
    return;
  }
  if (!Array.isArray(json.projects)) return;
  let changed = false;
  for (const project of json.projects) {
    if (typeof project.path !== "string") continue;
    if (project.path !== oldBase && !project.path.startsWith(`${oldBase}${sep}`)) continue;
    project.path = `${newBase}${project.path.slice(oldBase.length)}`;
    changed = true;
  }
  if (changed) await atomicWriteJson(file, json).catch(() => undefined);
}

/**
 * Moves `~/.config/codelineage` to `~/.config/cogit` (only when no explicit home
 * is configured) and rewrites registry paths that pointed into it. Idempotent.
 */
export async function migrateGlobal(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const key = `${env.XDG_CONFIG_HOME ?? ""}\0${env.COGIT_HOME ?? ""}\0${env.CODELINEAGE_HOME ?? ""}`;
  if (checkedGlobals.has(key)) return false;
  checkedGlobals.add(key);
  // An explicit home is the user's choice and keeps working as a fallback.
  if (configuredHome(env) !== undefined) return false;

  const oldBase = defaultConfigBase(OLD_CONFIG_DIR_NAME, env);
  const newBase = defaultConfigBase(CONFIG_DIR_NAME, env);
  const oldIsDir = await isDirectory(oldBase);
  if (!oldIsDir) return false;
  if (existsSync(newBase)) {
    warn(
      `both ${oldBase} and ${newBase} exist; using ${newBase} and leaving the old directory ` +
        "untouched",
    );
    return false;
  }
  if (!(await moveDir(oldBase, newBase))) return false;
  await rewriteRegistryPaths(join(newBase, "projects.json"), oldBase, newBase);
  return true;
}
