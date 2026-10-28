import { constants, copyFile, mkdir, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWriteJson, readJson } from "../../store/fs.js";
import type { FileChange } from "../types.js";

/**
 * The parts of Claude Code's own settings cogit touches: transcript retention
 * and the permission that lets the agent run the record skill without asking.
 */

/** Claude Code's own default, see the cleanupPeriodDays docs. */
export const CLAUDE_DEFAULT_RETENTION = 30;

export function claudeSettingsPath(env: NodeJS.ProcessEnv): string {
  return join(env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "settings.json");
}

async function readSettings(file: string): Promise<Record<string, unknown> | undefined> {
  const read = await readJson(file);
  if (!read.found) return {};
  if ("error" in read) return undefined;
  const v = read.value;
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

/** Current transcript retention in days; undefined if the settings file is unreadable. */
export async function readRetention(env: NodeJS.ProcessEnv): Promise<number | undefined> {
  const settings = await readSettings(claudeSettingsPath(env));
  if (!settings) return undefined;
  const days = settings.cleanupPeriodDays;
  return typeof days === "number" ? days : CLAUDE_DEFAULT_RETENTION;
}

/** Lets the agent run the record skill without a permission prompt each time. */
export const SKILL_RULE = "Skill(cogit:record)";

function allowList(settings: Record<string, unknown>): unknown[] | undefined {
  const permissions = settings.permissions ?? {};
  if (typeof permissions !== "object" || permissions === null || Array.isArray(permissions))
    return undefined;
  const allow = (permissions as Record<string, unknown>).allow ?? [];
  return Array.isArray(allow) ? allow : undefined;
}

/** Whether the skill rule is already allowed; undefined if the settings are unreadable. */
export async function readSkillAllowed(env: NodeJS.ProcessEnv): Promise<boolean | undefined> {
  const settings = await readSettings(claudeSettingsPath(env));
  const allow = settings && allowList(settings);
  return allow ? allow.includes(SKILL_RULE) : undefined;
}

/**
 * Rewrites the user's Claude Code settings, keeping every other key. Backs up an
 * existing file first (the first backup of a run wins, so it holds the original);
 * refuses to touch a file it cannot parse.
 */
async function updateSettings(
  env: NodeJS.ProcessEnv,
  stamp: string,
  fn: (settings: Record<string, unknown>, file: string) => Record<string, unknown>,
): Promise<FileChange> {
  const file = claudeSettingsPath(env);
  const settings = await readSettings(file);
  if (!settings) throw new Error(`${file} is not a valid JSON object; not changing it`);
  const next = fn(settings, file);
  let backup: string | undefined;
  if (Object.keys(settings).length > 0) {
    backup = `${file}.cogit-bak-${stamp.replace(/[:.]/g, "-")}`;
    await copyFile(file, backup, constants.COPYFILE_EXCL).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "EEXIST") throw err;
    });
  }
  await atomicWriteJson(file, next);
  return backup ? { file, backup } : { file };
}

/** Sets `cleanupPeriodDays` in the user's Claude Code settings. */
export async function setRetention(
  days: number,
  env: NodeJS.ProcessEnv,
  stamp: string,
): Promise<FileChange> {
  if (!Number.isInteger(days) || days < 1)
    throw new Error("retention must be a whole number of days, at least 1");
  return updateSettings(env, stamp, (s) => ({ ...s, cleanupPeriodDays: days }));
}

/** Adds {@link SKILL_RULE} to `permissions.allow` in the user's Claude Code settings. */
export async function allowSkill(env: NodeJS.ProcessEnv, stamp: string): Promise<FileChange> {
  return updateSettings(env, stamp, (s, file) => {
    const allow = allowList(s);
    if (!allow) throw new Error(`${file} has an unexpected permissions.allow; not changing it`);
    if (allow.includes(SKILL_RULE)) return s;
    const permissions = (s.permissions ?? {}) as Record<string, unknown>;
    return { ...s, permissions: { ...permissions, allow: [...allow, SKILL_RULE] } };
  });
}

