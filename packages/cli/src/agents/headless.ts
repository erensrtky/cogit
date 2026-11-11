import { spawn } from "node:child_process";

/** The headless agent must not fire our own hooks or leave a transcript. */
export function headlessEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...process.env, ...env, COGIT_DISABLE: "1" };
}

/**
 * Stops a run that outlived its limit. On Windows killing the shim's cmd.exe
 * would leave claude running and holding the output open, so the whole
 * process tree goes, through taskkill.
 */
export function stopTree(
  pid: number | undefined,
  kill: () => void,
  platform: NodeJS.Platform = process.platform,
  run: typeof spawn = spawn,
): void {
  if (platform !== "win32" || pid === undefined) return kill();
  run("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" }).on("error", kill);
}
