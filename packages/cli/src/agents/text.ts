import type { FileHandle } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import type { ChatTurn } from "./types.js";

/**
 * Pieces every agent's transcript reader shares: how long a chat entry may be
 * on the map, how edited files are named there, and reading a byte range.
 */

/** The longest text one chat entry keeps on the map; the rest is cut with a note. */
export const CHAT_TEXT_LIMIT = 20_000;

export function capped(text: string): string {
  if (text.length <= CHAT_TEXT_LIMIT) return text;
  return `${text.slice(0, CHAT_TEXT_LIMIT)}\n\n[… ${text.length - CHAT_TEXT_LIMIT} more characters not shown]`;
}

/** Text on one line, whitespace collapsed. */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * A turn's text and replies capped and its edited files named relative to the
 * project (or the worktree the session ran in), the way git names files, with /
 * even on Windows. Steps and questions feed the recorder only; the map keeps
 * the counts.
 */
export function mapTurn(turn: ChatTurn, text: string, roots: string[]): ChatTurn {
  const fromRoot = (file: string): string => {
    if (!isAbsolute(file)) return file;
    for (const root of roots) {
      const rel = relative(root, file);
      if (rel !== "" && !rel.startsWith("..") && !isAbsolute(rel)) return rel.split(sep).join("/");
    }
    return file;
  };
  return {
    ...turn,
    text: capped(text),
    replies: turn.replies.map(capped),
    tools: {
      commands: turn.tools.commands,
      files: turn.tools.files.map(fromRoot),
      other: turn.tools.other,
    },
  };
}

/** Reads a byte range from an open file, however many reads the OS needs. */
export async function readRange(handle: FileHandle, start: number, end: number): Promise<Buffer> {
  const buffer = Buffer.allocUnsafe(end - start);
  let offset = 0;
  // A POSIX read may return less than asked; `end` is inside the file, so this
  // loop cannot stall at zero.
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, start + offset);
    offset += bytesRead;
  }
  return buffer.subarray(0, offset);
}
