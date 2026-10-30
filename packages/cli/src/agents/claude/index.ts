import { type AgentAdapter, DEFAULT_AGENT } from "../types.js";
import { additionalContext, isHeadless, parseHookInput, userNotice } from "./hooks.js";
import {
  allowSkill,
  CLAUDE_DEFAULT_RETENTION,
  INSTALL_COMMAND,
  markLive,
  readPluginInstalled,
  readProjectSetup,
  readRetention,
  readSkillAllowed,
  refreshProjectSetup,
  SKILL_RULE,
  setRetention,
  writeProjectSetup,
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
  readForkOrigin,
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
  installCommand: INSTALL_COMMAND,
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
  readForkOrigin,
  readsHandoff,
  readLastTurn,
  countUserLines,
  displayTurn,
  excerpt,

  parseHookInput,
  isHeadless,
  additionalContext,
  userNotice,

  readRetention,
  readPluginInstalled,
  readSkillAllowed,
  setRetention,
  allowSkill,
  readProjectSetup,
  writeProjectSetup,
  refreshProjectSetup,
  markLive,
};
