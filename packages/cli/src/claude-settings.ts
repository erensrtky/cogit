import { copyFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { atomicWriteJson, readJson } from "./store/fs.js";

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

/**
 * Sets `cleanupPeriodDays` in the user's Claude Code settings, keeping every other
 * key. Backs up an existing file first; refuses to touch a file it cannot parse.
 */
export async function setRetention(
  days: number,
  env: NodeJS.ProcessEnv,
  stamp: string,
): Promise<{ file: string; backup?: string }> {
  if (!Number.isInteger(days) || days < 1)
    throw new Error("retention must be a whole number of days, at least 1");
  const file = claudeSettingsPath(env);
  const settings = await readSettings(file);
  if (!settings) throw new Error(`${file} is not a valid JSON object; not changing it`);
  let backup: string | undefined;
  if (Object.keys(settings).length > 0) {
    backup = `${file}.codelineage-bak-${stamp.replace(/[:.]/g, "-")}`;
    await copyFile(file, backup);
  }
  await atomicWriteJson(file, { ...settings, cleanupPeriodDays: days });
  return backup ? { file, backup } : { file };
}
