import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { constants, gunzipSync, gzipSync } from "node:zlib";
import { redactDeep } from "../redact.js";
import type { ChatTurn, ToolUse } from "../transcript.js";
import { projectPaths } from "./paths.js";

/**
 * The conversation as the drill-down shows it, kept in the project so it
 * survives Claude Code deleting the transcript. One JSON line per turn, each
 * append one more gzip member: the file is append-only and never rewritten.
 */
export interface StoredTurn {
  /** The transcript's uuid for the user line; the key that makes appends idempotent. */
  uuid: string;
  at: string;
  text: string;
  replies: string[];
  tools: ToolUse;
}

function isStoredTurn(value: unknown): value is StoredTurn {
  if (value === null || typeof value !== "object") return false;
  const turn = value as Partial<StoredTurn>;
  return (
    typeof turn.uuid === "string" &&
    turn.uuid !== "" &&
    typeof turn.at === "string" &&
    typeof turn.text === "string" &&
    Array.isArray(turn.replies) &&
    turn.replies.every((reply) => typeof reply === "string") &&
    turn.tools !== null &&
    typeof turn.tools === "object"
  );
}

/**
 * Every turn stored for the session, in the order they were appended. A missing
 * file is an empty store; a corrupted member ends the read at what parsed, so a
 * damaged tail never hides the turns before it.
 */
export async function readConversationStore(
  root: string,
  sessionId: string,
): Promise<StoredTurn[]> {
  let text: string;
  try {
    // A process killed mid-append leaves a partial last member; `Z_SYNC_FLUSH`
    // still returns every complete record before it instead of an empty store.
    text = gunzipSync(await readFile(projectPaths(root).conversation(sessionId)), {
      finishFlush: constants.Z_SYNC_FLUSH,
    }).toString("utf8");
  } catch {
    return [];
  }
  const turns: StoredTurn[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const value: unknown = JSON.parse(line);
      if (isStoredTurn(value)) turns.push(value);
    } catch {}
  }
  return turns;
}

/**
 * Appends the turns the store does not hold yet, redacted, and returns how many
 * were written. Turns without a transcript uuid cannot be recognised again, so
 * they are left to the transcript; a build that has a transcript keeps showing
 * them. Never rewrites an existing turn.
 */
export async function appendConversationTurns(
  root: string,
  sessionId: string,
  turns: ChatTurn[],
): Promise<number> {
  const known = new Set((await readConversationStore(root, sessionId)).map((turn) => turn.uuid));
  const fresh: StoredTurn[] = [];
  for (const turn of turns) {
    if (turn.uuid === undefined || known.has(turn.uuid)) continue;
    known.add(turn.uuid);
    fresh.push({
      uuid: turn.uuid,
      at: turn.at,
      text: turn.text,
      replies: turn.replies,
      tools: turn.tools,
    });
  }
  if (fresh.length === 0) return 0;
  // The store outlives the transcript and may be committed by mistake, so it
  // gets the same secret net as the page, not the raw text.
  const { value } = redactDeep(fresh);
  const chunk = `${value.map((turn) => JSON.stringify(turn)).join("\n")}\n`;
  const file = projectPaths(root).conversation(sessionId);
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, gzipSync(Buffer.from(chunk, "utf8")));
  return fresh.length;
}
