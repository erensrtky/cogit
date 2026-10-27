import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = async (path: string) =>
  JSON.parse(await readFile(new URL(path, import.meta.url), "utf8")) as Record<string, unknown>;

describe("plugin packaging", () => {
  it("writes a message summary only when the setting is on", async () => {
    const skill = await readFile(new URL("../skills/record/SKILL.md", import.meta.url), "utf8");
    // Story 8.9: the branch summary is the outer layer; the per-message summary
    // is off unless the user turns it on, and the skill has to say so.
    expect(skill).toContain("`messageSummaries`");
    expect(skill).toMatch(/ONLY when `messageSummaries`/);
  });

  it("keeps the plugin manifest in step with the npm package", async () => {
    const pkg = await read("../package.json");
    const plugin = await read("../.claude-plugin/plugin.json");
    // An npm-sourced plugin without a version resolves to "unknown" and never updates.
    expect(plugin.version).toBe(pkg.version);
    // VERSION is the source; `npm run build` copies it (scripts/sync-version.mjs).
    const version = (await readFile(new URL("../../../VERSION", import.meta.url), "utf8")).trim();
    expect(pkg.version, "run npm run build to sync VERSION").toBe(version);
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

  it("carries the npm metadata a publish needs", async () => {
    const pkg = await read("../package.json");
    // Story 6.1: the registry page comes from these fields alone.
    expect(pkg.description).toBe("Git remembers what changed. cogit remembers why.");
    expect(pkg.license).toBe("MIT");
    expect(pkg.repository).toEqual({
      type: "git",
      url: "git+https://github.com/sainthardrock/cogit.git",
    });
    expect(pkg.homepage).toBe("https://github.com/sainthardrock/cogit#readme");
    expect(pkg.bugs).toEqual({ url: "https://github.com/sainthardrock/cogit/issues" });
    expect(pkg.keywords).toEqual(expect.arrayContaining(["git", "claude-code", "lineage"]));
  });

  it("keeps a README that shows the map and points at the spec and licence", async () => {
    const readme = await readFile(new URL("../../../README.md", import.meta.url), "utf8");
    expect(readme).toContain("![The map");
    expect(readme).toContain("(docs/images/map.png)");
    expect(readme).toContain("(specs/cogit-mvp.md)");
    expect(readme).toContain("(LICENSE)");
    // A relative image only renders when the file it names is in the repository.
    await expect(
      access(new URL("../../../docs/images/map.png", import.meta.url)),
    ).resolves.toBeUndefined();
  });

  it("points every relative README link at a file that exists (Story 10.2)", async () => {
    const readme = await readFile(new URL("../../../README.md", import.meta.url), "utf8");
    const root = new URL("../../../", import.meta.url);
    const links = [...readme.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)]
      .map((match) => match[1] ?? "")
      .filter((href) => href !== "" && !/^[a-z]+:/i.test(href) && !href.startsWith("#"));
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      await expect(
        access(new URL(href.replace(/#.*$/, ""), root)),
        `README links to ${href}`,
      ).resolves.toBeUndefined();
    }
  });

  it("ships no runtime dependencies, since the CLI is bundled into one file", async () => {
    const pkg = await read("../package.json");
    expect(pkg.dependencies).toBeUndefined();
  });
});
