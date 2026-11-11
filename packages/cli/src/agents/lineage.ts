import { basename } from "node:path";
import { type ReadProcess, readProcess } from "../push-command.js";
import type { SessionLineage } from "./types.js";

/**
 * Agent processes as the process tree shows them, and the walk up that tree
 * that finds a hook's own session and the session that started it.
 */

/** A program's file name, lower case, with / for every separator. */
function program(args: readonly string[]): { path: string; name: string } {
  const path = (args[0] ?? "").replace(/\\/g, "/");
  return { path, name: basename(path).toLowerCase() };
}

/** Whether `args` run Node on a script whose path matches `script`. */
function nodeRunning(args: readonly string[], script: RegExp): boolean {
  return (
    /^node(\.exe)?$/.test(program(args).name) && script.test((args[1] ?? "").replace(/\\/g, "/"))
  );
}

/**
 * A Claude Code process by its arguments: the native `claude` binary (on the
 * PATH, or the versioned file it links to) or the npm package's `cli.js` under
 * Node.
 */
export function isClaudeProcess(args: readonly string[]): boolean {
  const { path, name } = program(args);
  if (name === "claude" || name === "claude.exe" || path.includes("/claude/versions/")) return true;
  return nodeRunning(args, /claude-code\/cli\.m?js$/);
}

/**
 * A Codex CLI process: the native `codex` binary (the npm package runs it from
 * its vendor folder) or the package's `codex.js` under Node.
 */
export function isCodexProcess(args: readonly string[]): boolean {
  const { name } = program(args);
  return (
    name === "codex" || name === "codex.exe" || nodeRunning(args, /@openai\/codex\/bin\/codex\.js$/)
  );
}

/** Any agent session cogit knows. */
export function isAgentProcess(args: readonly string[]): boolean {
  return isClaudeProcess(args) || isCodexProcess(args);
}

/**
 * Walks up from `start`: the first process that is `own` is the hook's own
 * session, and the next one that is `session` is the session that started it,
 * through its hooks or its commands (`parent`). A loop script or a cron job has
 * none (`parent: null`). Undefined where the process tree cannot be read (on
 * Windows, where asking PowerShell took over three seconds on a CI runner, too
 * long for a hook) or holds no `own` process.
 */
export function walkLineage(
  own: (args: readonly string[]) => boolean,
  session: (args: readonly string[]) => boolean,
  read: ReadProcess = (pid) => readProcess(pid),
  start: number = process.ppid,
): SessionLineage | undefined {
  let pid = start;
  let found: number | undefined;
  for (let depth = 0; depth < 64 && pid > 1; depth += 1) {
    const info = read(pid);
    // Unreadable later (a sandbox's own PID 1) is the top; from the start, no answer.
    if (info === undefined) break;
    if (found === undefined ? own(info.args) : session(info.args)) {
      if (found !== undefined) return { own: found, parent: pid };
      found = pid;
    }
    pid = info.ppid;
  }
  return found === undefined ? undefined : { own: found, parent: null };
}
