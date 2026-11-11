import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isClaudeProcess, sessionLineage } from "../src/agents/claude/hooks.js";
import {
  AGENTS,
  agentNamed,
  agentOfTranscript,
  collectAllTranscripts,
  defaultAgent,
  findSession,
} from "../src/agents/index.js";
import { runHook } from "../src/hooks/run.js";
import type { ProcessInfo } from "../src/push-command.js";
import { T0, tempDir } from "./helpers.js";

/**
 * The adapter is the only place that knows which agent cogit records. These
 * checks keep that boundary honest: a second agent should be a new folder, not a
 * change in a caller.
 */
describe("agent adapter", () => {
  it("exposes Claude Code as the only implementation", () => {
    const agent = defaultAgent();
    expect(agent).toBe(AGENTS["claude-code"]);
    expect(agent.name).toBe("claude-code");
    expect(agent.skill).toBe("/cogit:record");
    expect(agent.skillRule).toBe("Skill(cogit:record)");
    expect(agent.sessionIdEnv).toBe("CLAUDE_SESSION_ID");
    expect(agent.commitSessionEnv).toBe("CLAUDE_CODE_SESSION_ID");
  });

  it("parses a Claude Code hook payload and refuses anything else", () => {
    const agent = defaultAgent();
    expect(
      agent.parseHookInput(JSON.stringify({ session_id: "s1", cwd: "/p", source: "startup" })),
    ).toEqual({ session_id: "s1", cwd: "/p", source: "startup" });
    expect(agent.parseHookInput("not json")).toBeUndefined();
    expect(agent.parseHookInput(JSON.stringify({ cwd: "/p" }))).toBeUndefined();
  });

  it("builds additional context in the agent's own hook shape", () => {
    expect(defaultAgent().additionalContext("Stop", "hi")).toEqual({
      hookSpecificOutput: { hookEventName: "Stop", additionalContext: "hi" },
    });
  });

  it("reads its state directory from its own env var", () => {
    expect(defaultAgent().configDir({ CLAUDE_CONFIG_DIR: "/tmp/claude" })).toBe("/tmp/claude");
  });

  it("knows a Claude Code process by its arguments", () => {
    expect(isClaudeProcess(["claude", "-p", "hi"])).toBe(true);
    expect(isClaudeProcess(["/home/u/.local/share/claude/versions/2.1.300", "-p"])).toBe(true);
    expect(isClaudeProcess(["C:\\Users\\u\\.local\\bin\\claude.exe"])).toBe(true);
    expect(
      isClaudeProcess(["node", "/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js"]),
    ).toBe(true);
    expect(isClaudeProcess(["node", "/plugin/dist/cli.js", "hook", "stop"])).toBe(false);
    expect(isClaudeProcess(["bash", "ralph_loop.sh"])).toBe(false);
    expect(isClaudeProcess([])).toBe(false);
  });

  it("tells a session another session started from one a script started", () => {
    // pid -> [ppid, args]; walking up from the hook's parent, pid 10.
    const tree = (rows: Record<number, [number, string[]]>) => (pid: number) => {
      const row = rows[pid];
      return row === undefined ? undefined : ({ ppid: row[0], args: row[1] } satisfies ProcessInfo);
    };
    const own: [number, string[]] = [20, ["claude", "-p"]];
    // Ralph: hook shell, the session, the loop script, systemd.
    const script = tree({ 10: [11, ["sh"]], 11: own, 20: [1, ["bash", "ralph_loop.sh"]] });
    expect(sessionLineage(script, 10)).toEqual({ own: 11, parent: null });
    // Another plugin's hook: the session, the hook's node, the person's Claude Code.
    const hook = tree({ 10: own, 20: [30, ["node", "recall.mjs"]], 30: [1, ["claude"]] });
    expect(sessionLineage(hook, 10)).toEqual({ own: 10, parent: 30 });
    // A sandbox hides what is above its own PID 1: the top, no second Claude.
    const sandboxed = tree({ 10: own, 20: [99, ["bwrap"]] });
    expect(sessionLineage(sandboxed, 10)).toEqual({ own: 10, parent: null });
    // No process tree (Windows), or no Claude Code in it: no answer.
    expect(sessionLineage(() => undefined, 10)).toBeUndefined();
    expect(sessionLineage(tree({ 10: [1, ["sh"]] }), 10)).toBeUndefined();
    expect(sessionLineage(tree({ 10: [11, ["sh"]] }), 10)).toBeUndefined();
  });

  it("reads the real process tree without throwing", { timeout: 30_000 }, () => {
    // What it says depends on who runs the tests; on Windows there is no tree to read.
    const began = Date.now();
    const answer = defaultAgent().sessionLineage();
    // The CI log shows what the read costs on each system.
    console.info(
      `process tree on ${process.platform}: ${JSON.stringify(answer)} in ${Date.now() - began} ms`,
    );
    expect(answer === undefined || typeof answer.own === "number").toBe(true);
  });
});

