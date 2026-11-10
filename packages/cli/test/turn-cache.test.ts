import { appendFile, mkdir, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cachedTurns, TURN_CACHE_VERSION, turnCacheDir } from "../src/agents/claude/turn-cache.js";
import type { ChatTurn } from "../src/agents/types.js";
import { tempDir } from "./helpers.js";

let dir: string;
let env: NodeJS.ProcessEnv;
let file: string;
beforeEach(async () => {
  dir = await tempDir();
  env = { COGIT_CACHE_DIR: join(dir, "cache") };
  file = join(dir, "s1.jsonl");
  await writeFile(file, "line one\n");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A parser that counts its calls and makes one turn per line. */
function counting(): { parse: (file: string) => Promise<ChatTurn[]>; calls: () => number } {
  let calls = 0;
  return {
    parse: async (path: string) => {
      calls += 1;
      const { readFile } = await import("node:fs/promises");
      return (await readFile(path, "utf8"))
        .split("\n")
        .filter(Boolean)
        .map((text, at) => ({
          id: `m${at + 1}`,
          at: "",
          text,
          replies: [],
          tools: { commands: 0, files: [], other: 0 },
        }));
    },
    calls: () => calls,
  };
}

describe("the transcript turn cache", () => {
  it("keeps the turns while the transcript is unchanged and reads it again when it grows", async () => {
    const reader = counting();
    expect((await cachedTurns(file, reader.parse, env)).map((t) => t.text)).toEqual(["line one"]);
    expect((await cachedTurns(file, reader.parse, env)).map((t) => t.text)).toEqual(["line one"]);
    expect(reader.calls()).toBe(1);
    await appendFile(file, "line two\n");
    expect(await cachedTurns(file, reader.parse, env)).toHaveLength(2);
    expect(reader.calls()).toBe(2);
  });

  it("reads again when only the modification time changed", async () => {
    const reader = counting();
    await cachedTurns(file, reader.parse, env);
    await utimes(file, new Date(), new Date(Date.now() + 60_000));
    await cachedTurns(file, reader.parse, env);
    expect(reader.calls()).toBe(2);
  });

  it("reads again over a broken or older-format entry", async () => {
    const reader = counting();
    await cachedTurns(file, reader.parse, env);
    const [entry] = await readdir(turnCacheDir(env));
    await writeFile(join(turnCacheDir(env), entry as string), "{broken");
    await cachedTurns(file, reader.parse, env);
    await writeFile(
      join(turnCacheDir(env), entry as string),
      JSON.stringify({ v: TURN_CACHE_VERSION - 1, size: 9, mtimeMs: 0, turns: [] }),
    );
    expect(await cachedTurns(file, reader.parse, env)).toHaveLength(1);
    expect(reader.calls()).toBe(3);
  });

  it("still answers when the cache cannot be written", async () => {
    await writeFile(join(dir, "blocked"), "a file, not a folder");
    const blocked = { COGIT_CACHE_DIR: join(dir, "blocked") };
    const reader = counting();
    expect(await cachedTurns(file, reader.parse, blocked)).toHaveLength(1);
    expect(await cachedTurns(file, reader.parse, blocked)).toHaveLength(1);
    expect(reader.calls()).toBe(2);
  });

  it("lives under COGIT_CACHE_DIR, else the XDG cache, else ~/.cache", async () => {
    expect(turnCacheDir({ COGIT_CACHE_DIR: "/c" })).toBe("/c/turns");
    expect(turnCacheDir({ XDG_CACHE_HOME: "/x" })).toBe("/x/cogit/turns");
    expect(turnCacheDir({})).toMatch(/\.cache\/cogit\/turns$/);
    await mkdir(turnCacheDir(env), { recursive: true });
  });
});
