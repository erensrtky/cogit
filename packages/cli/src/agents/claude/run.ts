import { CliError } from "../../io.js";
import { recordSpend, spendOf } from "../../store/spend.js";
import { type HeadlessCommand, runWithShim, shimCommand } from "../headless.js";
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

/** How to start Claude Code; see `shimCommand`. */
export function claudeCommand(
  args: string[],
  shim: boolean,
  env: NodeJS.ProcessEnv = process.env,
): HeadlessCommand {
  return shimCommand("claude", args, shim, env);
}

/**
 * Runs Claude Code once, headless and without session persistence, with the
 * prompt on stdin. Resolves with stdout, after noting what the run cost when
 * `spend` names the project.
 */
export async function runClaude(
  prompt: string,
  model: string,
  env: NodeJS.ProcessEnv,
  resume?: RunResume,
  spend?: RunSpend,
): Promise<string> {
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
  const out = await runWithShim("claude", args, prompt, env, resume?.cwd);
  // What the run cost, for the map's home; never in the way of the answer.
  if (spend !== undefined) await recordSpend(spend.root, spend.kind, model, spendOf(out));
  return out;
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
