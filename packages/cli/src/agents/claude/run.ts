import { spawn } from "node:child_process";
import { CliError } from "../../io.js";
import { recordSpend } from "../../store/spend.js";
import { headlessEnv, stopTree } from "../headless.js";
import type { RunResume, RunSpend } from "../types.js";

/** The text inside Claude Code's `--output-format json` envelope. */
export function resultText(stdout: string): string {
  let envelope: unknown;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    throw new CliError("claude did not print valid JSON");
  }
  const result = (envelope as { result?: unknown }).result;
  if (typeof result !== "string") throw new CliError("claude returned no result text");
  return result;
}

/** What cmd.exe may see in the shim's arguments: nothing it would read as syntax. */
const SHIM_SAFE = /^[\w.:@[\]/-]+$/;

/**
 * How to start the agent. Plain `claude` finds `claude.exe` on Windows too.
 * An npm install leaves only a `claude.cmd` shim, which Node refuses to spawn
 * without a shell since CVE-2024-27980 (issue #2), so that route goes through
 * `cmd.exe`, and refuses an argument instead of escaping it.
 */
export function claudeCommand(
  args: string[],
  shim: boolean,
  env: NodeJS.ProcessEnv = process.env,
): { command: string; args: string[]; verbatim: boolean } {
  if (!shim) return { command: "claude", args, verbatim: false };
  const unsafe = args.find((arg) => !SHIM_SAFE.test(arg));
  if (unsafe !== undefined)
    throw new CliError(`cannot pass ${JSON.stringify(unsafe)} to claude.cmd safely`);
  return {
    command: env.ComSpec ?? "cmd.exe",
    args: ["/d", "/s", "/c", `"claude.cmd ${args.join(" ")}"`],
    verbatim: true,
  };
}

/** How long one headless run may take; a closing pass usually needs under two minutes. */
export const CLAUDE_TIMEOUT_MS = 5 * 60_000;

/**
 * Runs the agent once, headless and without session persistence, with the prompt
 * on stdin. Resolves with stdout, after noting what the run cost when `spend`
 * names the project; a missing binary, a failed run or one that
 * outlives the time limit rejects, so a hung run lands in the log instead of
 * waiting until the machine shuts down. `COGIT_CLAUDE_TIMEOUT_MS` overrides the limit.
 */
export function runClaude(
  prompt: string,
  model: string,
  env: NodeJS.ProcessEnv,
  resume?: RunResume,
  spend?: RunSpend,
): Promise<string> {
  const limit = Number(env.COGIT_CLAUDE_TIMEOUT_MS) || CLAUDE_TIMEOUT_MS;
  const args = [
    "-p",
    // A resumed run reads the whole conversation; nothing is written back to it.
    ...(resume === undefined ? [] : ["--resume", resume.sessionId]),
    "--safe-mode",
    "--no-session-persistence",
    "--model",
    model,
    "--output-format",
    "json",
  ];
  const run = (shim: boolean): Promise<string> =>
    runClaudeOnce(prompt, claudeCommand(args, shim, env), model, env, limit, resume, spend);
  if (process.platform !== "win32") return run(false);
  return run(false).catch((error: unknown) =>
    error instanceof MissingClaudeError ? run(true) : Promise.reject(error),
  );
}

/** Plain `claude` was not found; on Windows the `claude.cmd` shim is tried next. */
class MissingClaudeError extends CliError {}

function runClaudeOnce(
  prompt: string,
  command: { command: string; args: string[]; verbatim: boolean },
  model: string,
  env: NodeJS.ProcessEnv,
  limit: number,
  resume?: RunResume,
  spend?: RunSpend,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      env: headlessEnv(env),
      stdio: ["pipe", "pipe", "pipe"],
      windowsVerbatimArguments: command.verbatim,
      ...(resume === undefined ? {} : { cwd: resume.cwd }),
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
      const message = `could not run claude: ${error.message}`;
      reject(error.code === "ENOENT" ? new MissingClaudeError(message) : new CliError(message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut)
        reject(new CliError(`claude did not answer within ${Math.round(limit / 1000)} s`));
      else if (code === 0) {
        // What the run cost, for the map's home; never in the way of the answer.
        if (spend === undefined) resolve(out);
        else void recordSpend(spend.root, spend.kind, model, out).then(() => resolve(out));
      } else reject(new CliError(`claude exited with ${code}: ${err.trim() || "no output"}`));
    });
    child.stdin.end(prompt);
  });
}

/** The adapter's `run`: one headless Claude run, answered with its result text. */
export async function run(
  prompt: string,
  model: string,
  env: NodeJS.ProcessEnv,
  resume?: RunResume,
  spend?: RunSpend,
): Promise<string> {
  return resultText(await runClaude(prompt, model, env, resume, spend));
}
