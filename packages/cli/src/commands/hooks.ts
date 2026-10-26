import { uninstallGitHooks } from "../git-hooks.js";
import { CliError, type Io } from "../io.js";
import { resolveProjectRoot } from "../store/root.js";
import { loadProject } from "../store/stores.js";

/**
 * `cogit hooks uninstall` (Story 9.4): removes only the marked block cogit added
 * to a git hook, so a user who wants their hooks back exactly as they were can
 * get them without editing files by hand. No record and no setting changes.
 */
export async function hooksUninstall(dir: string, io: Io): Promise<void> {
  const { root } = await resolveProjectRoot(dir);
  const project = await loadProject(root);
  if (!project.found) throw new CliError(`${root} is not initialized; run \`cogit init\` first`);
  if (!project.ok) throw new CliError(project.error);
  const removed = await uninstallGitHooks(root);
  io.out(
    removed.length === 0
      ? "No cogit hook blocks to remove."
      : `Removed the cogit block from: ${removed.join(", ")}`,
  );
}
