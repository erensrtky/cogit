import { agentPresent } from "../presence.js";
import { type AgentAdapter, DEFAULT_AGENT } from "../types.js";
import {
  additionalContext,
  isHeadless,
  markChildren,
  parseHookInput,
  sessionLineage,
  userNotice,
} from "./hooks.js";
import { run } from "./run.js";
import {
  allowSkill,
  CLAUDE_DEFAULT_RETENTION,
  claudeSettingsPath,
  INSTALL_COMMAND,
  markLive,
  readPluginEnabled,
  readPluginInstalled,
  readPluginVersion,
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
  isHeadlessTranscript,
  readConversation,
  readForkOrigin,
  readLastTurn,
  readSessionCwd,
  readSessionModel,
  readsHandoff,
} from "./transcripts.js";

/**
 * Claude Code: transcripts under `~/.claude/projects`, hooks whose payload
 * arrives on stdin, and the `cogit:record` plugin skill.
 */
export const claude: AgentAdapter = {
  name: DEFAULT_AGENT,
  displayName: "Claude Code",
  skill: "/cogit:record",
  skillRule: SKILL_RULE,
  installCommand: INSTALL_COMMAND,
  updateCommand: "claude plugin update cogit@cogit",
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
  readSessionCwd,
  readSessionModel,
  readsHandoff,
  readLastTurn,
  countUserLines,
  displayTurn,
  excerpt,

  parseHookInput,
  isHeadless: async (env) => isHeadless(env),
  isHeadlessTranscript,
  sessionLineage: () => sessionLineage(),
  markChildren,
  additionalContext,
  userNotice,

  readRetention,
  readPluginInstalled,
  readPluginVersion,
  readPluginEnabled,
  readSkillAllowed,
  isPresent: (env) => agentPresent(claudeConfigDir(env), "claude", env),
  /** Claude Code runs an enabled plugin's hooks without asking. */
  readHookTrust: async () => "trusted",
  settingsFile: claudeSettingsPath,
  unreadableTranscripts: async () => [],
  setRetention,
  allowSkill,
  readProjectSetup,
  writeProjectSetup,
  refreshProjectSetup,
  markLive,
  run,
};
