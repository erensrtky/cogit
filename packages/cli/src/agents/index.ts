import { claude } from "./claude/index.js";
import type { AgentAdapter } from "./types.js";

/**
 * The agents cogit can record. With one entry the default is always Claude Code;
 * choosing per project comes with the second adapter. Callers ask for the
 * default and never import an implementation directly.
 */
export const AGENTS: Readonly<Record<string, AgentAdapter>> = {
  "claude-code": claude,
};

export function defaultAgent(): AgentAdapter {
  return claude;
}

export type {
  AgentAdapter,
  ChatTurn,
  FileChange,
  HookInput,
  ToolUse,
  UserMessage,
} from "./types.js";
export { DEFAULT_AGENT } from "./types.js";
