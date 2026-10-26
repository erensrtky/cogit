import { describe, expect, it } from "vitest";
import { AGENTS, defaultAgent } from "../src/agents/index.js";

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
});
