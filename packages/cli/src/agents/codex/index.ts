import { join } from "node:path";
import { MARKETPLACE_REPO } from "../claude/settings.js";
import { agentPresent } from "../presence.js";
import type { AgentAdapter } from "../types.js";
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
  readHookTrust,
  readPluginEnabled,
  readPluginInstalled,
  readPluginVersion,
} from "./settings.js";
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
  unreadableTranscripts,
} from "./transcripts.js";

/** What Codex cannot do through cogit yet; each one names the story that brings it. */
function notYet(what: string): () => Promise<never> {
  return () => Promise.reject(new Error(`cogit cannot ${what} for Codex yet`));
}

const unknown = async (): Promise<undefined> => undefined;

/**
 * Codex CLI: rollouts under `~/.codex/sessions`, hooks with Claude Code's
 * payload fields, the plugin skill `$cogit:record`, and `codex exec` for
 * cogit's own runs. Setup is read from Codex's `config.toml` and plugin cache;
 * cogit never writes Codex's settings, so changes refuse.
 */
export const codex: AgentAdapter = {
  name: "codex",
  displayName: "Codex",
  skill: "$cogit:record",
  skillRule: "$cogit:record",
  /**
   * Codex skips Claude's `github` marketplace source and reads `.agents/plugins/marketplace.json`
   * first, which points at the same plugin branch. The hooks then wait for trust in `/hooks`.
   */
  installCommand: `codex plugin marketplace add ${MARKETPLACE_REPO} && codex plugin add cogit@cogit`,
  /** Refreshes the marketplace's copy of the repository, then installs the plugin again from it. */
  updateCommand: "codex plugin marketplace upgrade cogit && codex plugin add cogit@cogit",
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

  /** Codex deletes no rollout on its own; it only compresses cold ones. */
  readRetention: async () => Number.POSITIVE_INFINITY,
  readPluginInstalled,
  readPluginVersion,
  readPluginEnabled,
  /** Codex asks nothing before a skill: the model reads its file like any other. */
  readSkillAllowed: async () => true,
  isPresent: (env) => agentPresent(codexHome(env), "codex", env),
  readHookTrust,
  settingsFile: (env) => join(codexHome(env), "config.toml"),
  unreadableTranscripts: (env) => unreadableTranscripts(env),
  setRetention: notYet("set transcript retention"),
  allowSkill: notYet("allow the record skill"),
  readProjectSetup: unknown,
  writeProjectSetup: notYet("write project settings"),
  refreshProjectSetup: unknown,
  markLive: async () => {},
  run,
};
