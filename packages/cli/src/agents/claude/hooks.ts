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
  /** PreToolUse only: the tool and its arguments (`file_path` on the write tools). */
  tool_name: z.string().optional(),
  tool_input: z.looseObject({}).optional(),
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

/**
 * Whether the hook runs in a session nobody types into: `claude -p` and the SDKs
 * mark themselves `sdk-*` in `CLAUDE_CODE_ENTRYPOINT`, which the hooks inherit.
 * Other plugins start such sessions in the background, one per prompt.
 */
export function isHeadless(env: NodeJS.ProcessEnv): boolean {
  return env.CLAUDE_CODE_ENTRYPOINT?.startsWith("sdk") ?? false;
}

/** A hook answer Claude Code shows the user as a warning line; the agent does not see it. */
export function userNotice(text: string): Record<string, unknown> {
  return { systemMessage: text };
}

/** One hook answer that adds text to the agent's context, in Claude Code's shape. */
export function additionalContext(event: string, text: string): Record<string, unknown> {
  return { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
}
