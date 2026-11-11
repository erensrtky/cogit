import { CliError } from "../../io.js";
import { recordSpend, type Spent } from "../../store/spend.js";
import { AgentExitError, runWithShim } from "../headless.js";
import type { RunResume, RunSpend } from "../types.js";

/**
 * Claude Code's model names, which a Codex account refuses ("The 'haiku' model
 * is not supported when using Codex with a ChatGPT account"). The side model
 * setting holds one of these unless the person chose a Codex model.
 */
const CLAUDE_MODEL = /^(claude-|haiku|sonnet|opus|default$|best$)/i;

/** The `-m` value for Codex; undefined leaves Codex on its own configured model. */
export function codexModel(model: string): string | undefined {
  return CLAUDE_MODEL.test(model) ? undefined : model;
}

/**
 * The arguments for one headless Codex run. A resumed run forks the session
 * (`exec fork`), which reads the whole conversation; `--ephemeral` writes no
 * rollout for the fork, and the original is never touched. Hooks are off so
 * cogit's own run does not record itself or start another close; the read-only
 * sandbox keeps the run from changing the project. `exec fork` takes no
 * `--sandbox`, so it goes before `fork`.
 */
export function codexArgs(model: string, resume?: RunResume): string[] {
  const chosen = codexModel(model);
  return [
    "exec",
    "--sandbox",
    "read-only",
    ...(resume === undefined ? [] : ["fork"]),
    "--disable",
    "hooks",
    "--ephemeral",
    "--skip-git-repo-check",
    "--json",
    ...(chosen === undefined ? [] : ["--model", chosen]),
    ...(resume === undefined ? [] : [resume.sessionId]),
    // The prompt comes on stdin.
    "-",
  ];
}

/** What `codex exec --json` printed: the last written reply, the tokens, or why the turn failed. */
export interface CodexOutput {
  answer?: string;
  spent?: Spent;
  error?: string;
}

const count = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;

/**
 * Reads the JSONL events of `codex exec --json`. Codex counts cached input
 * inside `input_tokens`; cogit's spend log keeps them apart, as Claude Code
 * reports them. Codex reports no cost, so `usd` is 0.
 */
export function parseCodexOutput(stdout: string): CodexOutput {
  const output: CodexOutput = {};
  for (const line of stdout.split("\n")) {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (event === null || typeof event !== "object") continue;
    const item = event.item as Record<string, unknown> | undefined;
    if (event.type === "item.completed" && item?.type === "agent_message") {
      if (typeof item.text === "string") output.answer = item.text;
    } else if (event.type === "turn.completed") {
      const usage = (event.usage ?? {}) as Record<string, unknown>;
      const cached = count(usage.cached_input_tokens);
      output.spent = {
        usd: 0,
        inputTokens: Math.max(0, count(usage.input_tokens) - cached),
        outputTokens: count(usage.output_tokens),
        cacheReadTokens: cached,
        cacheWriteTokens: count(usage.cache_write_input_tokens),
      };
    } else if (event.type === "turn.failed" || event.type === "error") {
      const error = (event.error ?? event) as Record<string, unknown>;
      if (typeof error.message === "string") output.error = error.message;
    }
  }
  return output;
}

/**
 * The adapter's `run`: one headless Codex run, answered with its last written
 * reply. Its tokens are noted when `spend` names the project.
 */
export async function run(
  prompt: string,
  model: string,
  env: NodeJS.ProcessEnv,
  resume?: RunResume,
  spend?: RunSpend,
): Promise<string> {
  let stdout: string;
  try {
    stdout = await runWithShim("codex", codexArgs(model, resume), prompt, env, resume?.cwd);
  } catch (error) {
    // A refused model or a failed turn exits non-zero and says why on stdout.
    const said = error instanceof AgentExitError ? parseCodexOutput(error.stdout).error : undefined;
    throw said === undefined ? error : new CliError(`codex failed: ${said}`);
  }
  const output = parseCodexOutput(stdout);
  if (spend !== undefined)
    await recordSpend(spend.root, spend.kind, codexModel(model) ?? "codex", output.spent);
  if (output.answer === undefined)
    throw new CliError(`codex returned no reply${output.error ? `: ${output.error}` : ""}`);
  return output.answer;
}
