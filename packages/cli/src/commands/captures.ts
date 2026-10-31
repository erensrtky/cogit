import type { Io } from "../io.js";
import { buildCaptures } from "../view/captures.js";
import { timeSince } from "../view/inbox.js";
import type { ViewCapture } from "../view/model.js";
import { loadEffectiveSessions, openProject, selectSessions } from "./log.js";

/**
 * `cogit captures [dir]` (Story 14.1): what the sessions left open, gathered
 * from the records — the same rows the map's Captured list shows. Read-only:
 * cogit keeps no planning state, so there is nothing to tick off here.
 */

export interface CapturesOptions {
  dir: string;
  io: Io;
  /** Only this session (id or unambiguous prefix). */
  session?: string | undefined;
  json?: boolean | undefined;
  /** The reference time for "how old"; tests pin it. */
  now?: string | undefined;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** One line per row: the text, then where it came from, who and how old. */
export function formatCaptures(rows: readonly ViewCapture[], now: string): string[] {
  if (rows.length === 0) return ["No captured work in this project."];
  return rows.map((row) => {
    const marker = row.needsUser ? "! " : "  ";
    const source = row.label === undefined ? row.sessionId : `${row.sessionId} ${row.label}`;
    const age = timeSince(row.updatedAt, now);
    const meta = [source, row.author, age === "" ? undefined : `${age} ago`]
      .filter((part) => part !== undefined)
      .join(" · ");
    return `${marker}${oneLine(row.text)}  (${meta})`;
  });
}

/** `cogit captures`; returns the rows for tests and JSON callers. */
export async function captures(opts: CapturesOptions): Promise<ViewCapture[]> {
  const root = await openProject(opts.dir);
  const sessions = await loadEffectiveSessions(root, opts.io);
  const selected = opts.session === undefined ? sessions : selectSessions(sessions, opts.session);
  const rows = buildCaptures(
    selected.map(({ session, messages }) => ({
      sessionId: session.sessionId,
      title: session.title,
      author: session.author,
      authorEmail: session.authorEmail,
      updatedAt: session.updatedAt,
      status: session.status,
      messages,
    })),
  );
  if (opts.json === true) {
    opts.io.out(JSON.stringify(rows, null, 2));
    return rows;
  }
  for (const line of formatCaptures(rows, opts.now ?? new Date().toISOString())) opts.io.out(line);
  if (rows.some((row) => row.needsUser)) opts.io.out("! = waiting for you");
  return rows;
}
