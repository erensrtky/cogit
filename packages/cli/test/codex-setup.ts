import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HOOK_EVENTS, PLUGIN_ID, pluginContentHash } from "../src/agents/codex/settings.js";

/**
 * A Codex home as Codex 0.167 leaves it (measured 2026-11-12): the plugin under
 * `plugins/cache/cogit/cogit/<version>`, `[plugins."cogit@cogit"]` in
 * config.toml, and one `[hooks.state."…"]` table per hook the user trusted.
 */

export const codexHome = (env: NodeJS.ProcessEnv): string => env.CODEX_HOME as string;

/** Installs a plugin folder for `version`; returns its root. */
export async function installCodexPlugin(env: NodeJS.ProcessEnv, version: string): Promise<string> {
  const root = join(codexHome(env), "plugins", "cache", "cogit", "cogit", version);
  await mkdir(join(root, ".codex-plugin"), { recursive: true });
  await writeFile(
    join(root, ".codex-plugin", "plugin.json"),
    JSON.stringify({ name: "cogit", version }),
  );
  await mkdir(join(root, "dist"), { recursive: true });
  await writeFile(join(root, "dist", "cli.js"), `// cogit ${version}\n`);
  return root;
}

export interface CodexConfig {
  /** `[plugins."cogit@cogit"] enabled`; undefined leaves the table out. */
  enabled?: boolean;
  /** How the hooks are trusted: per hook, with this content hash (or none). */
  trust?: { contentHash?: string; enabled?: boolean; events?: string[] };
  /** A marketplace added before `--sparse`, which fetches the whole repository. */
  wholeRepo?: boolean;
  /** Extra TOML appended as it is. */
  extra?: string;
}

/** Writes `$CODEX_HOME/config.toml` from the pieces cogit reads. */
export async function writeCodexConfig(env: NodeJS.ProcessEnv, config: CodexConfig): Promise<void> {
  const sparse = config.wholeRepo === true ? "" : 'sparse_paths = [".agents"]\n';
  const lines: string[] = [`[marketplaces.cogit]\nsource_type = "git"\n${sparse}`];
  if (config.enabled !== undefined)
    lines.push(`[plugins."${PLUGIN_ID}"]\nenabled = ${config.enabled}\n`);
  if (config.trust !== undefined) {
    for (const event of config.trust.events ?? HOOK_EVENTS) {
      lines.push(`[hooks.state."${PLUGIN_ID}:hooks/codex.json:${event}:0:0"]`);
      lines.push('trusted_hash = "sha256:declaration"');
      if (config.trust.contentHash !== undefined)
        lines.push(`trusted_content_hash = "${config.trust.contentHash}"`);
      if (config.trust.enabled !== undefined) lines.push(`enabled = ${config.trust.enabled}`);
      lines.push("");
    }
  }
  if (config.extra !== undefined) lines.push(config.extra);
  await mkdir(codexHome(env), { recursive: true });
  await writeFile(join(codexHome(env), "config.toml"), lines.join("\n"));
}

/** Installs `version`, turns it on and trusts its hooks as they are now. */
export async function trustedCodexPlugin(env: NodeJS.ProcessEnv, version: string): Promise<string> {
  const root = await installCodexPlugin(env, version);
  await writeCodexConfig(env, {
    enabled: true,
    trust: { contentHash: await pluginContentHash(root) },
  });
  return root;
}

/** One Codex session that ran in `cwd`; returns its rollout. */
export async function codexSession(
  env: NodeJS.ProcessEnv,
  cwd: string,
  id = "01a1cd04-0e72-7a70-9406-6562bc6c3360",
): Promise<string> {
  const folder = join(codexHome(env), "sessions", "2026", "11", "12");
  await mkdir(folder, { recursive: true });
  const file = join(folder, `rollout-2026-11-12T02-00-00-${id}.jsonl`);
  await writeFile(
    file,
    `${JSON.stringify({
      timestamp: "2026-11-12T02:00:00.000Z",
      type: "session_meta",
      payload: { id, cwd, originator: "codex-tui" },
    })}\n`,
  );
  return file;
}
