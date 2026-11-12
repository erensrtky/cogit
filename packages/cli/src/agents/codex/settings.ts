import { createHash, type Hash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { parse } from "smol-toml";
import { compareVersions } from "../../cli-version.js";
import type { HookTrust } from "../types.js";
import { codexHome } from "./transcripts.js";

/**
 * What cogit reads of Codex's setup: `config.toml` (TOML, parsed, never written)
 * and the plugin as Codex installed it. Codex writes the user's choices there:
 * the marketplace, `[plugins."cogit@cogit"]`, and one `[hooks.state."…"]` table
 * per hook the user trusted in `/hooks`.
 */

/** The plugin as Codex names it: `<plugin>@<marketplace>`. */
export const PLUGIN_ID = "cogit@cogit";
/**
 * The one folder of the repository Codex needs to read the marketplace. With it
 * (`--sparse`) Codex fetches about 1 MB instead of the whole repository, which
 * `codex plugin marketplace upgrade` gives up on after 30 s on a slow connection.
 */
export const MARKETPLACE_SPARSE = ".agents";
/** The plugin's hooks file, as `.codex-plugin/plugin.json` names it. */
const HOOKS_FILE = "hooks/codex.json";
/** The events in that file, as Codex keys their trust (`session_start`, …). */
export const HOOK_EVENTS = ["session_start", "user_prompt_submit", "stop", "session_end"];

type Table = Record<string, unknown>;

function isTable(value: unknown): value is Table {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A `config.toml` as a table: an empty one when the file is missing, undefined
 * when it cannot be read or parsed.
 */
export async function readConfigFile(file: string): Promise<Table | undefined> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ENOENT" ? {} : undefined;
  }
  try {
    return parse(text) as Table;
  } catch {
    return undefined;
  }
}

/** The user's Codex config (`$CODEX_HOME/config.toml`). */
export function readConfig(env: NodeJS.ProcessEnv): Promise<Table | undefined> {
  return readConfigFile(join(codexHome(env), "config.toml"));
}

/** The installed plugin: its folder and version, the newest when more than one is left. */
export async function installedPlugin(
  env: NodeJS.ProcessEnv,
): Promise<{ root: string; version: string } | undefined> {
  const base = join(codexHome(env), "plugins", "cache", "cogit", "cogit");
  const found: { root: string; version: string }[] = [];
  for (const name of await readdir(base).catch(() => [] as string[])) {
    const root = join(base, name);
    const manifest = await readConfigJson(join(root, ".codex-plugin", "plugin.json"));
    if (manifest === undefined) continue;
    found.push({ root, version: typeof manifest.version === "string" ? manifest.version : name });
  }
  found.sort((a, b) => compareVersions(b.version, a.version));
  return found[0];
}

async function readConfigJson(file: string): Promise<Table | undefined> {
  try {
    const json: unknown = JSON.parse(await readFile(file, "utf8"));
    return isTable(json) ? json : undefined;
  } catch {
    return undefined;
  }
}

export async function readPluginInstalled(env: NodeJS.ProcessEnv): Promise<boolean> {
  return (await installedPlugin(env)) !== undefined;
}

export async function readPluginVersion(env: NodeJS.ProcessEnv): Promise<string | undefined> {
  return (await installedPlugin(env))?.version;
}

/** Whether a config lists the plugin and leaves it on (Codex's default for a listed one). */
function pluginEnabledIn(config: Table): boolean | undefined {
  const entry = isTable(config.plugins) ? config.plugins[PLUGIN_ID] : undefined;
  return isTable(entry) ? entry.enabled !== false : undefined;
}

/**
 * Whether Codex loads the plugin: the user's config, or (with `root`) the
 * project's `.codex/config.toml`, which Codex layers on top. Undefined when the
 * user's config cannot be read.
 */
export async function readPluginEnabled(
  env: NodeJS.ProcessEnv,
  root?: string,
): Promise<boolean | undefined> {
  const user = await readConfig(env);
  if (user === undefined) return undefined;
  const project =
    root === undefined ? undefined : await readConfigFile(join(root, ".codex", "config.toml"));
  return (project && pluginEnabledIn(project)) ?? pluginEnabledIn(user) ?? false;
}

