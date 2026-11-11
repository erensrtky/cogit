import { appendFile } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";
import { type ReadProcess, readProcess } from "../../push-command.js";
import type { HookInput, SessionLineage } from "../types.js";

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

/**
 * Whether the hook runs in a session nobody types into: `claude -p` and the SDKs
 * mark themselves `sdk-*` in `CLAUDE_CODE_ENTRYPOINT`, which the hooks inherit.
 * Other plugins start such sessions in the background, one per prompt.
 */
export function isHeadless(env: NodeJS.ProcessEnv): boolean {
  return env.CLAUDE_CODE_ENTRYPOINT?.startsWith("sdk") ?? false;
}

/**
 * A Claude Code process by its arguments: the native `claude` binary (on the
 * PATH, or the versioned file it links to) or the npm package's `cli.js` under
 * Node.
 */
export function isClaudeProcess(args: readonly string[]): boolean {
  const first = (args[0] ?? "").replace(/\\/g, "/");
  const name = basename(first).toLowerCase();
  if (name === "claude" || name === "claude.exe" || first.includes("/claude/versions/"))
    return true;
  return (
    /^node(\.exe)?$/.test(name) &&
    /claude-code\/cli\.m?js$/.test((args[1] ?? "").replace(/\\/g, "/"))
  );
}

/**
 * The Claude Code processes above a hook: walking up, the first is the
 * session's own, and a second one above it is the session that started it,
 * through its hooks or its commands (`parent`). A loop script or a cron job has
 * none (`parent: null`). Undefined where the process tree cannot be read: on
 * Windows, where asking PowerShell took over three seconds on a CI runner, too
 * long for a hook.
 */
export function sessionLineage(
  read: ReadProcess = (pid) => readProcess(pid),
  start: number = process.ppid,
): SessionLineage | undefined {
  let pid = start;
  let own: number | undefined;
  for (let depth = 0; depth < 64 && pid > 1; depth += 1) {
    const info = read(pid);
    // Unreadable later (a sandbox's own PID 1) is the top; from the start, no answer.
    if (info === undefined) break;
    if (isClaudeProcess(info.args)) {
      if (own !== undefined) return { own, parent: pid };
      own = pid;
    }
    pid = info.ppid;
  }
  return own === undefined ? undefined : { own, parent: null };
}

/**
 * Hands the record mark to the commands this session runs, through the file
 * Claude Code gives SessionStart for that: a `claude -p` the agent starts is
 * then recorded too. The mark names this session's own process, so only a
 * session it starts directly counts, not one a plugin starts inside that
 * session in turn. Where the process is unknown (Windows) it is `1`. Claude
 * Code applies the file to the agent's commands only, not to hooks.
 */
export async function markChildren(env: NodeJS.ProcessEnv, own?: number): Promise<void> {
  const file = env.CLAUDE_ENV_FILE;
  if (file) await appendFile(file, `export COGIT_RECORD=${own ?? 1}\n`);
}

/** A hook answer Claude Code shows the user as a warning line; the agent does not see it. */
export function userNotice(text: string): Record<string, unknown> {
  return { systemMessage: text };
}

/** One hook answer that adds text to the agent's context, in Claude Code's shape. */
export function additionalContext(event: string, text: string): Record<string, unknown> {
  return { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
}
