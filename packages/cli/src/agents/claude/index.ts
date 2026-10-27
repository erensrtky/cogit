import { type AgentAdapter, DEFAULT_AGENT } from "../types.js";
import { additionalContext, parseHookInput } from "./hooks.js";
import {
  allowSkill,
  CLAUDE_DEFAULT_RETENTION,
  readRetention,
  readSkillAllowed,
  SKILL_RULE,
  setRetention,
} from "./settings.js";
import {
  claudeConfigDir,
  collectTranscriptIds,
  collectTranscripts,
  countUserLines,
  displayTurn,
  excerpt,
  findTranscript,
  readConversation,
  readLastTurn,
  readsHandoff,
} from "./transcripts.js";

/**
 * Claude Code: transcripts under `~/.claude/projects`, hooks whose payload
 * arrives on stdin, and the `cogit:record` plugin skill. The only adapter today;
 * adding another agent means adding a sibling folder, not touching callers.
 */
export const claude: AgentAdapter = {
  name: DEFAULT_AGENT,
  skill: "/cogit:record",
  skillRule: SKILL_RULE,
  projectDirEnv: "CLAUDE_PROJECT_DIR",
  pluginRootEnv: "CLAUDE_PLUGIN_ROOT",
  sessionIdEnv: "CLAUDE_SESSION_ID",
  commitSessionEnv: "CLAUDE_CODE_SESSION_ID",
  defaultRetention: CLAUDE_DEFAULT_RETENTION,

  configDir: claudeConfigDir,
  findTranscript,
  collectTranscripts,
  collectTranscriptIds,
  readConversation,
  readsHandoff,
  readLastTurn,
  countUserLines,
  displayTurn,
  excerpt,

  parseHookInput,
  additionalContext,

  readRetention,
  readSkillAllowed,
  setRetention,
  allowSkill,
};