/**
 * Team setup in the project's shared `.claude/settings.json`: the plugin is
 * enabled for everyone who opens the repository, and a guard hook that does not
 * need the plugin stops the first message of an attended session that started
 * without it. The plugin's SessionStart hook leaves {@link liveMarker}; the
 * guard blocks once per session when it is missing, so a second send goes
 * through. Headless runs (`claude -p`, loops) are never blocked.
 */
export const PLUGIN_ID = "cogit@cogit";
export const MARKETPLACE = "cogit";
export const MARKETPLACE_REPO = "erensrtky/cogit";
export const INSTALL_COMMAND = `claude plugin install cogit --marketplace ${MARKETPLACE_REPO}`;

/**
 * Whether Claude Code lists the plugin as installed, in any scope; undefined when its
 * plugin list cannot be read (missing or another shape), so the caller says nothing either way.
 */
export async function readPluginInstalled(env: NodeJS.ProcessEnv): Promise<boolean | undefined> {
  const base = env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
  const read = await readJson(join(base, "plugins", "installed_plugins.json"));
  if (!read.found || "error" in read) return undefined;
  const plugins = isObject(read.value) ? read.value.plugins : undefined;
  if (!isObject(plugins)) return undefined;
  const entries = plugins[PLUGIN_ID];
  return Array.isArray(entries) && entries.length > 0;
}

/** Where a session's SessionStart leaves its mark; the guard reads the same path. */
export function liveDir(): string {
  return join(tmpdir(), "cogit-live");
}

/** Marks a session as started with the plugin loaded. */
export async function markLive(sessionId: string): Promise<void> {
  if (!/^[\w-]+$/.test(sessionId)) return;
  await mkdir(liveDir(), { recursive: true });
  await writeFile(join(liveDir(), sessionId), "");
}

export const GUARD_REASON =
  "cogit: this session started without the cogit plugin, so nothing in it is recorded. " +
  `Install it once with \`${INSTALL_COMMAND}\` (or start claude with --plugin-dir), ` +
  "then open a new session. Send the message again to continue without recording.";

/**
 * The guard as one `node -e` command: no cogit install needed, no single quotes
 * inside, so `sh` passes it through unchanged. Keep in step with {@link markLive}.
 */
export const GUARD_COMMAND =
  "node -e '" +
  [
    'const fs=require("fs"),os=require("os"),path=require("path");',
    'if(process.env.CLAUDE_CODE_SESSION_ATTENDED!=="1"||process.env.COGIT_DISABLE)process.exit(0);',
    'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{',
    "const id=JSON.parse(s).session_id;if(!/^[\\w-]+$/.test(id))return;",
    'const dir=path.join(os.tmpdir(),"cogit-live");if(fs.existsSync(path.join(dir,id)))return;',
    'const warned=path.join(dir,id+".warned");if(fs.existsSync(warned))return;',
    'fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(warned,"");',
    `process.stdout.write(JSON.stringify({decision:"block",reason:${JSON.stringify(GUARD_REASON)}}))`,
    "}catch{}});",
  ].join("") +
  "' # cogit:guard";

const GUARD_TAG = "# cogit:guard";

