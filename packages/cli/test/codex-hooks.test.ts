import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  additionalContext,
  isHeadless,
  markChildren,
  parseHookInput,
  sessionLineage,
  userNotice,
} from "../src/agents/codex/hooks.js";
import { codex } from "../src/agents/codex/index.js";
import { AGENTS } from "../src/agents/index.js";
import { isAgentProcess, isCodexProcess } from "../src/agents/lineage.js";
import type { SessionLineage } from "../src/agents/types.js";
import { configSet } from "../src/commands/config.js";
import { init } from "../src/commands/init.js";
import { runHook } from "../src/hooks/run.js";
import type { ProcessInfo } from "../src/push-command.js";
import { envFor, fakeIo, T0, tempDir } from "./helpers.js";

const FIXTURES = join(import.meta.dirname, "fixtures", "codex");
const EXEC = join(FIXTURES, "exec-tools.jsonl");
const TUI = join(FIXTURES, "tui-probe.jsonl");

/** pid -> [ppid, args]; a process the map does not hold cannot be read. */
const tree = (rows: Record<number, [number, string[]]>) => (pid: number) => {
  const row = rows[pid];
  return row === undefined ? undefined : ({ ppid: row[0], args: row[1] } satisfies ProcessInfo);
};
const VENDOR =
  "/home/u/.nvm/versions/node/v22/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex";

describe("Codex hook payloads and answers", () => {
  it("reads Codex's payload, a null transcript path included, and refuses anything else", () => {
    expect(
      parseHookInput(
        JSON.stringify({
          session_id: "s1",
          transcript_path: "/r.jsonl",
          cwd: "/p",
          hook_event_name: "SessionStart",
          model: "gpt-6-luna",
          source: "startup",
        }),
      ),
    ).toMatchObject({
      session_id: "s1",
      transcript_path: "/r.jsonl",
      cwd: "/p",
      source: "startup",
    });
    const stop = parseHookInput(
      JSON.stringify({ session_id: "s1", transcript_path: null, stop_hook_active: true }),
    );
    expect(stop).toMatchObject({ session_id: "s1", stop_hook_active: true });
    expect(stop && "transcript_path" in stop).toBe(false);
    expect(parseHookInput("not json")).toBeUndefined();
    expect(parseHookInput(JSON.stringify({ cwd: "/p" }))).toBeUndefined();
  });

  it("answers in the shape each Codex event accepts", () => {
    expect(additionalContext("Stop", "go")).toEqual({ decision: "block", reason: "go" });
    expect(additionalContext("SessionStart", "hi")).toEqual({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "hi" },
    });
    expect(userNotice("note")).toEqual({ systemMessage: "note" });
  });

  it("marks nothing for the commands a session runs", async () => {
    await expect(markChildren()).resolves.toBeUndefined();
  });
});

describe("Codex processes", () => {
  it("knows Codex by its native binary or its npm script, and any agent", () => {
    expect(isCodexProcess([VENDOR, "exec", "hi"])).toBe(true);
    expect(isCodexProcess(["codex"])).toBe(true);
    expect(isCodexProcess(["C:\\Users\\u\\bin\\codex.exe", "exec"])).toBe(true);
    expect(isCodexProcess(["node", "/usr/lib/node_modules/@openai/codex/bin/codex.js"])).toBe(true);
    expect(isCodexProcess(["node", "/plugin/dist/cli.js"])).toBe(false);
    expect(isCodexProcess([])).toBe(false);
    expect(isAgentProcess(["claude"])).toBe(true);
    expect(isAgentProcess(["codex"])).toBe(true);
    expect(isAgentProcess(["bash"])).toBe(false);
  });

  it("finds the Codex process and the agent session above it", () => {
    const exec: [number, string[]] = [20, [VENDOR, "exec", "task"]];
    // A Claude Code chat ran `codex exec` through its shell.
    const fromClaude = tree({
      10: [11, ["sh"]],
      11: exec,
      20: [30, ["bash"]],
      30: [1, ["claude"]],
    });
    expect(sessionLineage(fromClaude, 10)).toEqual({ own: 11, parent: 30 });
    // A loop script.
    const script = tree({ 10: exec, 20: [1, ["bash", "loop.sh"]] });
    expect(sessionLineage(script, 10)).toEqual({ own: 10, parent: null });
    // The interactive CLI's hooks run from the background server.
    const daemon = tree({ 10: [11, ["sh"]], 11: [1, [VENDOR, "app-server", "--listen"]] });
    expect(sessionLineage(daemon, 10)).toEqual({ own: 11, parent: null });
    expect(sessionLineage(() => undefined, 10)).toBeUndefined();
  });

  it("tells exec from the interactive CLI by the rollout, else by the process tree", async () => {
    const none = tree({});
    expect(await isHeadless({ session_id: "s", transcript_path: EXEC }, none, 10)).toBe(true);
    expect(await isHeadless({ session_id: "s", transcript_path: TUI }, none, 10)).toBe(false);
    // No rollout yet: the Codex process above says.
    const exec = tree({ 10: [11, ["sh"]], 11: [1, [VENDOR, "exec", "task"]] });
    const daemon = tree({ 10: [1, [VENDOR, "app-server"]] });
    const missing = { session_id: "s", transcript_path: join(FIXTURES, "missing.jsonl") };
    expect(await isHeadless(missing, exec, 10)).toBe(true);
    expect(await isHeadless({ session_id: "s" }, daemon, 10)).toBe(false);
    expect(await isHeadless({ session_id: "s" }, none, 10)).toBe(false);
    expect(await isHeadless({ session_id: "s" }, tree({ 10: [1, ["sh"]] }), 10)).toBe(false);
  });
});

