import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { configSet } from "../src/commands/config.js";
import { init } from "../src/commands/init.js";
import { sessionWrite } from "../src/commands/session.js";
import { runHook } from "../src/hooks/run.js";
import { countTurn, UPDATE_REQUEST } from "../src/hooks/stop.js";
import { projectPaths } from "../src/store/paths.js";
import { envFor, fakeIo, T0, tempDir } from "./helpers.js";

describe("countTurn", () => {
  it("asks every N turns and starts counting again after each request", () => {
    let state: ReturnType<typeof countTurn>["state"] | undefined;
    const asked: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      const next = countTurn(state, null, 3);
      state = next.state;
      asked.push(next.request);
    }
    expect(asked).toEqual([false, false, true, false, false, true]);
    expect(state?.turns).toBe(6);
  });

  it("restarts the count when the record changed since the last turn", () => {
    const first = countTurn(undefined, null, 3).state;
    const second = countTurn(first, null, 3).state;
    expect(second.turnsSinceUpdate).toBe(2);
    const afterSkill = countTurn(second, "2026-10-21T10:05:00.000Z", 3);
    expect(afterSkill.request).toBe(false);
    expect(afterSkill.state).toMatchObject({
      turnsSinceUpdate: 1,
      recordUpdatedAt: "2026-10-21T10:05:00.000Z",
    });
  });
});

describe("runHook", () => {
  let dir: string;
  let root: string;
  let env: NodeJS.ProcessEnv;
  let debug: string[];

  const stop = (extra: Record<string, unknown> = {}, e = env) =>
    runHook("stop", JSON.stringify({ session_id: "s1", cwd: root, ...extra }), e, T0, (l) =>
      debug.push(l),
    );

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
    env = envFor(dir);
    debug = [];
  });

  const initialized = async (everyTurns: number) => {
    await init(root, { name: "p", retention: "keep", language: "auto" }, fakeIo(env));
    await configSet("updateEveryTurns", String(everyTurns), fakeIo(env));
  };

  it("does nothing before init and creates nothing", async () => {
    expect(await stop()).toBeUndefined();
    expect(existsSync(join(root, ".codelineage"))).toBe(false);
    expect(debug).toEqual([]);
  });

  it("asks for an update through additionalContext every N turns", async () => {
    await initialized(2);
    expect(await stop()).toBeUndefined();
    const out = JSON.parse((await stop()) ?? "");
    expect(out).toEqual({
      hookSpecificOutput: { hookEventName: "Stop", additionalContext: UPDATE_REQUEST },
    });
    expect(await stop()).toBeUndefined();
  });

  it("ignores turns a stop hook continued", async () => {
    await initialized(1);
    expect(await stop({ stop_hook_active: true })).toBeUndefined();
    expect(existsSync(projectPaths(root).state("s1"))).toBe(false);
  });

  it("restarts the count after the skill wrote the record", async () => {
    await initialized(2);
    await stop();
    await sessionWrite({ dir: root }, fakeIo(env), async () => '{"sessionId":"s1"}');
    // The record is new to the hook, so this turn counts as the first again.
    expect(await stop()).toBeUndefined();
    expect(await stop()).toBeDefined();
  });

  it("prefers CLAUDE_PROJECT_DIR over the hook's cwd", async () => {
    await initialized(1);
    const elsewhere = join(dir, "other");
    await mkdir(elsewhere);
    const out = await stop({ cwd: elsewhere }, { ...env, CLAUDE_PROJECT_DIR: root });
    expect(out).toBeDefined();
  });

  it("replaces an unreadable state file instead of failing every turn", async () => {
    await initialized(1);
    await mkdir(join(root, ".codelineage", "state"));
    await writeFile(projectPaths(root).state("s1"), "{nope");
    expect(await stop()).toBeDefined();
    expect(JSON.parse(await readFile(projectPaths(root).state("s1"), "utf8"))).toMatchObject({
      turns: 1,
    });
  });

  it("stays silent when disabled, for unknown events and for bad input", async () => {
    await initialized(1);
    expect(await stop({}, { ...env, CODELINEAGE_DISABLE: "1" })).toBeUndefined();
    expect(await runHook("nope", "{}", env, T0, (l) => debug.push(l))).toBeUndefined();
    expect(await stop({ session_id: "../x" })).toBeUndefined();
    expect(await runHook("stop", "not json", env, T0, (l) => debug.push(l))).toBeUndefined();
    expect(debug).toEqual([expect.stringMatching(/^codelineage stop hook: /)]);
  });
});
