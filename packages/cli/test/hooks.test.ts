import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import { configHintOff, configHintOn, configSet } from "../src/commands/config.js";
import { init } from "../src/commands/init.js";
import { sessionWrite } from "../src/commands/session.js";
import { hookBlock } from "../src/git-hooks.js";
import { runHook, spawnDetachedProcess } from "../src/hooks/run.js";
import {
  COMPACT_REQUEST,
  composeStartupContext,
  estimateTokens,
  mostRecentOtherSession,
  STARTUP_CONTEXT_TOKEN_CAP,
} from "../src/hooks/sessionstart.js";
import { countTurn, UPDATE_REQUEST } from "../src/hooks/stop.js";
import type { Session, Status } from "../src/schema/session.js";
import { projectPaths } from "../src/store/paths.js";
import { envFor, fakeIo, noGitDir, T0, tempDir } from "./helpers.js";

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

  it("does not let a side-model write restart the agent's count (12.1)", () => {
    const first = countTurn(undefined, "2026-10-21T10:00:00.000Z", 3).state;
    expect(first.turnsSinceUpdate).toBe(1);
    // The side model recorded; the agent's count keeps going.
    const afterSide = countTurn(first, "2026-10-21T10:01:00.000Z", 3, {
      lastRecordedBy: "side",
      sideEveryTurns: 2,
    });
    expect(afterSide.state.turnsSinceUpdate).toBe(2);
    expect(afterSide.state.turnsSinceSide).toBe(1);
    const third = countTurn(afterSide.state, "2026-10-21T10:01:00.000Z", 3, {
      lastRecordedBy: "side",
      sideEveryTurns: 2,
    });
    expect(third.request).toBe(true);
    expect(third.side).toBe(true);
  });

  it("never asks the agent in side mode and asks the side model on its turns", () => {
    let state: ReturnType<typeof countTurn>["state"] | undefined;
    const requests: boolean[] = [];
    const sides: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      const next = countTurn(state, null, 1, { askAgent: false, sideEveryTurns: 2 });
      state = next.state;
      requests.push(next.request);
      sides.push(next.side);
    }
    expect(requests).toEqual([false, false, false]);
    expect(sides).toEqual([false, true, false]);
  });
});

describe("session start handoff", () => {
  const session = (id: string, startedAt: string, updatedAt: string): Session => ({
    schema: 1,
    sessionId: id,
    agent: "claude-code",
    title: id,
    epoch: null,
    startedAt,
    updatedAt,
    status: { goal: "", done: [], pending: [], next: "" },
    nodes: [],
  });

  it("picks the session with the newest activity, not this one", () => {
    const older = session("old", "2026-10-20T10:00:00.000Z", "2026-10-20T11:00:00.000Z");
    const newer = session("new", "2026-10-19T10:00:00.000Z", "2026-10-21T11:00:00.000Z");
    expect(mostRecentOtherSession([older, newer], "mine")?.sessionId).toBe("new");
    expect(mostRecentOtherSession([older, newer], "new")?.sessionId).toBe("old");
    // Ties fall back to the later start and then the id, so the pick is stable.
    const tied = session("b", "2026-10-21T12:00:00.000Z", "2026-10-21T11:00:00.000Z");
    expect(mostRecentOtherSession([older, newer, tied], "mine")?.sessionId).toBe("b");
    const sameStart = session("a", "2026-10-19T10:00:00.000Z", "2026-10-21T11:00:00.000Z");
    expect(mostRecentOtherSession([newer, sameStart], "mine")?.sessionId).toBe("a");
    expect(mostRecentOtherSession([newer], "new")).toBeUndefined();
  });

  it("truncates even when there are no branches to cut", () => {
    const huge = "x".repeat(STARTUP_CONTEXT_TOKEN_CAP * 4 + 100);
    const text = composeStartupContext(huge, session("s", T0, T0), []);
    expect(estimateTokens(text)).toBeLessThanOrEqual(STARTUP_CONTEXT_TOKEN_CAP);
    expect(text.endsWith("…")).toBe(true);
  });
});

