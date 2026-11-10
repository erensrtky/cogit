import { appendFile } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";
import {
  type ProcessInfo,
  type ReadProcess,
  readProcess,
  readWindowsProcesses,
} from "../../push-command.js";
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
 * How this platform reads one process: `/proc` or `ps` per process, and on
 * Windows one PowerShell table, read on first use.
 */
export function platformReader(
  platform: NodeJS.Platform = process.platform,
  readTable: () => Map<number, ProcessInfo> | undefined = readWindowsProcesses,
): ReadProcess {
  if (platform !== "win32") return (pid) => readProcess(pid, platform);
  let table: Map<number, ProcessInfo> | undefined | null = null;
  return (pid) => {
    if (table === null) table = readTable();
    return table?.get(pid);
  };
}

/**
 * Whether this session was started from inside another Claude Code session:
 * walking up from the hook, the first Claude Code process is the session's own,
 * and a second one above it is the session that started it, through its hooks
 * or its commands. A loop script or a cron job has none. Undefined where the
 * process tree cannot be read. Windows hands a dead parent's pid to new
 * processes, so a "parent" that started after its child is a stranger: the walk
 * stops there, as at the top.
 */
export function startedInsideSession(
  read: ReadProcess = platformReader(),
  start: number = process.ppid,
): boolean | undefined {
  let pid = start;
  let found = 0;
  let childStarted: number | undefined;
  for (let depth = 0; depth < 64 && pid > 1; depth += 1) {
    const info = read(pid);
    // Unreadable from the start: no answer; later (a sandbox's own PID 1): the top.
    if (info === undefined) return depth === 0 ? undefined : found > 0 ? false : undefined;
    if (info.started !== undefined && childStarted !== undefined && info.started > childStarted)
      return found > 0 ? false : undefined;
    childStarted = info.started;
    if (isClaudeProcess(info.args)) {
      found += 1;
      if (found === 2) return true;
    }
    pid = info.ppid;
  }
  return found > 0 ? false : undefined;
}

/**
 * Hands the record mark (`COGIT_RECORD=1`) to the commands this session runs,
 * through the file Claude Code gives SessionStart for that: a `claude -p` the
 * agent starts is then recorded too. Claude Code applies the file to the
 * agent's commands only, not to hooks, so another plugin's background runs
 * never see it.
 */
export async function markChildren(env: NodeJS.ProcessEnv): Promise<void> {
  const file = env.CLAUDE_ENV_FILE;
  if (file) await appendFile(file, "export COGIT_RECORD=1\n");
}

/** A hook answer Claude Code shows the user as a warning line; the agent does not see it. */
export function userNotice(text: string): Record<string, unknown> {
  return { systemMessage: text };
}

/** One hook answer that adds text to the agent's context, in Claude Code's shape. */
export function additionalContext(event: string, text: string): Record<string, unknown> {
  return { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
}
