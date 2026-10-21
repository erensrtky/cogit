import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createProgram } from "../src/program.js";
import { loadConfig, loadProject } from "../src/store/stores.js";
import { envFor, type FakeIo, fakeIo, tempDir } from "./helpers.js";

let dir: string;
let root: string;
let io: FakeIo;
let interactive: boolean[];
let launched: string[];

beforeEach(async () => {
  dir = await tempDir();
  root = join(dir, "proj");
  await mkdir(root);
  io = fakeIo(envFor(dir));
  interactive = [];
  launched = [];
});

async function cli(...args: string[]): Promise<string> {
  let err = "";
  const program = createProgram(
    (i) => {
      interactive.push(i);
      return io;
    },
    {
      launch: async (file) => {
        launched.push(file);
        return true;
      },
    },
  );
  program.exitOverride().configureOutput({ writeErr: (s) => (err += s), writeOut: () => {} });
  for (const c of program.commands)
    c.exitOverride().configureOutput({ writeErr: (s) => (err += s) });
  for (const c of program.commands.flatMap((c) => c.commands)) {
    c.exitOverride().configureOutput({ writeErr: (s) => (err += s) });
  }
  try {
    await program.parseAsync(args, { from: "user" });
  } catch (e) {
    if (!err) throw e;
  }
  return err;
}

describe("commands through the CLI", () => {
  it("init --yes runs non-interactively with options", async () => {
    await cli("init", root, "--yes", "--name", "P", "--retention", "keep", "--language", "auto");
    expect(interactive).toEqual([false]);
    expect(await loadProject(root)).toMatchObject({ ok: true, data: { name: "P" } });
  });

  it("rejects a bad --retention value", async () => {
    expect(await cli("init", root, "--retention", "0")).toMatch(/days \(>= 1\) or keep/);
    expect(await cli("init", root, "--yes", "--retention", "90", "--language", "auto")).toBe("");
  });

  it("runs config get/set and epoch add", async () => {
    await cli("config", "set", "updateEveryTurns", "7");
    expect((await loadConfig(io.env)).updateEveryTurns).toBe(7);
    await cli("config", "get", "updateEveryTurns");
    expect(io.lines.at(-1)).toBe("7");
    await cli("init", root, "--yes", "--retention", "keep");
    await cli("epoch", "add", "e1", "First", "-C", root);
    expect(io.lines.at(-1)).toBe("Added epoch e1: First");
  });

  it("runs session write from a file", async () => {
    await cli("init", root, "--yes", "--retention", "keep");
    const f = join(dir, "s.json");
    await writeFile(f, '{"sessionId":"s1"}');
    await cli("session", "write", "-C", root, "-f", f);
    expect(io.lines.at(-1)).toBe("Saved session s1 (0 nodes)");
  });

  it("builds the map through the CLI", async () => {
    await cli("init", root, "--yes", "--retention", "keep");
    await cli("build", root);
    expect(io.lines.at(-1)).toMatch(/^Wrote .*lineage\.html$/);
    expect(existsSync(join(root, ".codelineage", "lineage.html"))).toBe(true);
  });

  it("open builds then launches the map, and explains the missing panel", async () => {
    await cli("init", root, "--yes", "--retention", "keep");
    await cli("open", root);
    expect(launched).toEqual([join(root, ".codelineage", "lineage.html")]);
    expect(io.lines.at(-1)).toMatch(/^Opened .*lineage\.html$/);
    expect(interactive).toEqual([false, false]);
    await cli("open");
    expect(launched).toHaveLength(1);
    expect(io.lines.at(-1)).toMatch(/Epic 3/);
  });

  it("prints user errors as one line", async () => {
    expect(await cli("config", "get", "nope")).toMatch(/^error: unknown key "nope"/);
  });

  it("lets unexpected errors through", async () => {
    await writeFile(join(dir, "home"), "file");
    await expect(cli("config", "set", "language", "x")).rejects.toThrow(/ENOTDIR|EEXIST/);
  });
});
