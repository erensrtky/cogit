import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { run, syncVersion, TARGETS } from "../../../scripts/sync-version.mjs";
import { tempDir } from "./helpers.js";

describe("sync-version", () => {
  it("copies VERSION into the npm and plugin manifests, keeping other keys", async () => {
    const root = await tempDir();
    await writeFile(join(root, "VERSION"), "1.2.3\n");
    for (const rel of TARGETS as string[]) {
      await mkdir(join(root, rel, ".."), { recursive: true });
      await writeFile(join(root, rel), JSON.stringify({ name: "x", version: "0.1.0" }));
    }
    expect(syncVersion(root)).toEqual({ version: "1.2.3", changed: TARGETS });
    for (const rel of TARGETS as string[]) {
      expect(JSON.parse(await readFile(join(root, rel), "utf8"))).toEqual({
        name: "x",
        version: "1.2.3",
      });
    }
    expect(syncVersion(root).changed).toEqual([]);
  });

  it("changes only the version string, keeping the file's formatting", async () => {
    const root = await tempDir();
    await writeFile(join(root, "VERSION"), "2.0.0\n");
    const original = `{\n  "name": "x",\n  "version": "0.1.0",\n  "keywords": ["a", "b"]\n}\n`;
    for (const rel of TARGETS as string[]) {
      await mkdir(join(root, rel, ".."), { recursive: true });
      await writeFile(join(root, rel), original);
    }
    syncVersion(root);
    const updated = await readFile(join(root, TARGETS[0] as string), "utf8");
    expect(updated).toBe(original.replace("0.1.0", "2.0.0"));
  });

  it("writes a version into a manifest that has none", async () => {
    const root = await tempDir();
    await writeFile(join(root, "VERSION"), "2.0.0\n");
    for (const rel of TARGETS as string[]) {
      await mkdir(join(root, rel, ".."), { recursive: true });
      await writeFile(join(root, rel), '{"name":"x"}');
    }
    syncVersion(root);
    for (const rel of TARGETS as string[]) {
      expect(JSON.parse(await readFile(join(root, rel), "utf8"))).toEqual({
        name: "x",
        version: "2.0.0",
      });
    }
  });

  it("leaves this repository unchanged when it is already in sync", () => {
    expect(run(() => {})).toEqual([]);
  });
});
