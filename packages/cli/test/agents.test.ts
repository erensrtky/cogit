import { describe, expect, it } from "vitest";
import {
  isClaudeProcess,
  platformReader,
  startedInsideSession,
} from "../src/agents/claude/hooks.js";
import { AGENTS, defaultAgent } from "../src/agents/index.js";
import {
  type ProcessInfo,
  parseWindowsProcesses,
  readWindowsProcesses,
  WINDOWS_READ_TIMEOUT_MS,
  windowsCommandLine,
} from "../src/push-command.js";

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
    expect(startedInsideSession(script, 10)).toBe(false);
    // Another plugin's hook: the session, the hook's node, the person's Claude Code.
    const hook = tree({ 10: own, 20: [30, ["node", "recall.mjs"]], 30: [1, ["claude"]] });
    expect(startedInsideSession(hook, 10)).toBe(true);
    // A sandbox hides what is above its own PID 1: the top, no second Claude.
    const sandboxed = tree({ 10: own, 20: [99, ["bwrap"]] });
    expect(startedInsideSession(sandboxed, 10)).toBe(false);
    // No process tree (Windows), or no Claude Code in it: no answer.
    expect(startedInsideSession(() => undefined, 10)).toBeUndefined();
    expect(startedInsideSession(tree({ 10: [1, ["sh"]] }), 10)).toBeUndefined();
    expect(startedInsideSession(tree({ 10: [11, ["sh"]] }), 10)).toBeUndefined();
    // Windows reuses a dead parent's pid: a "parent" younger than its child is the top.
    const reused = (pid: number) =>
      ({
        10: { ppid: 11, args: ["bash.exe"], started: 500 },
        11: { ppid: 20, args: ["claude.exe", "-p"], started: 400 },
        20: { ppid: 30, args: ["claude.exe"], started: 900 },
      })[pid];
    expect(startedInsideSession(reused, 10)).toBe(false);
  });

  it("reads Windows' process table from PowerShell's JSON", () => {
    expect(
      windowsCommandLine('"C:\\Program Files\\nodejs\\node.exe" C:\\npm\\cli.js -p "a b"'),
    ).toEqual(["C:\\Program Files\\nodejs\\node.exe", "C:\\npm\\cli.js", "-p", "a b"]);
    const table = parseWindowsProcesses(
      JSON.stringify([
        { p: 10, pp: 11, n: "bash.exe", c: "bash.exe -c hook", t: 500 },
        { p: 11, pp: 4, n: "claude.exe", c: null, t: 400 },
        { p: 12, pp: 4, n: "System", c: "", t: 0 },
        { p: "x", pp: 1 },
        null,
      ]),
    );
    expect(table?.get(10)).toEqual({ ppid: 11, args: ["bash.exe", "-c", "hook"], started: 500 });
    // A hidden command line falls back to the image name.
    expect(table?.get(11)).toEqual({ ppid: 4, args: ["claude.exe"], started: 400 });
    expect(table?.get(12)).toEqual({ ppid: 4, args: ["System"] });
    expect(table?.size).toBe(3);
    // One process prints as an object, not an array; bad output is no table.
    expect(
      parseWindowsProcesses(JSON.stringify({ p: 1, pp: 0, n: "x", c: null, t: 1 }))?.size,
    ).toBe(1);
    expect(parseWindowsProcesses("not json")).toBeUndefined();
  });

  it("asks PowerShell once per walk on Windows, for the chain above the hook", () => {
    const calls: { args: string[]; timeout: unknown }[] = [];
    const answer = (status: number, stdout: string) =>
      ((_command: string, args: string[], options: { timeout?: number }) => {
        calls.push({ args, timeout: options.timeout });
        return { status, stdout };
      }) as unknown as Parameters<typeof readWindowsProcesses>[1];
    const json = JSON.stringify([{ p: 10, pp: 1, n: "claude.exe", c: null, t: 5 }]);
    expect(readWindowsProcesses(10, answer(0, json))?.get(10)?.args).toEqual(["claude.exe"]);
    // One process at a time, from the hook up, with a short limit.
    expect(calls[0]?.args.at(-1)).toMatch(/^\$p = 10; .*-Filter "ProcessId=\$p"/);
    expect(calls[0]?.timeout).toBe(WINDOWS_READ_TIMEOUT_MS);
    expect(readWindowsProcesses(10, answer(1, ""))).toBeUndefined();

    const starts: number[] = [];
    const read = platformReader("win32", (start) => {
      starts.push(start);
      return parseWindowsProcesses(json);
    });
    expect(read(10)?.ppid).toBe(1);
    expect(read(99)).toBeUndefined();
    expect(starts).toEqual([10]);
    expect(platformReader("win32", () => undefined)(10)).toBeUndefined();
    // Elsewhere one process is read at a time; an unknown platform reads nothing.
    expect(platformReader("aix")(process.pid)).toBeUndefined();
  });

  it("reads the real process tree without throwing", { timeout: 30_000 }, () => {
    // What it says depends on who runs the tests; Windows goes through PowerShell.
    const began = Date.now();
    const answer = defaultAgent().startedInsideSession();
    // The CI log shows what the read costs on each system.
    console.info(`process tree on ${process.platform}: ${answer} in ${Date.now() - began} ms`);
    expect([true, false, undefined]).toContain(answer);
  });
});
