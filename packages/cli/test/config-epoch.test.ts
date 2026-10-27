import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { configGet, configPrune, configSet } from "../src/commands/config.js";
import { epochAdd } from "../src/commands/epoch.js";
import { init } from "../src/commands/init.js";
import { CliError } from "../src/io.js";
import { globalPaths } from "../src/store/paths.js";
import { loadConfig, loadProject, loadRegistry, updateRegistry } from "../src/store/stores.js";
import { envFor, fakeIo, T0, tempDir } from "./helpers.js";

let dir: string;
let env: NodeJS.ProcessEnv;
beforeEach(async () => {
  dir = await tempDir();
  env = envFor(dir);
});

describe("config", () => {
  it("prints all settings or one", async () => {
    const io = fakeIo(env);
    await configGet(undefined, io);
    expect(io.lines).toContain("updateEveryTurns = 15");
    expect(io.lines).toContain('recorder = "mixed"');
    expect(io.lines).toContain('sideModel = "haiku"');
    expect(io.lines).toContain("sideEveryTurns = 5");
    // The old name is an accepted alias, not a listed key (Story 12.1).
    expect(io.lines.some((line) => line.startsWith("catchUpModel"))).toBe(false);
    expect(io.lines).toContain("messageSummaries = false");
    expect(io.lines).toContain("startupContext = true");
    await configGet("gitPolicy", io);
    expect(io.lines.at(-1)).toBe('"commit"');
    // The old name reads as the new one (Story 12.1).
    await configGet("catchUpModel", io);
    expect(io.lines.at(-1)).toBe('"haiku"');
  });

  it("sets numbers, booleans, strings and agent lists", async () => {
    const io = fakeIo(env);
    await configSet("updateEveryTurns", "3", io);
    await configSet("sessionEndCatchUp", "false", io);
    await configSet("language", "Turkish", io);
    await configSet("catchUpModel", "sonnet", io);
    await configSet("messageSummaries", "true", io);
    await configSet("startupContext", "false", io);
    await configSet("agents", "claude-code, codex", io);
    expect(await loadConfig(env)).toMatchObject({
      updateEveryTurns: 3,
      sessionEndCatchUp: false,
      language: "Turkish",
      sideModel: "sonnet",
      messageSummaries: true,
      startupContext: false,
      agents: ["claude-code", "codex"],
    });
    await configSet("agents", '["claude-code"]', io);
    expect((await loadConfig(env)).agents).toEqual(["claude-code"]);
  });

  it("reads a config written before the rename and migrates it (Story 12.1)", async () => {
    const file = globalPaths(env).config;
    await mkdir(dirname(file), { recursive: true });
    await writeFile(
      file,
      JSON.stringify({ schema: 1, catchUpModel: "sonnet", updateEveryTurns: 5 }),
    );
    const config = await loadConfig(env);
    expect(config.sideModel).toBe("sonnet");
    expect(config.catchUpModel).toBeUndefined();
    expect(config.recorder).toBe("mixed");
    // The next write stores only the new name.
    await configSet("updateEveryTurns", "6", fakeIo(env));
    const stored = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    expect(stored.sideModel).toBe("sonnet");
    expect(stored).not.toHaveProperty("catchUpModel");
  });

  it("keeps an explicit new model name over the old key (Story 12.1)", async () => {
    const file = globalPaths(env).config;
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ schema: 1, catchUpModel: "sonnet", sideModel: "opus" }));
    expect((await loadConfig(env)).sideModel).toBe("opus");
  });

  it("rejects unknown keys and invalid values", async () => {
    await expect(configSet("schema", "2", fakeIo(env))).rejects.toThrow(/unknown key/);
    await expect(configGet("nope", fakeIo(env))).rejects.toBeInstanceOf(CliError);
    await expect(configSet("updateEveryTurns", "0", fakeIo(env))).rejects.toThrow(/invalid value/);
    await expect(configSet("gitPolicy", "maybe", fakeIo(env))).rejects.toThrow(/invalid value/);
  });
});

describe("config prune", () => {
  let alive: string;
  let gone: string;

  async function registerBoth(): Promise<void> {
    await updateRegistry(
      (r) => ({
        ...r,
        projects: [
          { path: alive, name: "alive", addedAt: T0 },
          { path: gone, name: "gone", addedAt: T0 },
        ],
      }),
      env,
    );
  }

  beforeEach(async () => {
    alive = join(dir, "alive");
    gone = join(dir, "gone");
    await mkdir(alive);
    await registerBoth();
  });

  it("removes entries whose directory is gone and keeps the rest", async () => {
    const io = fakeIo(env);
    await configPrune({}, io);
    expect(io.lines).toEqual([`Removed gone (${gone})`]);
    expect(await loadRegistry(env)).toMatchObject({
      ok: true,
      data: { projects: [{ path: alive, name: "alive" }] },
    });
  });

  it("--dry-run lists the entries without touching the registry", async () => {
    const io = fakeIo(env);
    await configPrune({ dryRun: true }, io);
    expect(io.lines).toEqual([`Would remove gone (${gone})`]);
    expect(await loadRegistry(env)).toMatchObject({
      ok: true,
      data: { projects: [{ path: alive }, { path: gone }] },
    });
  });

  it("prints a friendly line when nothing is missing or no registry exists", async () => {
    const io = fakeIo(env);
    await configPrune({}, io);
    await configPrune({}, io);
    expect(io.lines).toEqual([`Removed gone (${gone})`, "No missing projects"]);

    const fresh = fakeIo(envFor(await tempDir()));
    await configPrune({ dryRun: true }, fresh);
    expect(fresh.lines).toEqual(["No missing projects"]);
  });

  it("refuses to prune a corrupt registry", async () => {
    await mkdir(globalPaths(env).base, { recursive: true });
    await writeFile(globalPaths(env).registry, "{not json");
    await expect(configPrune({}, fakeIo(env))).rejects.toBeInstanceOf(CliError);
    await expect(configPrune({}, fakeIo(env))).rejects.toThrow(/registry: invalid JSON/);
  });
});

describe("epoch add", () => {
  let root: string;
  beforeEach(async () => {
    root = join(dir, "proj");
    await mkdir(root);
  });

  it("adds an epoch once and accepts a repeat with the same title", async () => {
    await init(root, { name: "p", retention: "keep", language: "auto" }, fakeIo(env));
    const io = fakeIo(env);
    await epochAdd(root, "e2e", "E2E setup", io);
    await epochAdd(root, "e2e", "E2E setup", io);
    expect(io.lines).toEqual(["Added epoch e2e: E2E setup", "Epoch e2e already exists"]);
    expect(await loadProject(root)).toMatchObject({
      data: { epochs: [{ id: "e2e", title: "E2E setup", createdAt: "2026-10-21T10:00:00.000Z" }] },
    });
    await expect(epochAdd(root, "e2e", "Other", io)).rejects.toThrow(/already exists/);
  });

  it("rejects bad ids and uninitialized or corrupt projects", async () => {
    await expect(epochAdd(root, "../x", "t", fakeIo(env))).rejects.toThrow(/invalid epoch id/);
    await expect(epochAdd(root, "e1", "t", fakeIo(env))).rejects.toThrow(/not initialized/);
    await mkdir(join(root, ".cogit"));
    await writeFile(join(root, ".cogit", "project.json"), '{"schema":1}');
    await expect(epochAdd(root, "e1", "t", fakeIo(env))).rejects.toThrow(/name/);
  });
});
