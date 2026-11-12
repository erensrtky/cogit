import { chmod, mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { platform } from "node:process";
import { beforeEach, describe, expect, it } from "vitest";
import {
  installedPlugin,
  pluginContentHash,
  readConfigFile,
  readHookTrust,
  readPluginEnabled,
  readPluginInstalled,
  readPluginVersion,
} from "../src/agents/codex/settings.js";
import { AGENTS } from "../src/agents/index.js";
import { agentPresent, isDir, onPath } from "../src/agents/presence.js";
import {
  codexHome,
  installCodexPlugin,
  trustedCodexPlugin,
  writeCodexConfig,
} from "./codex-setup.js";
import { envFor, tempDir } from "./helpers.js";

let dir: string;
let env: NodeJS.ProcessEnv;
beforeEach(async () => {
  dir = await tempDir();
  env = envFor(dir);
});

const codex = AGENTS.codex;

describe("Codex's config.toml", () => {
  it("reads a missing file as empty and a broken one as unreadable", async () => {
    expect(await readConfigFile(join(dir, "none.toml"))).toEqual({});
    await writeFile(join(dir, "bad.toml"), "[plugins\nenabled = ");
    expect(await readConfigFile(join(dir, "bad.toml"))).toBeUndefined();
    // A folder in the file's place cannot be read either.
    await mkdir(join(dir, "folder.toml"));
    expect(await readConfigFile(join(dir, "folder.toml"))).toBeUndefined();
  });

  it("finds the installed plugin and its version, the newest when two are left", async () => {
    expect(await readPluginInstalled(env)).toBe(false);
    expect(await readPluginVersion(env)).toBeUndefined();
    await installCodexPlugin(env, "1.5.0");
    await installCodexPlugin(env, "1.10.0");
    // A folder without a manifest is not an install.
    await mkdir(join(codexHome(env), "plugins", "cache", "cogit", "cogit", "2.0.0"));
    expect(await readPluginInstalled(env)).toBe(true);
    expect(await readPluginVersion(env)).toBe("1.10.0");
    expect((await installedPlugin(env))?.root).toMatch(/1\.10\.0$/);
  });

  it("names the folder's version when the manifest has none", async () => {
    const root = await installCodexPlugin(env, "1.5.0");
    await writeFile(join(root, ".codex-plugin", "plugin.json"), '{"name":"cogit"}');
    expect(await readPluginVersion(env)).toBe("1.5.0");
    await writeFile(join(root, ".codex-plugin", "plugin.json"), "[1]");
    expect(await readPluginInstalled(env)).toBe(false);
  });

  it("reads whether the plugin is on, the project's config over the user's", async () => {
    expect(await readPluginEnabled(env)).toBe(false);
    await writeCodexConfig(env, { enabled: true });
    expect(await readPluginEnabled(env)).toBe(true);
    // Codex loads a listed plugin unless it says enabled = false.
    await writeCodexConfig(env, { extra: '[plugins."cogit@cogit"]\n' });
    expect(await readPluginEnabled(env)).toBe(true);
    await writeCodexConfig(env, { enabled: false });
    expect(await readPluginEnabled(env)).toBe(false);
    const root = join(dir, "proj");
    await mkdir(join(root, ".codex"), { recursive: true });
    await writeFile(
      join(root, ".codex", "config.toml"),
      '[plugins."cogit@cogit"]\nenabled = true\n',
    );
    expect(await readPluginEnabled(env, root)).toBe(true);
    expect(await readPluginEnabled(env, join(dir, "other"))).toBe(false);
    await writeFile(join(codexHome(env), "config.toml"), "not toml [");
    expect(await readPluginEnabled(env)).toBeUndefined();
  });
});

describe("Codex's hook trust", () => {
  it("fingerprints a plugin folder the way Codex does", async () => {
    const root = join(dir, "plugin");
    await mkdir(join(root, "b", "__pycache__"), { recursive: true });
    await writeFile(join(root, "a.txt"), "a");
    await writeFile(join(root, "b", "c.json"), "{}");
    await writeFile(join(root, "b", "x.pyc"), "skipped");
    await writeFile(join(root, "b", "__pycache__", "y"), "skipped");
    // The same walk and bytes as codex-rs plugin_fingerprint.rs. Measured 2026-11-12: the walk
    // matched the hash Codex 0.167.1 stored for a real install, and a separate script that
    // matched it gives this value for this tree.
    // Windows spells the paths with `\\`, so its value differs.
    if (platform !== "win32")
      expect(await pluginContentHash(root)).toBe(
        "sha256:7ec328db7935bd3158403047eb4e9edb14c30fd75475bdb5f666da3694a59a45",
      );
    await writeFile(join(root, "b", "x.pyc"), "still skipped");
    const before = await pluginContentHash(root);
    expect(await pluginContentHash(root)).toBe(before);
    await writeFile(join(root, "a.txt"), "b");
    expect(await pluginContentHash(root)).not.toBe(before);
  });

  it.skipIf(platform === "win32")(
    "refuses a folder with an entry Codex cannot fingerprint",
    async () => {
      const root = join(dir, "plugin");
      await mkdir(root);
      await symlink(join(dir, "elsewhere"), join(root, "link"));
      await expect(pluginContentHash(root)).rejects.toThrow(/unsupported plugin entry/);
    },
  );

  it("tells trusted hooks from ones never trusted, held for review, or turned off", async () => {
    expect(await readHookTrust(env)).toBe("untrusted");
    const root = await trustedCodexPlugin(env, "1.5.0");
    expect(await readHookTrust(env)).toBe("trusted");
    // An update changes the folder: Codex holds the hooks until the user reviews them.
    await writeFile(join(root, "dist", "cli.js"), "// cogit 1.5.1\n");
    expect(await readHookTrust(env)).toBe("review");
    await writeCodexConfig(env, { enabled: true, trust: {} });
    expect(await readHookTrust(env)).toBe("trusted");
    await writeCodexConfig(env, { enabled: true, trust: { events: ["stop"] } });
    expect(await readHookTrust(env)).toBe("untrusted");
    await writeCodexConfig(env, { enabled: true, trust: { enabled: false } });
    expect(await readHookTrust(env)).toBe("disabled");
    await writeCodexConfig(env, { enabled: true, trust: {}, extra: "[features]\nhooks = false\n" });
    expect(await readHookTrust(env)).toBe("off");
    await writeFile(join(codexHome(env), "config.toml"), "[[");
    expect(await readHookTrust(env)).toBeUndefined();
  });

  it("reads trust without an installed plugin as never given", async () => {
    await writeCodexConfig(env, { enabled: true, trust: { contentHash: "sha256:x" } });
    expect(await readHookTrust(env)).toBe("untrusted");
  });

  // Windows ignores the mode; root reads anything.
  it.skipIf(platform === "win32" || process.getuid?.() === 0)(
    "reads a fingerprint it cannot take as a change",
    async () => {
      const root = await trustedCodexPlugin(env, "1.5.0");
      await chmod(join(root, "dist"), 0o000);
      try {
        expect(await readHookTrust(env)).toBe("review");
      } finally {
        await chmod(join(root, "dist"), 0o755);
      }
    },
  );
});

describe("agent presence", () => {
  it("finds a command on PATH and a state directory", async () => {
    const bin = join(dir, "bin");
    await mkdir(bin);
    await writeFile(join(bin, "codex"), "#!/bin/sh\n");
    expect(await onPath("codex", { PATH: bin })).toBe(true);
    expect(await onPath("codex", { Path: bin })).toBe(true);
    expect(await onPath("claude", { PATH: bin })).toBe(false);
    expect(await onPath("codex", {})).toBe(false);
    expect(await isDir(bin)).toBe(true);
    expect(await isDir(join(bin, "codex"))).toBe(false);
    expect(await agentPresent(join(dir, "none"), "codex", { PATH: bin })).toBe(true);
    expect(await agentPresent(bin, "nothing", {})).toBe(true);
    expect(await agentPresent(join(dir, "none"), "nothing", {})).toBe(false);
  });

  it("knows each agent by its own directory", async () => {
    expect(await codex?.isPresent(env)).toBe(false);
    await mkdir(codexHome(env), { recursive: true });
    expect(await codex?.isPresent(env)).toBe(true);
    expect(await AGENTS["claude-code"]?.isPresent(env)).toBe(false);
    await mkdir(env.CLAUDE_CONFIG_DIR as string, { recursive: true });
    expect(await AGENTS["claude-code"]?.isPresent(env)).toBe(true);
  });

  it("answers the setup questions each agent has its own way", async () => {
    const claude = AGENTS["claude-code"];
    expect(await claude?.readHookTrust(env)).toBe("trusted");
    expect(await claude?.unreadableTranscripts(env)).toEqual([]);
    expect(claude?.settingsFile(env)).toBe(join(env.CLAUDE_CONFIG_DIR as string, "settings.json"));
    expect(codex?.settingsFile(env)).toBe(join(codexHome(env), "config.toml"));
    expect(await codex?.unreadableTranscripts(env)).toEqual([]);
    expect(await codex?.readRetention(env)).toBe(Number.POSITIVE_INFINITY);
    expect(await codex?.readSkillAllowed(env)).toBe(true);
    expect(codex?.updateCommand).toBe(
      "codex plugin marketplace upgrade cogit && codex plugin add cogit@cogit",
    );
  });
});
