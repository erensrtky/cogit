import { refreshCogitGitignore } from "./git.js";
import { isDirectory } from "./store/fs.js";
import { loadRegistry } from "./store/stores.js";

/**
 * Applies a change of `shareConversations` to every registered project (Story
 * 9.3): a project that commits its records gets `conversations/` un-ignored (or
 * hidden again) right away, not only on its next build. Missing directories and
 * unwritable ignore files are skipped in silence; this is derived state.
 */
export async function refreshShareConversations(
  env: NodeJS.ProcessEnv,
  share: boolean,
): Promise<void> {
  const registry = await loadRegistry(env);
  if (!registry.found || !registry.ok) return;
  for (const entry of registry.data.projects) {
    if (!(await isDirectory(entry.path))) continue;
    try {
      await refreshCogitGitignore(entry.path, share);
    } catch {
      // A read-only project keeps its previous rules; the next build retries.
    }
  }
}
