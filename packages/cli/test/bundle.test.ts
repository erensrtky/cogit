import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { envFor, tempDir } from "./helpers.js";

const run = promisify(execFile);
const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");

// Bundling can break at runtime in ways unit tests never see (CJS deps in ESM).
describe("bundled CLI", () => {
  let out: string;
  beforeAll(async () => {
    out = await tempDir();
    // Through node: Windows has only an npx.cmd, which execFile cannot start.
    const tsup = join(
      dirname(createRequire(import.meta.url).resolve("tsup/package.json")),
      "dist",
      "cli-default.js",
    );
    await run(process.execPath, [tsup, "--out-dir", out, "--silent"], { cwd: pkgDir });
  }, 60_000);

  it("starts and runs init end to end", async () => {
    const dir = await tempDir();
    const root = join(dir, "proj");
    await mkdir(root);
    const env = { ...process.env, ...envFor(dir) };
    const cli = (...args: string[]) =>
      run("node", [join(out, "cli.js"), ...args], { env, cwd: root });
    expect((await cli("--version")).stdout.trim()).toBe(pkg.version);
    expect((await cli("init", "--yes")).stdout).toMatch(/Initialized proj/);
  });
});
