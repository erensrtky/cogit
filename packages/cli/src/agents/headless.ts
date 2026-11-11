import { spawn } from "node:child_process";
import { CliError } from "../io.js";

/** The headless agent must not fire our own hooks or leave a transcript. */
export function headlessEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...process.env, ...env, COGIT_DISABLE: "1" };
}

/**
 * Stops a run that outlived its limit. On Windows killing the shim's cmd.exe
 * would leave the agent running and holding the output open, so the whole
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

/** How to start one agent binary; `verbatim` when it goes through cmd.exe. */
export interface HeadlessCommand {
  command: string;
  args: string[];
  verbatim: boolean;
}

/** What cmd.exe may see in the shim's arguments: nothing it would read as syntax. */
const SHIM_SAFE = /^[\w.:@[\]/-]+$/;

/**
 * How to start the agent `name`. The plain name finds an `.exe` on Windows
 * too. An npm install leaves only a `.cmd` shim, which Node refuses to spawn
 * without a shell since CVE-2024-27980 (issue #2), so that route goes through
 * `cmd.exe`, and refuses an argument instead of escaping it.
 */
export function shimCommand(
  name: string,
  args: string[],
  shim: boolean,
  env: NodeJS.ProcessEnv = process.env,
): HeadlessCommand {
  if (!shim) return { command: name, args, verbatim: false };
  const unsafe = args.find((arg) => !SHIM_SAFE.test(arg));
  if (unsafe !== undefined)
    throw new CliError(`cannot pass ${JSON.stringify(unsafe)} to ${name}.cmd safely`);
  return {
    command: env.ComSpec ?? "cmd.exe",
    args: ["/d", "/s", "/c", `"${name}.cmd ${args.join(" ")}"`],
    verbatim: true,
  };
}

/** How long one headless run may take; a closing pass usually needs under two minutes. */
export const HEADLESS_TIMEOUT_MS = 5 * 60_000;

/** The run's time limit; `COGIT_CLAUDE_TIMEOUT_MS` overrides it for every agent. */
export function headlessLimit(env: NodeJS.ProcessEnv): number {
  return Number(env.COGIT_CLAUDE_TIMEOUT_MS) || HEADLESS_TIMEOUT_MS;
}

/** The plain binary was not found; on Windows the `.cmd` shim is tried next. */
export class MissingAgentError extends CliError {}

/** The agent exited non-zero; some (Codex) say why on stdout, which is kept here. */
export class AgentExitError extends CliError {
  constructor(
    message: string,
    readonly stdout: string,
  ) {
    super(message);
  }
}

/**
 * Runs the agent `name` once with the prompt on stdin and resolves with its
 * stdout. A missing binary, a failed run or one that outlives `limit` rejects,
 * so a hung run lands in the log instead of waiting until the machine shuts down.
 */
export function runHeadless(
  name: string,
  command: HeadlessCommand,
  prompt: string,
  env: NodeJS.ProcessEnv,
  limit: number,
  cwd?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      env: headlessEnv(env),
      stdio: ["pipe", "pipe", "pipe"],
      windowsVerbatimArguments: command.verbatim,
      ...(cwd === undefined ? {} : { cwd }),
    });
    let out = "";
    let err = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      stopTree(child.pid, () => child.kill("SIGKILL"));
    }, limit);
    // The child may exit before reading the prompt; that write error is not ours.
    child.stdin.on("error", () => {});
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      out += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      err += chunk;
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      const message = `could not run ${name}: ${error.message}`;
      reject(error.code === "ENOENT" ? new MissingAgentError(message) : new CliError(message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut)
        reject(new CliError(`${name} did not answer within ${Math.round(limit / 1000)} s`));
      else if (code === 0) resolve(out);
      else
        reject(
          new AgentExitError(`${name} exited with ${code}: ${err.trim() || "no output"}`, out),
        );
    });
    child.stdin.end(prompt);
  });
}

/** Runs `name` plainly, and on Windows through its `.cmd` shim when the plain binary is missing. */
export function runWithShim(
  name: string,
  args: string[],
  prompt: string,
  env: NodeJS.ProcessEnv,
  cwd?: string,
): Promise<string> {
  const limit = headlessLimit(env);
  const run = (shim: boolean): Promise<string> =>
    runHeadless(name, shimCommand(name, args, shim, env), prompt, env, limit, cwd);
  if (process.platform !== "win32") return run(false);
  return run(false).catch((error: unknown) =>
    error instanceof MissingAgentError ? run(true) : Promise.reject(error),
  );
}