/**
 * Codex's fingerprint of a plugin folder (hooks/src/engine/plugin_fingerprint.rs,
 * "codex-plugin-bundle-v1"): every entry depth first in name order, each its
 * relative path, its kind, and for a file its size and bytes. A hook's trust
 * keeps the value it was given under; a changed plugin no longer matches it.
 */
export async function pluginContentHash(root: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update("codex-plugin-bundle-v1");
  const pending = [root];
  while (pending.length > 0) {
    const path = pending.pop() as string;
    // The path as the system spells it (`\\` on Windows), as Codex hashes it.
    const rel = relative(root, path);
    const name = rel === "" ? "" : basename(path);
    if (
      name === "__pycache__" ||
      name === ".venv" ||
      name.endsWith(".pyc") ||
      name.endsWith(".egg-info")
    )
      continue;
    updateBytes(hash, Buffer.from(rel));
    const info = await lstat(path);
    if (info.isDirectory()) {
      hash.update("directory");
      const names = (await readdir(path)).sort((a, b) =>
        Buffer.compare(Buffer.from(a), Buffer.from(b)),
      );
      for (const entry of names.reverse()) pending.push(join(path, entry));
    } else if (info.isFile()) {
      hash.update("file");
      hash.update(u64(info.size));
      hash.update(await readFile(path));
    } else {
      throw new Error(`unsupported plugin entry: ${path}`);
    }
  }
  return `sha256:${hash.digest("hex")}`;
}

function u64(value: number): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(value));
  return bytes;
}

function updateBytes(hash: Hash, bytes: Buffer): void {
  hash.update(u64(bytes.length));
  hash.update(bytes);
}

/**
 * Whether cogit's marketplace fetches only `.agents`: false when it is a git
 * source that fetches the whole repository (added before `--sparse`), undefined
 * when there is none, it is a local folder, or the config cannot be read.
 */
export async function readMarketplaceSparse(env: NodeJS.ProcessEnv): Promise<boolean | undefined> {
  const config = await readConfig(env);
  const marketplaces = isTable(config?.marketplaces) ? config.marketplaces : {};
  const entry = marketplaces.cogit;
  if (!isTable(entry) || entry.source_type !== "git") return undefined;
  const sparse = Array.isArray(entry.sparse_paths) ? entry.sparse_paths : [];
  return sparse.includes(MARKETPLACE_SPARSE);
}

/**
 * Whether Codex runs the plugin's hooks. Codex trusts each hook by its
 * definition and by the plugin folder's fingerprint, so an update leaves the
 * user's trust behind ("hooks need review" at Codex's start) and the hooks
 * fail until it is given again. Undefined when the config cannot be read.
 */
export async function readHookTrust(env: NodeJS.ProcessEnv): Promise<HookTrust | undefined> {
  const config = await readConfig(env);
  if (config === undefined) return undefined;
  const features = isTable(config.features) ? config.features : {};
  // `codex features list`: hooks is the one flag; plugin_hooks was removed.
  if (features.hooks === false) return "off";
  const hooks = isTable(config.hooks) ? config.hooks : {};
  const state = isTable(hooks.state) ? hooks.state : {};
  const entries = HOOK_EVENTS.map((event) => state[`${PLUGIN_ID}:${HOOKS_FILE}:${event}:0:0`]);
  if (entries.some((entry) => isTable(entry) && entry.enabled === false)) return "disabled";
  if (entries.some((entry) => !isTable(entry) || typeof entry.trusted_hash !== "string"))
    return "untrusted";
  const plugin = await installedPlugin(env);
  if (plugin === undefined) return "untrusted";
  // An approval without a fingerprint predates it; Codex migrates it on its own.
  const pinned = entries.map((entry) => (entry as Table).trusted_content_hash);
  if (pinned.every((value) => typeof value !== "string")) return "trusted";
  const current = await pluginContentHash(plugin.root).catch(() => undefined);
  return pinned.every((value) => value === current) ? "trusted" : "review";
}
