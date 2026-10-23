import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { configHintOff, configHintOn, configSet } from "../src/commands/config.js";
import { init } from "../src/commands/init.js";
import { sessionWrite } from "../src/commands/session.js";
import { runHook } from "../src/hooks/run.js";
import { COMPACT_REQUEST } from "../src/hooks/sessionstart.js";
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

  const sessionStart = (source: string, e = env) =>
    runHook("sessionstart", JSON.stringify({ session_id: "s1", cwd: root, source }), e, T0, (l) =>
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

  it("offers setup before init on startup and resume, but not on clear", async () => {
    const startup = JSON.parse((await sessionStart("startup")) ?? "");
    expect(startup.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(startup.hookSpecificOutput.additionalContext).toContain(
      "codelineage is not set up in this project",
    );
    expect(startup.hookSpecificOutput.additionalContext).toContain(
      '"${CLAUDE_PLUGIN_ROOT}/dist/cli.js" init --yes',
    );
    const known = JSON.parse(
      (await sessionStart("resume", { ...env, CLAUDE_PLUGIN_ROOT: "/plugins/codelineage" })) ?? "",
    );
    expect(known.hookSpecificOutput.additionalContext).toContain(
      '"/plugins/codelineage/dist/cli.js" init --yes',
    );
    expect(await sessionStart("clear")).toBeUndefined();
    expect(await sessionStart("startup", { ...env, CODELINEAGE_DISABLE: "1" })).toBeUndefined();
    expect(existsSync(join(root, ".codelineage"))).toBe(false);
  });

  it("stays quiet about setup after init", async () => {
    await initialized(2);
    expect(await sessionStart("startup")).toBeUndefined();
    expect(await sessionStart("resume")).toBeUndefined();
  });

  it("silences the setup hint per project with hint-off and undoes it with hint-on", async () => {
    const off = fakeIo(env);
    await configHintOff(root, off);
    expect(off.lines).toEqual([`Setup hint off in ${root}`]);
    expect(await sessionStart("startup")).toBeUndefined();

    const again = fakeIo(env);
    await configHintOff(root, again);
    expect(again.lines).toEqual([`Setup hint was already off in ${root}`]);

    const on = fakeIo(env);
    await configHintOn(root, {}, on);
    expect(on.lines).toEqual([`Setup hint on in ${root}`]);
    expect(await sessionStart("startup")).toBeDefined();

    const notOff = fakeIo(env);
    await configHintOn(root, {}, notOff);
    expect(notOff.lines).toEqual([`Setup hint was not off in ${root}`]);

    await configHintOff(root, fakeIo(env));
    const all = fakeIo(env);
    await configHintOn(".", { all: true }, all);
    expect(all.lines).toEqual(["Setup hint on in every project"]);
    expect(await sessionStart("startup")).toBeDefined();
  });

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

  const transcript = async (lines: unknown[]) => {
    const folder = join(env.CLAUDE_CONFIG_DIR ?? "", "projects", "proj");
    await mkdir(folder, { recursive: true });
    await writeFile(
      join(folder, "s1.jsonl"),
      `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`,
    );
  };

  const typed = (text: string, m: number) => ({
    type: "user",
    timestamp: `2026-10-23T10:0${m}:00.000Z`,
    message: { role: "user", content: text },
  });

  it("asks for an update after compaction when messages have no node", async () => {
    await initialized(2);
    await transcript([typed("first", 1), typed("second", 2)]);
    expect(JSON.parse((await sessionStart("compact")) ?? "")).toEqual({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: COMPACT_REQUEST },
    });
  });

  it("stays quiet after compaction when every message has a node", async () => {
    await initialized(2);
    await transcript([typed("first", 1)]);
    await sessionWrite({ dir: root }, fakeIo(env), async () =>
      JSON.stringify({ sessionId: "s1", nodes: [{ id: "m1", kind: "message", title: "First" }] }),
    );
    expect(await sessionStart("compact")).toBeUndefined();
  });

  it("stays quiet for other sources, without a transcript and when disabled", async () => {
    await initialized(2);
    expect(await sessionStart("compact")).toBeUndefined();
    await transcript([typed("first", 1)]);
    expect(await sessionStart("startup")).toBeUndefined();
    expect(await sessionStart("resume")).toBeUndefined();
    expect(await sessionStart("clear")).toBeUndefined();
    expect(await sessionStart("compact", { ...env, CODELINEAGE_DISABLE: "1" })).toBeUndefined();
  });

  it("stays quiet when the transcript cannot be read", async () => {
    await initialized(2);
    // A directory where the transcript should be: found, but reading it fails.
    await mkdir(join(env.CLAUDE_CONFIG_DIR ?? "", "projects", "proj", "s1.jsonl"), {
      recursive: true,
    });
    expect(await sessionStart("compact")).toBeUndefined();
  });

  it("stays quiet before init even when the transcript has unrecorded messages", async () => {
    await transcript([typed("first", 1)]);
    expect(await sessionStart("compact")).toBeUndefined();
    expect(existsSync(join(root, ".codelineage"))).toBe(false);
  });

  it("ignores transcript lines that are not messages", async () => {
    await initialized(2);
    await transcript([
      {
        type: "user",
        timestamp: "2026-10-23T10:01:00.000Z",
        message: { role: "user", content: [{ type: "tool_result", content: "out" }] },
      },
    ]);
    expect(await sessionStart("compact")).toBeUndefined();
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
