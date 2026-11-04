import { installGitHooks } from "./git-hooks.js";
import {
  addRecordRefspec,
  downloadRecords,
  isSharing,
  reconcileRecords,
  recordSyncStatus,
} from "./record-sync.js";

/**
 * What cogit does the first time it runs in a clone of a shared project: `git
 * clone` cannot carry either of these. Afterwards `git pull` brings the records
 * and `git push` sends them.
 */
export async function setUpClone(root: string, env: NodeJS.ProcessEnv): Promise<void> {
  if (await addRecordRefspec(root, env)) await installGitHooks(root);
}

/**
 * Runs before a command reads the record, so a person who has just cloned sees the
 * team's sessions and never an empty map. Only the first run touches the network;
 * from then on this costs a local look at the refs. A failed download is a warning:
 * the command goes on with what is here.
 */
export async function prepareRecords(
  root: string,
  env: NodeJS.ProcessEnv,
  warn: (line: string) => void,
): Promise<void> {
  try {
    if (!(await isSharing(root))) return;
    await setUpClone(root, env);
    const status = await recordSyncStatus(root, env);
    if (status.remote !== undefined && !status.downloaded) {
      const showProgress = process.stderr.isTTY === true;
      if (showProgress) process.stderr.write("Downloading your team's session records...\n");
      if (!(await downloadRecords(root, env, showProgress)))
        warn("could not download your team's session records; check your connection and try again");
    }
    await reconcileRecords(root, env);
  } catch (err) {
    warn(`could not update the session records: ${(err as Error).message}`);
  }
}
