import { constants, copyFile } from "node:fs/promises";
import { homedir } from "node:os";
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
