import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import type { ChatTurn, ForkOrigin } from "../types.js";

/**
 * Forked sessions (`claude --resume <id> --fork-session`). Claude Code copies the
 * original's lines into the new transcript with their uuids and times, changes
 * only the session id and marks nothing. A copied message read as the fork's own
 * would be recorded a second time under a new id, so the fork's messages start
 * after the part it shares with the session it came from.
 */
/** A copy of a fork of a fork can name the session the copy came from; this bounds the walk. */
const MAX_DEPTH = 8;

const USER_LINE = /"type":"user"/;
const LINE_UUID = /"uuid":"([^"]+)"/;

/**
 * Per process: a transcript only grows at its end, so its first message never
 * changes. Reading every transcript of the folder only as far as its first
 * message is the one scan a fork check costs (a fraction of a second for hundreds).
 */
const firstUuids = new Map<string, string | null>();

/** The uuid of the first user line that is a message, read only as far as that line. */
async function firstMessageUuid(
  file: string,
  isMessage: (line: Record<string, unknown>) => boolean,
): Promise<string | null> {
  const known = firstUuids.get(file);
  if (known !== undefined) return known;
  const input = createReadStream(file, "utf8");
  const lines = createInterface({ input, crlfDelay: Infinity });
  let found: string | null = null;
  try {
    for await (const raw of lines) {
      if (!USER_LINE.test(raw)) continue;
      const line = parseLine(raw);
      if (line === null || !isMessage(line)) continue;
      found = LINE_UUID.exec(raw)?.[1] ?? null;
      break;
    }
  } finally {
    lines.close();
    input.destroy();
  }
  // Only a found uuid is final; an empty file may still get its first message.
  if (found !== null) firstUuids.set(file, found);
  return found;
}

function parseLine(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** When the file was created; null where the file system does not say or the file is gone. */
async function bornAt(file: string): Promise<number | null> {
  const birth = (await stat(file).catch(() => null))?.birthtimeMs ?? 0;
  return birth > 0 ? birth : null;
}

/** How many leading messages two transcripts share, by uuid. */
function sharedPrefix(a: readonly ChatTurn[], b: readonly ChatTurn[]): number {
  let count = 0;
  while (count < a.length && count < b.length) {
    const uuid = a[count]?.uuid;
    if (uuid === undefined || uuid !== b[count]?.uuid) break;
    count++;
  }
  return count;
}

/**
 * Where a transcript was forked from, or null for a session of its own. The
 * origin is the earlier-born transcript in the same folder that shares the
 * longest run of first messages; when that one is itself a fork and the shared
 * run lies inside its own copies, the walk goes on to the session that wrote them.
 */
export async function forkOrigin(
  file: string,
  turns: readonly ChatTurn[],
  readTurns: (file: string) => Promise<ChatTurn[]>,
  isMessage: (line: Record<string, unknown>) => boolean,
  depth = 0,
): Promise<ForkOrigin | null> {
  const first = turns[0];
  if (first?.uuid === undefined || depth > MAX_DEPTH) return null;
  const born = await bornAt(file);

  const dir = dirname(file);
  const names = (await readdir(dir).catch(() => [] as string[])).filter((name) =>
    name.endsWith(".jsonl"),
  );
  let best: { file: string; shared: number; born: number } | null = null;
  for (const name of names) {
    const other = join(dir, name);
    if (other === file) continue;
    // A transcript that cannot be read (removed meanwhile) is no origin.
    if ((await firstMessageUuid(other, isMessage).catch(() => null)) !== first.uuid) continue;
    const otherBorn = (await bornAt(other)) ?? 0;
    // A fork is always born after the session it copies.
    if (born !== null && otherBorn >= born) continue;
    const shared = sharedPrefix(turns, await readTurns(other).catch(() => []));
    // The longest shared run is the direct origin; on a tie, the later-born one.
    if (
      shared > 0 &&
      (best === null || shared > best.shared || (shared === best.shared && otherBorn > best.born))
    )
      best = { file: other, shared, born: otherBorn };
  }
  if (best === null) return null;
  const last = turns[best.shared - 1];
  if (last?.uuid === undefined) return null;
  const copy = { uuid: last.uuid, at: last.at, text: last.text };
  const parentTurns = await readTurns(best.file).catch(() => null);
  const deeper = parentTurns
    ? await forkOrigin(best.file, parentTurns, readTurns, isMessage, depth + 1)
    : null;
  if (deeper && best.shared <= deeper.copied)
    return { sessionId: deeper.sessionId, copied: best.shared, last: copy };
  return { sessionId: basename(best.file, ".jsonl"), copied: best.shared, last: copy };
}