export function projectSettingsPath(root: string): string {
  return join(root, ".claude", "settings.json");
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hasGuard(settings: Record<string, unknown>): boolean {
  const hooks = isObject(settings.hooks) ? settings.hooks.UserPromptSubmit : undefined;
  return JSON.stringify(hooks ?? []).includes(GUARD_TAG);
}

/** Whether the guard there is this version's: an older one may name a moved install command. */
function hasCurrentGuard(settings: Record<string, unknown>): boolean {
  const hooks = isObject(settings.hooks) ? settings.hooks.UserPromptSubmit : undefined;
  return JSON.stringify(hooks ?? []).includes(JSON.stringify(GUARD_COMMAND));
}

/** The UserPromptSubmit entries without ours, and the current guard appended. */
function withCurrentGuard(submit: unknown[]): unknown[] {
  return [
    ...submit.filter((entry) => !JSON.stringify(entry).includes(GUARD_TAG)),
    { hooks: [{ type: "command", command: GUARD_COMMAND, timeout: 5 }] },
  ];
}

/** Whether the project's shared settings already carry the current team setup; undefined if unreadable. */
export async function readProjectSetup(root: string): Promise<boolean | undefined> {
  const settings = await readSettings(projectSettingsPath(root));
  if (!settings) return undefined;
  const plugins = isObject(settings.enabledPlugins) ? settings.enabledPlugins : {};
  return plugins[PLUGIN_ID] === true && hasCurrentGuard(settings);
}

/**
 * Brings what an earlier `init` wrote up to date: an outdated guard is replaced
 * and our marketplace entry points at the current repository. Nothing is added
 * that the project did not have, and other keys and hooks stay as they are.
 * Returns the file when it changed.
 */
export async function refreshProjectSetup(root: string): Promise<string | undefined> {
  const file = projectSettingsPath(root);
  const settings = await readSettings(file);
  if (!settings || !isObject(settings.hooks)) return undefined;
  const submit = settings.hooks.UserPromptSubmit;
  const marketplaces = isObject(settings.extraKnownMarketplaces)
    ? settings.extraKnownMarketplaces
    : undefined;
  const ours = marketplaces?.[MARKETPLACE];
  const staleGuard = Array.isArray(submit) && hasGuard(settings) && !hasCurrentGuard(settings);
  const staleMarketplace =
    isObject(ours) &&
    isObject(ours.source) &&
    ours.source.source === "github" &&
    ours.source.repo !== MARKETPLACE_REPO;
  if (!staleGuard && !staleMarketplace) return undefined;
  const next: Record<string, unknown> = { ...settings };
  if (staleGuard)
    next.hooks = { ...settings.hooks, UserPromptSubmit: withCurrentGuard(submit as unknown[]) };
  if (staleMarketplace)
    next.extraKnownMarketplaces = {
      ...marketplaces,
      [MARKETPLACE]: { source: { source: "github", repo: MARKETPLACE_REPO } },
    };
  await atomicWriteJson(file, next);
  return file;
}

/**
 * Writes the team setup into the project's `.claude/settings.json`, keeping every
 * other key and hook. The file is meant to be committed, so no backup is left
 * beside it; an unparseable file is never touched.
 */
export async function writeProjectSetup(root: string): Promise<FileChange> {
  const file = projectSettingsPath(root);
  const settings = await readSettings(file);
  if (!settings) throw new Error(`${file} is not a valid JSON object; not changing it`);
  for (const key of ["enabledPlugins", "extraKnownMarketplaces", "hooks"])
    if (settings[key] !== undefined && !isObject(settings[key]))
      throw new Error(`${file} has an unexpected ${key}; not changing it`);
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const submit = hooks.UserPromptSubmit ?? [];
  if (!Array.isArray(submit))
    throw new Error(`${file} has an unexpected hooks.UserPromptSubmit; not changing it`);
  const next: Record<string, unknown> = {
    ...settings,
    enabledPlugins: { ...(settings.enabledPlugins as object), [PLUGIN_ID]: true },
    extraKnownMarketplaces: {
      ...(settings.extraKnownMarketplaces as object),
      [MARKETPLACE]: { source: { source: "github", repo: MARKETPLACE_REPO } },
    },
    hooks: hasCurrentGuard(settings)
      ? hooks
      : { ...hooks, UserPromptSubmit: withCurrentGuard(submit) },
  };
  await mkdir(join(root, ".claude"), { recursive: true });
  await atomicWriteJson(file, next);
  return { file };
}
