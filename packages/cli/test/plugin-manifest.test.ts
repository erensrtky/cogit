import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = async (path: string) =>
  JSON.parse(await readFile(new URL(path, import.meta.url), "utf8")) as Record<string, unknown>;

describe("plugin packaging", () => {
  it("keeps the plugin manifest in step with the npm package", async () => {
    const pkg = await read("../package.json");
    const plugin = await read("../.claude-plugin/plugin.json");
    // An npm-sourced plugin without a version resolves to "unknown" and never updates.
    expect(plugin.version).toBe(pkg.version);
    expect(plugin.name).toBe(pkg.name);
    expect(pkg.files).toEqual(
      expect.arrayContaining(["dist", ".claude-plugin", "skills", "hooks"]),
    );
  });

  it("lists the plugin in the marketplace under its manifest name, from npm", async () => {
    const marketplace = await read("../../../.claude-plugin/marketplace.json");
    const pkg = await read("../package.json");
    expect(marketplace.plugins).toEqual([
      expect.objectContaining({
        name: pkg.name,
        source: { source: "npm", package: pkg.name },
      }),
    ]);
  });

  it("ships no runtime dependencies, since the CLI is bundled into one file", async () => {
    const pkg = await read("../package.json");
    expect(pkg.dependencies).toBeUndefined();
  });
});
