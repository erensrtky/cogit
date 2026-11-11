import { z } from "zod";
import { type ReadProcess, readProcess } from "../../push-command.js";
import { isAgentProcess, isCodexProcess, walkLineage } from "../lineage.js";
import type { HookInput, SessionLineage } from "../types.js";
import { readOriginator } from "./transcripts.js";

/**
 * Codex CLI's hook protocol. The payload uses Claude Code's field names, with
 * `transcript_path` null for a session that keeps no rollout. The answers
 * differ: Codex rejects fields an event does not know, and its Stop hook has no
 * `additionalContext`; a Stop that wants the agent to act blocks with a reason,
 * which Codex hands the agent as the next prompt.
 */

const CodexHookInput = z.looseObject({
  session_id: z.string(),
  cwd: z.string().optional(),
  transcript_path: z.string().nullish(),
  stop_hook_active: z.boolean().optional(),
  /** SessionStart only: `startup`, `resume` or `clear`. */
  source: z.string().optional(),
});

/** Parses a hook's stdin; undefined when it is not Codex's payload. */
export function parseHookInput(stdin: string): HookInput | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(stdin);
  } catch {
    return undefined;
  }
  const parsed = CodexHookInput.safeParse(raw);
  if (!parsed.success) return undefined;
  const { transcript_path, ...rest } = parsed.data;
  return transcript_path == null ? rest : { ...rest, transcript_path };
}

/**
 * Whether the session runs under `codex exec`, nobody typing into it. The
 * rollout says so in its first line; when there is none yet, the process tree
 * does (exec runs its hooks as its own children, while the interactive CLI runs
 * them from a background server). Codex sets no variable for it.
 */
export async function isHeadless(
  input: HookInput,
  read: ReadProcess = (pid) => readProcess(pid),
  start: number = process.ppid,
): Promise<boolean> {
  const originator =
    input.transcript_path === undefined
      ? undefined
      : await readOriginator(input.transcript_path).catch(() => undefined);
  if (originator !== undefined) return originator === "codex_exec";
  let pid = start;
  for (let depth = 0; depth < 64 && pid > 1; depth += 1) {
    const info = read(pid);
    if (info === undefined) return false;
    if (isCodexProcess(info.args)) return info.args.slice(1).includes("exec");
    pid = info.ppid;
  }
  return false;
}

/**
 * The Codex process above a hook and the agent session above that, Claude
 * Code's or Codex's: a `codex exec` that a recorded session started through
 * its commands names that session as its parent. Under the interactive CLI the
 * hooks run from Codex's background server, which no session started.
 */
export function sessionLineage(read?: ReadProcess, start?: number): SessionLineage | undefined {
  return walkLineage(isCodexProcess, isAgentProcess, read, start);
}

/**
 * Codex has no file that hands variables to the agent's commands, so a session
 * cannot mark what it starts; a `claude -p` it runs counts as one a script
 * started.
 */
export async function markChildren(): Promise<void> {}

/** A hook answer Codex shows the user as a warning; the agent does not see it. */
export function userNotice(text: string): Record<string, unknown> {
  return { systemMessage: text };
}

/**
 * One hook answer that gives the agent text: context for SessionStart and
 * UserPromptSubmit, a continuation prompt for Stop.
 */
export function additionalContext(event: string, text: string): Record<string, unknown> {
  if (event === "Stop") return { decision: "block", reason: text };
  return { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
}
