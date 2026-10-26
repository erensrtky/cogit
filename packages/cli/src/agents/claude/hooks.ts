import { z } from "zod";
import type { HookInput } from "../types.js";

/**
 * Claude Code's hook protocol: the payload arrives on stdin as JSON, and a hook
 * answers with `hookSpecificOutput.additionalContext` so the agent sees the text.
 */

/** The common fields of a Claude Code hook input we rely on; the rest is ignored. */
export const ClaudeHookInput = z.looseObject({
  session_id: z.string(),
  cwd: z.string().optional(),
  /** Where Claude Code keeps the session's transcript (UserPromptSubmit and friends). */
  transcript_path: z.string().optional(),
  stop_hook_active: z.boolean().optional(),
  /** SessionStart only: `startup`, `resume`, `clear` or `compact`. */
  source: z.string().optional(),
});

/** Parses a hook's stdin; undefined when it is not Claude Code's payload. */
export function parseHookInput(stdin: string): HookInput | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(stdin);
  } catch {
    return undefined;
  }
  const parsed = ClaudeHookInput.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** One hook answer that adds text to the agent's context, in Claude Code's shape. */
export function additionalContext(event: string, text: string): Record<string, unknown> {
  return { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
}
