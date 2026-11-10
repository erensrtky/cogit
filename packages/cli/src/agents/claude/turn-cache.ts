import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ChatTurn } from "../types.js";

/**
 * What a transcript says, kept on disk so a command does not read the whole
 * file again. Claude Code's transcripts grow to tens of megabytes, mostly tool
 * output, and every `log`, `search` and map build read each one line by line.
 * The cache is a copy, never the source: an entry counts only while the
 * transcript has the same size and modification time, and a missing, broken or
 * older-format entry means the transcript is read again.
 */

/** Bump when the parsed turns change shape or meaning, so old entries are read again. */
export const TURN_CACHE_VERSION = 1;

/** `COGIT_CACHE_DIR`, else `$XDG_CACHE_HOME/cogit`, else `~/.cache/cogit`; turns under `turns/`. */
export function turnCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  const base =
    env.COGIT_CACHE_DIR ?? join(env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "cogit");
  return join(base, "turns");
}

interface Entry {
  v: number;
  size: number;
  mtimeMs: number;
  turns: ChatTurn[];
}

/** The transcript's turns from the cache when it still matches, else parsed and cached. */
export async function cachedTurns(
  file: string,
  parse: (file: string) => Promise<ChatTurn[]>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ChatTurn[]> {
  const info = await stat(file);
  const dir = turnCacheDir(env);
  const entryFile = join(
    dir,
    `${createHash("sha256").update(file).digest("hex").slice(0, 32)}.json`,
  );
  try {
    const entry = JSON.parse(await readFile(entryFile, "utf8")) as Partial<Entry>;
    if (
      entry.v === TURN_CACHE_VERSION &&
      entry.size === info.size &&
      entry.mtimeMs === info.mtimeMs &&
      Array.isArray(entry.turns)
    )
      return entry.turns;
  } catch {
    // No entry, or an unreadable one: read the transcript.
  }
  const turns = await parse(file);
  const entry: Entry = { v: TURN_CACHE_VERSION, size: info.size, mtimeMs: info.mtimeMs, turns };
  const tmp = `${entryFile}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(tmp, JSON.stringify(entry));
    await rename(tmp, entryFile);
  } catch {
    // A cache that cannot be written only costs the next read.
    await rm(tmp, { force: true }).catch(() => {});
  }
  return turns;
}
