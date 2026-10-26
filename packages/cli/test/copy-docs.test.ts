import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { copyDocs, DOCS, run } from "../../../scripts/copy-docs.mjs";
import { tempDir } from "./helpers.js";

describe("copy-docs", () => {
  it("copies the README and LICENSE next to package.json", async () => {
    const root = await tempDir();
    await mkdir(join(root, "packages/cli"), { recursive: true });
    for (const name of DOCS as string[]) await writeFile(join(root, name), `${name}\n`);

    expect(copyDocs(root)).toEqual(DOCS);
    for (const name of DOCS as string[])
      expect(await readFile(join(root, "packages/cli", name), "utf8")).toBe(`${name}\n`);
  });

  it("is what this repository publishes", () => {
    expect(run(() => {})).toEqual(DOCS);
  });
});