describe("Codex adapter", () => {
  it("is registered under its own name with Codex's names", () => {
    expect(AGENTS.codex).toBe(codex);
    expect(codex.skill).toBe("$cogit:record");
    expect(codex.commitSessionEnv).toBe("CODEX_THREAD_ID");
    expect(codex.configDir({ CODEX_HOME: "/c" })).toBe("/c");
    expect(codex.excerpt("a\n b")).toBe("a b");
  });

  it("answers unknown for settings it cannot read yet and refuses changes", async () => {
    for (const read of [
      codex.readRetention,
      codex.readPluginInstalled,
      codex.readPluginVersion,
      codex.readPluginEnabled,
      codex.readSkillAllowed,
      codex.readProjectSetup,
      codex.refreshProjectSetup,
    ])
      expect(await (read as () => Promise<unknown>)()).toBeUndefined();
    await expect(codex.setRetention(30, {}, "s")).rejects.toThrow(
      "cannot set transcript retention for Codex yet",
    );
    await expect(codex.allowSkill({}, "s")).rejects.toThrow("for Codex yet");
    await expect(codex.writeProjectSetup("/p")).rejects.toThrow("for Codex yet");
    await expect(codex.run("p", "m", {})).rejects.toThrow("cannot run the recorder for Codex yet");
    await expect(codex.markLive("s")).resolves.toBeUndefined();
  });

  it("reads its own transcripts and the real process tree without throwing", async () => {
    const dir = await tempDir();
    expect(await codex.collectTranscripts({ CODEX_HOME: dir })).toEqual(new Map());
    expect(await codex.isHeadless({}, { session_id: "s", transcript_path: EXEC })).toBe(true);
    // No rollout: the real process tree answers, whoever runs the tests.
    expect(typeof (await codex.isHeadless({}, { session_id: "s" }))).toBe("boolean");
    const answer = codex.sessionLineage();
    expect(answer === undefined || typeof answer.own === "number").toBe(true);
  });
});

/** The hooks end to end, as the plugin's Codex hooks file calls them (`--agent codex`). */
describe("runHook for Codex", () => {
  let dir: string;
  let root: string;
  let env: NodeJS.ProcessEnv;
  let spawned: string[][];
  let waited: string[][];
  let lineage: SessionLineage | undefined;
  let rollout: string;

  const hook = (event: string, payload: Record<string, unknown>, e = env) =>
    runHook(
      event,
      JSON.stringify({ session_id: "s1", cwd: root, transcript_path: rollout, ...payload }),
      e,
      T0,
      () => {},
      {
        agent: "codex",
        cli: "/plugin/dist/cli.js",
        spawnDetached: (_cli, args) => spawned.push(args),
        runAndWait: async (_cli, args) => {
          waited.push(args);
        },
        sessionLineage: () => lineage,
      },
    );

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
    env = envFor(dir);
    spawned = [];
    waited = [];
    lineage = { own: 20, parent: null };
    rollout = join(dir, "rollout.jsonl");
    await copyFile(TUI, rollout);
    await init(root, { name: "p", retention: "keep", language: "auto" }, fakeIo(env));
    await configSet("updateEveryTurns", "1", fakeIo(env));
    await configSet("recorder", "agent", fakeIo(env));
  });

  it("asks a person's session to record by blocking Stop with the Codex skill", async () => {
    const out = JSON.parse((await hook("stop", {})) ?? "");
    expect(out).toEqual({ decision: "block", reason: expect.stringContaining("$cogit:record") });
    expect(spawned).toContainEqual(["build", root, "--quiet"]);
    // The turn Stop continued is not asked again.
    expect(await hook("stop", { stop_hook_active: true })).toBeUndefined();
    const start = JSON.parse((await hook("sessionstart", { source: "startup" })) ?? "");
    expect(start.hookSpecificOutput.hookEventName).toBe("SessionStart");
  });

  it("closes a `codex exec` run at Stop, waiting, and leaves it alone with Background work off", async () => {
    await copyFile(EXEC, rollout);
    expect(await hook("stop", {})).toBeUndefined();
    expect(waited).toEqual([["backfill", "s1", "--tail", "--close", "-C", root]]);

    waited = [];
    spawned = [];
    await configSet("recordHeadless", "false", fakeIo(env));
    expect(await hook("stop", {})).toBeUndefined();
    expect(await hook("sessionstart", { source: "startup" })).toBeUndefined();
    expect([...waited, ...spawned]).toEqual([]);
  });
});