describe("runHook", () => {
  let dir: string;
  let root: string;
  let env: NodeJS.ProcessEnv;
  let debug: string[];
  let spawned: string[][];

  const stop = (extra: Record<string, unknown> = {}, e = env) =>
    runHook(
      "stop",
      JSON.stringify({ session_id: "s1", cwd: root, ...extra }),
      e,
      T0,
      (l) => debug.push(l),
      {
        cli: "/plugin/dist/cli.js",
        spawnDetached: (cli, args) => spawned.push([cli, ...args]),
      },
    );

  const sessionStart = (source: string, e = env, id = "s1") =>
    runHook("sessionstart", JSON.stringify({ session_id: id, cwd: root, source }), e, T0, (l) =>
      debug.push(l),
    );

  // The catch-up itself is covered by backfill.test.ts; here we only see the spawn.
  const sessionEnd = (e = env) =>
    runHook(
      "sessionend",
      JSON.stringify({ session_id: "s1", cwd: root }),
      e,
      T0,
      (l) => debug.push(l),
      {
        cli: "/plugin/dist/cli.js",
        spawnDetached: (cli, args) => spawned.push([cli, ...args]),
      },
    );

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
    env = envFor(dir);
    debug = [];
    spawned = [];
  });

  const initialized = async (everyTurns: number) => {
    await init(root, { name: "p", retention: "keep", language: "auto" }, fakeIo(env));
    await configSet("updateEveryTurns", String(everyTurns), fakeIo(env));
    // These tests drive the main agent's check-ins, which only Detailed mode asks for.
    await configSet("recorder", "mixed", fakeIo(env));
  };

  it("offers setup before init on startup and resume, but not on clear", async () => {
    const startup = JSON.parse((await sessionStart("startup")) ?? "");
    expect(startup.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(startup.hookSpecificOutput.additionalContext).toContain(
      "cogit is not set up in this project",
    );
    expect(startup.hookSpecificOutput.additionalContext).toContain(
      '"${CLAUDE_PLUGIN_ROOT}/dist/cli.js" init --yes',
    );
    const known = JSON.parse(
      (await sessionStart("resume", { ...env, CLAUDE_PLUGIN_ROOT: "/plugins/cogit" })) ?? "",
    );
    expect(known.hookSpecificOutput.additionalContext).toContain(
      '"/plugins/cogit/dist/cli.js" init --yes',
    );
    expect(await sessionStart("clear")).toBeUndefined();
    expect(await sessionStart("startup", { ...env, COGIT_DISABLE: "1" })).toBeUndefined();
    expect(
      JSON.parse((await sessionStart("startup")) ?? "").hookSpecificOutput.additionalContext,
    ).not.toContain("records this project's lineage");
    expect(existsSync(join(root, ".cogit"))).toBe(false);
  });

  it("offers no setup outside a git repository, where init would refuse", async () => {
    const outside = await noGitDir();
    const input = JSON.stringify({ session_id: "s1", cwd: outside, source: "startup" });
    expect(await runHook("sessionstart", input, env, T0, (l) => debug.push(l))).toBeUndefined();
  });

  it("replaces the setup offer with the lineage handoff after init", async () => {
    await initialized(2);
    const context = async (source: string) => {
      const out = JSON.parse((await sessionStart(source)) ?? "");
      return out.hookSpecificOutput.additionalContext as string;
    };
    // No earlier session yet: only the "how to read it" line.
    expect(await context("startup")).toContain("cogit records this project's lineage");
    expect(await context("resume")).toContain(`log -C "${root}"`);
    expect(await context("clear")).toContain("run show before answering");
  });

  const earlierSession = async (
    nodes: unknown[],
    status: Status = { goal: "", done: [], pending: [], next: "" },
  ) =>
    sessionWrite({ dir: root }, fakeIo(env), async () =>
      JSON.stringify({ sessionId: "s0", title: "Earlier work", status, nodes }),
    );

  const startupText = async () =>
    JSON.parse((await sessionStart("startup")) ?? "").hookSpecificOutput
      .additionalContext as string;

  it("hands over the previous session's status and branch summaries at startup", async () => {
    await initialized(2);
    await earlierSession(
      [
        {
          id: "m1",
          kind: "message",
          title: "Start",
          at: "2026-10-21T09:00:00.000Z",
          branch: {
            title: "Setup",
            asked: "how do we start",
            outcome: "scaffold ready",
            open: "tests",
          },
        },
        { id: "m2", kind: "message", title: "Next", parent: "m1", at: "2026-10-21T09:10:00.000Z" },
      ],
      {
        goal: "ship the map",
        done: [],
        pending: [
          { text: "choose a port", needsUser: true },
          { text: "p2", needsUser: false },
          { text: "p3", needsUser: false },
          { text: "p4", needsUser: false },
          { text: "p5", needsUser: false },
          { text: "p6", needsUser: false },
        ],
        next: "write tests",
      },
    );
    const text = await startupText();
    expect(text).toContain(`log -C "${root}"`);
    expect(text).toContain(`show <ref> -C "${root}"`);
    expect(text).toContain("Earlier session: Earlier work (s0)");
    expect(text).toContain("goal: ship the map");
    expect(text).toContain("pending: choose a port (needs the user)");
    expect(text).toContain("pending: … 1 more");
    expect(text).toContain("next: write tests");
    expect(text).toContain("╭ Setup  m1–m2, 2 messages");
    expect(text).toContain("asked: how do we start");
    expect(text).toContain("outcome: scaffold ready");
  });

  it("cuts the oldest branches from the handoff to stay under the token cap", async () => {
    await initialized(2);
    const nodes = Array.from({ length: 12 }, (_, i) => ({
      id: `m${i + 1}`,
      kind: "message",
      title: `M${i + 1}`,
      at: `2026-10-21T09:${String(i).padStart(2, "0")}:00.000Z`,
      ...(i === 0 ? {} : { parent: `m${i}` }),
      branch: {
        title: `Branch ${i + 1}`,
        asked: `asked ${i + 1} ${"a".repeat(250)}`,
        outcome: "o".repeat(580),
        open: "",
      },
    }));
    await earlierSession(nodes);
    const text = await startupText();
    expect(estimateTokens(text)).toBeLessThanOrEqual(STARTUP_CONTEXT_TOKEN_CAP);
    expect(text).toMatch(/older branch summar(y|ies) cut/);
    expect(text).toContain("╭ Branch 12");
    expect(text).not.toContain("╭ Branch 1  ");
  });

  it("stays quiet at session start when startupContext is off", async () => {
    await initialized(2);
    await configSet("startupContext", "false", fakeIo(env));
    expect(await sessionStart("startup")).toBeUndefined();
    expect(await sessionStart("resume")).toBeUndefined();
    expect(await sessionStart("clear")).toBeUndefined();
  });

  it("leaves `claude -p` sessions alone unless recordHeadless is on", async () => {
    const headless = { ...env, CLAUDE_CODE_ENTRYPOINT: "sdk-cli" };
    expect(await sessionStart("startup", headless)).toBeUndefined();
    await initialized(1);
    expect(await sessionStart("startup", headless)).toBeUndefined();
    expect(await stop({}, headless)).toBeUndefined();
    expect(spawned).toEqual([]);
    await configSet("recordHeadless", "true", fakeIo(env));
    expect(await sessionStart("startup", headless)).toContain("records this project's lineage");
    await stop({}, headless);
    expect(spawned).not.toEqual([]);
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
    expect(existsSync(join(root, ".cogit"))).toBe(false);
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

  it("names cogit and its record skill in every message the agent sees", () => {
    expect(UPDATE_REQUEST).toContain("cogit:");
    expect(UPDATE_REQUEST).toContain("/cogit:record");
    expect(COMPACT_REQUEST).toContain("/cogit:record");
  });

  it("rebuilds the map after every turn, detached", async () => {
    await initialized(10);
    expect(await stop()).toBeUndefined();
    expect(spawned).toEqual([["/plugin/dist/cli.js", "build", root, "--quiet"]]);
  });

  it("runs the side model on its own turns in mixed mode (Story 12.1)", async () => {
    await initialized(10);
    await configSet("recorder", "mixed", fakeIo(env));
    await configSet("sideEveryTurns", "2", fakeIo(env));
    expect(await stop()).toBeUndefined();
    expect(spawned.filter((args) => args[1] === "backfill")).toEqual([]);
    expect(await stop()).toBeUndefined();
    expect(spawned.filter((args) => args[1] === "backfill")).toEqual([
      ["/plugin/dist/cli.js", "backfill", "s1", "--tail", "-C", root],
    ]);
  });

  it("never asks the agent in side mode, only the side model (Story 12.1)", async () => {
    await initialized(1);
    await configSet("recorder", "side", fakeIo(env));
    await configSet("sideEveryTurns", "2", fakeIo(env));
    expect(await stop()).toBeUndefined();
    expect(await stop()).toBeUndefined();
    expect(spawned.filter((args) => args[1] === "backfill")).toHaveLength(1);
  });

  it("leaves the side model to session end in agent mode (Story 12.1)", async () => {
    await initialized(1);
    await configSet("recorder", "agent", fakeIo(env));
    expect(await stop()).toBeDefined();
    expect(await stop()).toBeDefined();
    expect(spawned.filter((args) => args[1] === "backfill")).toEqual([]);
  });

  it("skips the rebuild while a build or the session write holds the lock", async () => {
    await initialized(10);
    const paths = projectPaths(root);
    await mkdir(paths.lock("build"), { recursive: true });
    await stop();
    await rm(paths.lock("build"), { recursive: true });
    await mkdir(paths.lock("session-s1"), { recursive: true });
    await stop();
    expect(spawned).toEqual([]);
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
    await mkdir(join(root, ".cogit", "state"));
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

  it("stays quiet for unknown sources, without a transcript and when disabled", async () => {
    await initialized(2);
    expect(await sessionStart("compact")).toBeUndefined();
    await transcript([typed("first", 1)]);
    expect(await sessionStart("elsewhere")).toBeUndefined();
    expect(await sessionStart("compact", { ...env, COGIT_DISABLE: "1" })).toBeUndefined();
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
    expect(existsSync(join(root, ".cogit"))).toBe(false);
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

  it("spawns the detached catch-up at session end when messages have no node", async () => {
    await initialized(2);
    await transcript([typed("first", 1)]);
    expect(await sessionEnd()).toBeUndefined();
    expect(spawned).toEqual([
      ["/plugin/dist/cli.js", "backfill", "s1", "--tail", "--close", "-C", root],
    ]);
  });

  it("still starts the closing pass at session end when everything is recorded", async () => {
    await initialized(2);
    await transcript([typed("first", 1)]);
    await sessionWrite({ dir: root }, fakeIo(env), async () =>
      JSON.stringify({ sessionId: "s1", nodes: [{ id: "m1", kind: "message", title: "First" }] }),
    );
    expect(await sessionEnd()).toBeUndefined();
    expect(spawned).toEqual([
      ["/plugin/dist/cli.js", "backfill", "s1", "--tail", "--close", "-C", root],
    ]);
  });

  it("does not spawn at session end when the catch-up is off", async () => {
    await initialized(2);
    await transcript([typed("second", 2)]);
    await configSet("sessionEndCatchUp", "false", fakeIo(env));
    expect(await sessionEnd()).toBeUndefined();
    expect(spawned).toEqual([]);
  });

  it("commits the record at session end in auto mode, even with the catch-up off", async () => {
    await initialized(2);
    await configSet("recordCommit", "auto", fakeIo(env));
    // Nothing to catch up: the last update still leaves files to commit.
    expect(await sessionEnd()).toBeUndefined();
    expect(spawned).toEqual([["/plugin/dist/cli.js", "record-commit", "s1", "-C", root]]);

    spawned = [];
    await transcript([typed("first", 1)]);
    await configSet("sessionEndCatchUp", "false", fakeIo(env));
    expect(await sessionEnd()).toBeUndefined();
    expect(spawned).toEqual([["/plugin/dist/cli.js", "record-commit", "s1", "-C", root]]);
  });

  it("records the current session for the next code commit", async () => {
    await initialized(2);
    await runHook(
      "promptsubmit",
      JSON.stringify({ session_id: "s1", cwd: root, transcript_path: "/t/s1.jsonl" }),
      env,
      T0,
      () => {},
    );
    expect(JSON.parse(await readFile(join(root, ".cogit", "HEAD"), "utf8"))).toEqual({
      sessionId: "s1",
      transcriptPath: "/t/s1.jsonl",
      at: T0,
    });
  });

  it("points an existing git hook block at the CLI running now", async () => {
    await initialized(2);
    await promisify(execFile)("git", ["-C", root, "init", "-q"]);
    const hook = join(root, ".git", "hooks", "pre-commit");
    await writeFile(hook, "#!/bin/sh\n# >>> cogit\ncogit hook pre-commit || true\n# <<< cogit\n");
    await runHook(
      "promptsubmit",
      JSON.stringify({ session_id: "s1", cwd: root }),
      env,
      T0,
      () => {},
    );
    expect(await readFile(hook, "utf8")).toContain(hookBlock("pre-commit", root));
  });

  it("stays quiet at session end without a readable transcript or before init", async () => {
    await initialized(2);
    expect(await sessionEnd()).toBeUndefined();
    // A directory where the transcript should be: found, but reading it fails.
    await mkdir(join(env.CLAUDE_CONFIG_DIR ?? "", "projects", "proj", "s1.jsonl"), {
      recursive: true,
    });
    expect(await sessionEnd()).toBeUndefined();
    expect(spawned).toEqual([]);

    const fresh = await tempDir();
    const freshRoot = join(fresh, "proj");
    await mkdir(freshRoot);
    const freshSpawned: string[][] = [];
    expect(
      await runHook(
        "sessionend",
        JSON.stringify({ session_id: "s1", cwd: freshRoot }),
        envFor(fresh),
        T0,
        () => {},
        { spawnDetached: (cli, args) => freshSpawned.push([cli, ...args]) },
      ),
    ).toBeUndefined();
    expect(freshSpawned).toEqual([]);
  });

  it("starts the detached child with capture disabled", () => {
    // /dev/null exits at once; this exercises the real spawn path without a CLI.
    expect(() => spawnDetachedProcess("/dev/null", [], env)).not.toThrow();
  });

  it("appends the detached child's output to the log, starting over once it is large", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cogit-log-"));
    const script = join(dir, "child.mjs");
    await writeFile(script, 'console.log("out"); console.error("err");\n');
    const log = join(dir, "state", "detached.log");
    await mkdir(join(dir, "state"));
    await writeFile(log, "x".repeat(300 * 1024));
    spawnDetachedProcess(script, ["side", "run"], env, log);
    await expect.poll(() => readFile(log, "utf8"), { timeout: 5000 }).toMatch(/err\n/);
    const text = await readFile(log, "utf8");
    expect(text).not.toContain("xxx");
    expect(text).toMatch(/^\n--- \S+ side run\n/);
    expect(text).toContain("out\n");
    // A log that cannot be opened (its parent is a file) still starts the child.
    expect(() => spawnDetachedProcess("/dev/null", [], env, join(script, "log"))).not.toThrow();
    await rm(dir, { recursive: true, force: true });
  });

  it("stays silent when disabled, for unknown events and for bad input", async () => {
    await initialized(1);
    expect(await stop({}, { ...env, COGIT_DISABLE: "1" })).toBeUndefined();
    // The pre-rename switch keeps working for one minor version.
    expect(await stop({}, { ...env, CODELINEAGE_DISABLE: "1" })).toBeUndefined();
    expect(await runHook("nope", "{}", env, T0, (l) => debug.push(l))).toBeUndefined();
    expect(await stop({ session_id: "../x" })).toBeUndefined();
    expect(await runHook("stop", "not json", env, T0, (l) => debug.push(l))).toBeUndefined();
    expect(debug).toEqual([expect.stringMatching(/^cogit stop hook: /)]);
  });
});
