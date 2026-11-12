import { access, stat } from "node:fs/promises";
import { delimiter, join } from "node:path";

/** Whether `name` is a command on `PATH` (with Windows' extensions there). */
export async function onPath(name: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  const dirs = (env.PATH ?? env.Path ?? "").split(delimiter).filter((dir) => dir !== "");
  const names =
    process.platform === "win32" ? [`${name}.cmd`, `${name}.exe`, `${name}.ps1`, name] : [name];
  for (const dir of dirs) {
    for (const file of names) {
      try {
        await access(join(dir, file));
        return true;
      } catch {}
    }
  }
  return false;
}

/** Whether `dir` exists as a directory. */
export async function isDir(dir: string): Promise<boolean> {
  return (await stat(dir).catch(() => undefined))?.isDirectory() ?? false;
}

/**
 * Whether an agent is on this machine: its state directory exists (it has run
 * here) or its command is on `PATH` (installed, never run).
 */
export async function agentPresent(
  configDir: string,
  command: string,
  env: NodeJS.ProcessEnv,
): Promise<boolean> {
  return (await isDir(configDir)) || (await onPath(command, env));
}
