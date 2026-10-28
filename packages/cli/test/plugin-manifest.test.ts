import { access, readdir, readFile } from "node:fs/promises";
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
    // A plugin without a version resolves to "unknown" and never updates.
    expect(plugin.version).toBe(pkg.version);
    // VERSION is the source; `npm run build` copies it (scripts/sync-version.mjs).
    const version = (await readFile(new URL("../../../VERSION", import.meta.url), "utf8")).trim();
    expect(pkg.version, "run npm run build to sync VERSION").toBe(version);
    // The plugin keeps the short name; npm only had room for it under the @cogit scope.
    expect(plugin.name).toBe("cogit");
    expect(pkg.name).toBe("@cogit/cli");
    expect(pkg.bin).toEqual({ cogit: "dist/cli.js" });
    // A scoped package publishes as private unless told otherwise.
    expect(pkg.publishConfig).toEqual({ access: "public" });
    expect(pkg.files).toEqual(
      expect.arrayContaining(["dist", ".claude-plugin", "skills", "hooks"]),
    );
  });

  it("lists the plugin in the marketplace under its manifest name, from the plugin branch", async () => {
    const marketplace = await read("../../../.claude-plugin/marketplace.json");
    // Not the npm package: npm 12 refuses the tarball URL Claude Code fetches it by
    // (EALLOWREMOTE). The branch holds the build; scripts/build-plugin-branch.mjs writes it.
    expect(marketplace.plugins).toEqual([
      expect.objectContaining({
        name: "cogit",
        source: { source: "github", repo: "erensrtky/cogit", ref: "plugin" },
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
      url: "git+https://github.com/erensrtky/cogit.git",
    });
    expect(pkg.homepage).toBe("https://github.com/erensrtky/cogit#readme");
    expect(pkg.bugs).toEqual({ url: "https://github.com/erensrtky/cogit/issues" });
    expect(pkg.keywords).toEqual(expect.arrayContaining(["git", "claude-code", "lineage"]));
  });

  it("keeps a README that shows the map and points at the guide and licence", async () => {
    const readme = await readFile(new URL("../../../README.md", import.meta.url), "utf8");
    // One screenshot per theme; GitHub shows the one that matches the reader's.
    expect(readme).toContain('srcset="docs/images/map-dark.png"');
    expect(readme).toContain('src="docs/images/map-light.png"');
    expect(readme).toContain("(docs/guide/getting-started.md)");
    expect(readme).toContain("(LICENSE)");
    // A relative image only renders when the file it names is in the repository.
    for (const image of ["map-dark.png", "map-light.png"]) {
      await expect(
        access(new URL(`../../../docs/images/${image}`, import.meta.url)),
      ).resolves.toBeUndefined();
    }
  });

  it("points every relative link of the README and the guide at a file that exists", async () => {
    const guide = new URL("../../../docs/guide/", import.meta.url);
    const pages = [
      new URL("../../../README.md", import.meta.url),
      ...(await readdir(guide)).filter((f) => f.endsWith(".md")).map((f) => new URL(f, guide)),
    ];
    let checked = 0;
    for (const page of pages) {
      const text = await readFile(page, "utf8");
      const links = [...text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)]
        .map((match) => match[1] ?? "")
        .filter((href) => href !== "" && !/^[a-z]+:/i.test(href) && !href.startsWith("#"));
      for (const href of links) {
        await expect(
          access(new URL(href.replace(/#.*$/, ""), page)),
          `${page.pathname} links to ${href}`,
        ).resolves.toBeUndefined();
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it("ships no runtime dependencies, since the CLI is bundled into one file", async () => {
    const pkg = await read("../package.json");
    expect(pkg.dependencies).toBeUndefined();
  });
});