/**
 * Each session is read by the agent it ran on (Story 16.1): its record names
 * it, and its transcript sits in that agent's own directory.
 */
describe("agent per session", () => {
  const CODEX_ID = "01a1ccda-328f-79b2-8b47-8e0b8167fae8";
  async function claudeHome(): Promise<NodeJS.ProcessEnv> {
    const dir = await tempDir();
    const env = { CLAUDE_CONFIG_DIR: join(dir, "claude"), CODEX_HOME: join(dir, "codex") };
    await mkdir(join(dir, "claude", "projects", "proj"), { recursive: true });
    await writeFile(join(dir, "claude", "projects", "proj", "s1.jsonl"), "{}\n");
    const day = join(dir, "codex", "sessions", "2026", "11", "12");
    await mkdir(day, { recursive: true });
    await writeFile(join(day, `rollout-2026-11-12T10-00-00-${CODEX_ID}.jsonl`), "{}\n");
    return env;
  }

  it("takes the agent a record names, and the default for none or an unknown name", () => {
    expect(agentNamed("claude-code")).toBe(AGENTS["claude-code"]);
    expect(agentNamed("codex")).toBe(AGENTS.codex);
    expect(agentNamed(undefined)).toBe(defaultAgent());
    expect(agentNamed("no-such-agent")).toBe(defaultAgent());
  });

  it("finds a session's transcript with the agent that wrote it", async () => {
    const env = await claudeHome();
    const found = await findSession("s1", env);
    expect(found?.agent).toBe(AGENTS["claude-code"]);
    expect(found?.file).toBe(join(env.CLAUDE_CONFIG_DIR ?? "", "projects", "proj", "s1.jsonl"));
    expect(await findSession("s2", env)).toBeNull();
    expect((await findSession(CODEX_ID, env))?.agent).toBe(AGENTS.codex);
    expect([...(await collectAllTranscripts(env)).keys()]).toEqual(["s1", CODEX_ID]);
  });

  it("names the agent whose directory holds a transcript", async () => {
    const env = await claudeHome();
    const file = join(env.CLAUDE_CONFIG_DIR ?? "", "projects", "proj", "s1.jsonl");
    expect(agentOfTranscript(file, env)).toBe(AGENTS["claude-code"]);
    expect(agentOfTranscript(join(env.CODEX_HOME ?? "", "sessions", "x.jsonl"), env)).toBe(
      AGENTS.codex,
    );
    expect(agentOfTranscript("/elsewhere/s1.jsonl", env)).toBe(defaultAgent());
  });

  it("leaves a hook alone when the plugin names an agent cogit does not know", async () => {
    const debug: string[] = [];
    const out = await runHook(
      "stop",
      JSON.stringify({ session_id: "s1", cwd: "/p" }),
      {},
      T0,
      (line) => debug.push(line),
      { agent: "no-such-agent" },
    );
    expect(out).toBeUndefined();
    expect(debug).toEqual(["cogit stop hook: unknown agent no-such-agent"]);
  });
});
