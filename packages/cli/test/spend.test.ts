import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runClaude } from "../src/commands/backfill.js";
import { projectPaths } from "../src/store/paths.js";
import { readSpend, recordSpend, spendOf } from "../src/store/spend.js";
import { tempDir } from "./helpers.js";

let root: string;
beforeEach(async () => {
  root = await tempDir();
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const ENVELOPE = JSON.stringify({
  type: "result",
  result: "{}",
  total_cost_usd: 0.0123,
  usage: {
    input_tokens: 10,
    output_tokens: 200,
    cache_read_input_tokens: 3000,
    cache_creation_input_tokens: 400,
  },
});

describe("spendOf", () => {
  it("reads the cost and tokens of a result envelope", () => {
    expect(spendOf(ENVELOPE)).toEqual({
      usd: 0.0123,
      inputTokens: 10,
      outputTokens: 200,
      cacheReadTokens: 3000,
      cacheWriteTokens: 400,
    });
  });

  it("is undefined for output with no cost, or no JSON", () => {
    expect(spendOf(JSON.stringify({ result: "{}" }))).toBeUndefined();
    expect(spendOf("not json")).toBeUndefined();
    expect(spendOf("null")).toBeUndefined();
  });

  it("counts a missing or bad number as zero", () => {
    expect(spendOf(JSON.stringify({ total_cost_usd: -1, usage: { input_tokens: "x" } }))).toEqual({
      usd: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  });
});

describe("recordSpend and readSpend", () => {
  it("adds up the runs and keeps the first one's time", async () => {
    expect(await readSpend(root)).toBeUndefined();
    await recordSpend(root, "side", "haiku", ENVELOPE, new Date("2026-11-02T10:00:00Z"));
    await recordSpend(root, "review", "opus", ENVELOPE, new Date("2026-11-01T10:00:00Z"));
    await recordSpend(root, "side", "haiku", "no envelope");
    // A torn line is skipped, not fatal.
    await writeFile(projectPaths(root).spend, "{broken\n", { flag: "a" });
    const totals = await readSpend(root);
    expect(totals).toMatchObject({
      runs: 2,
      inputTokens: 20,
      outputTokens: 400,
      cacheReadTokens: 6000,
      cacheWriteTokens: 800,
      since: "2026-11-01T10:00:00.000Z",
    });
    expect(totals?.usd).toBeCloseTo(0.0246);
    const first = JSON.parse(
      (await readFile(projectPaths(root).spend, "utf8")).split("\n")[0] ?? "",
    );
    expect(first).toMatchObject({ kind: "side", model: "haiku" });
  });

  it("never throws when the state folder cannot be written", async () => {
    await writeFile(join(root, ".cogit"), "a file, not a folder");
    await expect(recordSpend(root, "side", "haiku", ENVELOPE)).resolves.toBeUndefined();
  });
});

describe("runClaude", () => {
  // The stand-in claude is a script with a #! line, which Windows cannot start.
  it.skipIf(process.platform === "win32")(
    "notes the run's cost when told which project it was for",
    async () => {
      const bin = join(root, "bin");
      await mkdir(bin, { recursive: true });
      const file = join(bin, "claude");
      await writeFile(
        file,
        `#!/usr/bin/env node\nprocess.stdin.resume();\nprocess.stdin.on("end", () => process.stdout.write(${JSON.stringify(ENVELOPE)}));\n`,
      );
      await chmod(file, 0o755);
      const env = { PATH: `${bin}:${process.env.PATH ?? ""}` };
      expect(await runClaude("hi", "haiku", env)).toBe(ENVELOPE);
      expect(await readSpend(root)).toBeUndefined();
      await runClaude("hi", "haiku", env, undefined, { root, kind: "shape" });
      expect((await readSpend(root))?.runs).toBe(1);
    },
  );
});
