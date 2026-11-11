import type { AgentAdapter } from "../types.js";
import {
  additionalContext,
  isHeadless,
  markChildren,
  parseHookInput,
  sessionLineage,
  userNotice,
} from "./hooks.js";
import {
  codexHome,
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

/** What Codex cannot do through cogit yet; each one names the story that brings it. */
function notYet(what: string): () => Promise<never> {
  return () => Promise.reject(new Error(`cogit cannot ${what} for Codex yet`));
}

const unknown = async (): Promise<undefined> => undefined;

/**
 * Codex CLI: rollouts under `~/.codex/sessions`, hooks with Claude Code's
 * payload fields, and the plugin skill `$cogit:record`. Settings, setup and the
 * headless recorder run are not here yet: reads answer "unknown" and changes
 * refuse.
 */
export const codex: AgentAdapter = {
  name: "codex",
  skill: "$cogit:record",
  skillRule: "$cogit:record",
  /** Story 16.5 checks the real command; until then, where it will be written down. */
  installCommand: "see the cogit README, section Codex",
  /** Codex names no project directory for hooks; the payload's cwd is used. */
  projectDirEnv: "CODEX_PROJECT_DIR",
  pluginRootEnv: "PLUGIN_ROOT",
  sessionIdEnv: "CODEX_THREAD_ID",
  commitSessionEnv: "CODEX_THREAD_ID",
  /** Codex keeps rollouts until the user deletes them. */
  defaultRetention: Number.POSITIVE_INFINITY,

  configDir: codexHome,
  findTranscript,
  collectTranscripts: (env) => collectTranscripts(env),
  collectTranscriptIds,
  readConversation,
  readForkOrigin,
  readSessionCwd,
  readSessionModel,
  readsHandoff,
  readLastTurn,
  countUserLines,
  displayTurn,
  excerpt: (text, max) => excerpt(text, max),

  parseHookInput,
  isHeadless: (_env, input) => isHeadless(input),
  isHeadlessTranscript,
  sessionLineage: () => sessionLineage(),
  markChildren,
  additionalContext,
  userNotice,

  readRetention: unknown,
  readPluginInstalled: unknown,
  readPluginVersion: unknown,
  readPluginEnabled: unknown,
  readSkillAllowed: unknown,
  setRetention: notYet("set transcript retention"),
  allowSkill: notYet("allow the record skill"),
  readProjectSetup: unknown,
  writeProjectSetup: notYet("write project settings"),
  refreshProjectSetup: unknown,
  markLive: async () => {},
  run: notYet("run the recorder"),
};
