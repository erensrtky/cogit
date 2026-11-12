/**
 * Builds the shell command shown by the resume button. Kept free of Node
 * imports because the browser template imports it too.
 */

/** Single-quotes a value for POSIX shells; embedded quotes are escaped. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Leaves plain ids alone so the command matches the documented shape. */
function sessionArg(sessionId: string): string {
  return /^[A-Za-z0-9._:/-]+$/.test(sessionId) ? sessionId : shellQuote(sessionId);
}

/**
 * `cd '<project path>' && claude --resume <sessionId>`; with `fork`, adds
 * `--fork-session` so the chat continues as a new session and the original stays.
 * A Codex session uses Codex's own commands, `codex resume <id>` and `codex fork <id>`.
 */
export function resumeCommand(
  projectPath: string,
  sessionId: string,
  fork = false,
  agent = "claude-code",
): string {
  const cd = `cd ${shellQuote(projectPath)}`;
  if (agent === "codex")
    return `${cd} && codex ${fork ? "fork" : "resume"} ${sessionArg(sessionId)}`;
  const command = `${cd} && claude --resume ${sessionArg(sessionId)}`;
  return fork ? `${command} --fork-session` : command;
}
