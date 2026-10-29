import { mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { defaultAgent } from "../src/agents/index.js";
import { configSet } from "../src/commands/config.js";
import { init } from "../src/commands/init.js";
import { sessionWrite } from "../src/commands/session.js";
import { CLOSE_RETRY_LIMIT, retryUnclosed } from "../src/hooks/close-retry.js";
import type { HookContext } from "../src/hooks/run.js";
import { projectPaths } from "../src/store/paths.js";
import { envFor, fakeIo, T0, tempDir } from "./helpers.js";

let dir: string;
let root: string;
let env: NodeJS.ProcessEnv;
let spawned: string[][];

const HOUR = 60 * 60_000;
// Records written in these tests carry the frozen clock, T0.
const at = (ms: number) => new Date(Date.parse(T0) + ms);
const later = (ms: number) => at(ms).toISOString();

beforeEach(async () => {
  dir = await tempDir();
  root = join(dir, "proj");
  await mkdir(root);
  env = envFor(dir);
  spawned = [];
  await init(root, { name: "p", retention: "keep", language: "auto" }, fakeIo(env));
});

function ctx(now: string, sessionId = "current"): HookContext {
  return {
    agent: defaultAgent(),
    input: { session_id: sessionId, cwd: root, source: "startup" },
    sessionId,
    root,
    initialized: true,
    env,
    now,
    spawnDetached: (args) => spawned.push(args),
  };
}

function transcriptPath(id: string): string {
  return join(env.CLAUDE_CONFIG_DIR ?? "", "projects", "proj", `${id}.jsonl`);
}

/** A recorded session with one message and its transcript, both written at T0. */
async function recorded(id: string, extra: Record<string, unknown> = {}): Promise<void> {
  await mkdir(join(env.CLAUDE_CONFIG_DIR ?? "", "projects", "proj"), { recursive: true });
  const line = { type: "user", timestamp: T0, message: { content: "Hi" } };
  await writeFile(transcriptPath(id), `${JSON.stringify(line)}\n`);
  await utimes(transcriptPath(id), at(0), at(0));
  await sessionWrite({ dir: root, by: "side" }, fakeIo(env), async () =>
    JSON.stringify({
      sessionId: id,
      nodes: [{ id: "m1", kind: "message", title: "Hi" }],
      ...extra,
    }),
  );
}

const closing = (id: string) => ["backfill", id, "--tail", "--close", "-C", root];

describe("retryUnclosed", () => {
  it("closes an idle session that has no leftOff, up to the retry limit", async () => {
    await recorded("s1");
    for (let i = 0; i < CLOSE_RETRY_LIMIT + 1; i += 1) await retryUnclosed(ctx(later(HOUR)));
    expect(spawned).toEqual(Array(CLOSE_RETRY_LIMIT).fill(closing("s1")));
    const state = JSON.parse(await readFile(projectPaths(root).state("s1"), "utf8"));
    expect(state.closeRetries).toBe(CLOSE_RETRY_LIMIT);
  });

  it("leaves closed, current, recent, old and message-less sessions alone", async () => {
    await recorded("closed", { leftOff: "Done." });
    await recorded("current");
    await recorded("busy");
    // Its transcript was written five minutes before the start: maybe still open.
    const recent = at(HOUR - 5 * 60_000);
    await utimes(transcriptPath("busy"), recent, recent);
    await sessionWrite({ dir: root, by: "side" }, fakeIo(env), async () =>
      JSON.stringify({ sessionId: "steps", nodes: [{ id: "a", kind: "step", title: "Step" }] }),
    );
    await retryUnclosed(ctx(later(HOUR)));
    expect(spawned).toEqual([]);

    await recorded("old");
    await retryUnclosed(ctx(later(4 * 24 * HOUR), "none"));
    expect(spawned).toEqual([]);
  });

  it("closes a session whose transcript is gone", async () => {
    await recorded("s1");
    await rm(transcriptPath("s1"));
    await retryUnclosed(ctx(later(HOUR)));
    expect(spawned).toEqual([closing("s1")]);
  });

  it("starts at most three closing passes per session start", async () => {
    for (const id of ["a", "b", "c", "d"]) await recorded(id);
    await retryUnclosed(ctx(later(HOUR)));
    expect(spawned).toHaveLength(3);
  });

  it("does nothing when the session-end catch-up is off", async () => {
    await recorded("s1");
    await configSet("sessionEndCatchUp", "false", fakeIo(env));
    await retryUnclosed(ctx(later(HOUR)));
    expect(spawned).toEqual([]);
  });
});
