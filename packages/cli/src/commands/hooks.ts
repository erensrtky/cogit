import { installGitHooks, uninstallGitHooks } from "../git-hooks.js";
import { CliError, type Io } from "../io.js";
import { resolveProjectRoot } from "../store/root.js";
import { loadProject } from "../store/stores.js";

/** The project root of an initialized project, or a clear error. */
async function initializedRoot(dir: string): Promise<string> {
  const { root } = await resolveProjectRoot(dir);
  const project = await loadProject(root);
  if (!project.found) throw new CliError(`${root} is not initialized; run \`cogit init\` first`);
  if (!project.ok) throw new CliError(project.error);
  return root;
}

/**
 * `cogit hooks install`: adds (or refreshes) cogit's block in the git hooks, for
 * a project set up before the hooks existed or after `hooks uninstall`. The
 * user's own hook lines stay as they are.
 */
export async function hooksInstall(dir: string, io: Io): Promise<void> {
  const root = await initializedRoot(dir);
  const added = await installGitHooks(root);
  io.out(
    added.length === 0
      ? "The cogit hook blocks are already current."
      : `Added the cogit block to: ${added.join(", ")}`,
  );
}

/**
 * `cogit hooks uninstall` (Story 9.4): removes only the marked block cogit added
 * to a git hook, so a user who wants their hooks back exactly as they were can
 * get them without editing files by hand. No record and no setting changes.
 */
export async function hooksUninstall(dir: string, io: Io): Promise<void> {
  const root = await initializedRoot(dir);
  const removed = await uninstallGitHooks(root);
  io.out(
    removed.length === 0
      ? "No cogit hook blocks to remove."
      : `Removed the cogit block from: ${removed.join(", ")}`,
  );
}
