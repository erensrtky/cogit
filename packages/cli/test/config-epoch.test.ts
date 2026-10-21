import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { configGet, configSet } from "../src/commands/config.js";
import { epochAdd } from "../src/commands/epoch.js";
import { init } from "../src/commands/init.js";
import { CliError } from "../src/io.js";
import { loadConfig, loadProject } from "../src/store/stores.js";
import { envFor, fakeIo, tempDir } from "./helpers.js";

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
    expect(io.lines).toContain("updateEveryTurns = 5");
    await configGet("gitPolicy", io);
    expect(io.lines.at(-1)).toBe('"ignore"');
  });

  it("sets numbers, booleans, strings and agent lists", async () => {
    const io = fakeIo(env);
    await configSet("updateEveryTurns", "3", io);
    await configSet("sessionEndCatchUp", "false", io);
    await configSet("language", "Turkish", io);
    await configSet("agents", "claude-code, codex", io);
    expect(await loadConfig(env)).toMatchObject({
      updateEveryTurns: 3,
      sessionEndCatchUp: false,
      language: "Turkish",
      agents: ["claude-code", "codex"],
    });
    await configSet("agents", '["claude-code"]', io);
    expect((await loadConfig(env)).agents).toEqual(["claude-code"]);
  });

  it("rejects unknown keys and invalid values", async () => {
    await expect(configSet("schema", "2", fakeIo(env))).rejects.toThrow(/unknown key/);
    await expect(configGet("nope", fakeIo(env))).rejects.toBeInstanceOf(CliError);
    await expect(configSet("updateEveryTurns", "0", fakeIo(env))).rejects.toThrow(/invalid value/);
    await expect(configSet("gitPolicy", "maybe", fakeIo(env))).rejects.toThrow(/invalid value/);
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
    await mkdir(join(root, ".codelineage"));
    await writeFile(join(root, ".codelineage", "project.json"), '{"schema":1}');
    await expect(epochAdd(root, "e1", "t", fakeIo(env))).rejects.toThrow(/name/);
  });
});
