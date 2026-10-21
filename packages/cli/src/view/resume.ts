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

/** `cd '<project path>' && claude --resume <sessionId>` */
export function resumeCommand(projectPath: string, sessionId: string): string {
  return `cd ${shellQuote(projectPath)} && claude --resume ${sessionArg(sessionId)}`;
}
