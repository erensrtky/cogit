import { relative, resolve, sep } from "node:path";
import { claude } from "./claude/index.js";
import { codex } from "./codex/index.js";
import type { AgentAdapter } from "./types.js";

/**
 * The agents cogit can record. Each session is read, closed and summarized by
 * the agent it ran on: its record names it, and its transcript lives in that
 * agent's own directory. Callers never import an implementation directly.
 */
export const AGENTS: Readonly<Record<string, AgentAdapter>> = {
  "claude-code": claude,
  codex,
};

/** The agent for setup and wording when no session is in question. */
export function defaultAgent(): AgentAdapter {
  return claude;
}

/** The agent a session record names; the default for a missing or unknown name. */
export function agentNamed(name: string | undefined): AgentAdapter {
  return (name !== undefined ? AGENTS[name] : undefined) ?? claude;
}

/** Whether `file` lies inside `dir`. */
function inside(dir: string, file: string): boolean {
  const rel = relative(resolve(dir), resolve(file));
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && !rel.startsWith(sep);
}

/** The agent whose own directory holds this transcript; the default when none does. */
export function agentOfTranscript(file: string, env: NodeJS.ProcessEnv): AgentAdapter {
  return Object.values(AGENTS).find((agent) => inside(agent.configDir(env), file)) ?? claude;
}

/** A session's transcript and the agent that wrote it; null when no agent has it. */
export async function findSession(
  sessionId: string,
  env: NodeJS.ProcessEnv,
): Promise<{ agent: AgentAdapter; file: string } | null> {
  for (const agent of Object.values(AGENTS)) {
    const file = await agent.findTranscript(sessionId, env);
    if (file !== null) return { agent, file };
  }
  return null;
}

/** Every transcript on this machine, from every agent, by session id. */
export async function collectAllTranscripts(env: NodeJS.ProcessEnv): Promise<Map<string, string>> {
  const all = new Map<string, string>();
  for (const agent of Object.values(AGENTS))
    for (const [id, file] of await agent.collectTranscripts(env))
      if (!all.has(id)) all.set(id, file);
  return all;
}

export type {
  AgentAdapter,
  ChatTurn,
  FileChange,
  HookInput,
  LastTurn,
  RunSpend,
  ToolUse,
  UserMessage,
} from "./types.js";
export { DEFAULT_AGENT } from "./types.js";
