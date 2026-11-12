import { access, readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { codex } from "../src/agents/codex/index.js";

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
      expect.arrayContaining(["dist", ".claude-plugin", ".codex-plugin", "skills", "hooks"]),
    );
  });

  it("gives Codex its own manifest, pointing at its own hooks file", async () => {
    const claude = await read("../.claude-plugin/plugin.json");
    const codex = await read("../.codex-plugin/plugin.json");
    expect(codex).toMatchObject({ name: claude.name, version: claude.version });
    // Codex reads only the hooks the manifest names: Claude Code's hooks.json passes `args`,
    // a field Codex lacks, so Codex would run a bare `node`. Paths must start with "./".
    expect(codex.hooks).toBe("./hooks/codex.json");
    // Codex reads its own copy of the skill, written at build time (scripts/codex-skill.mjs).
    expect(codex.skills).toBe("./dist/codex-skills/");
  });

  it("calls the CLI from Codex hooks in one stable line per event, naming the agent", async () => {
    const { hooks } = (await read("../hooks/codex.json")) as {
      hooks: Record<string, { hooks: Record<string, unknown>[] }[]>;
    };
    const events = {
      SessionStart: "sessionstart",
      UserPromptSubmit: "promptsubmit",
      Stop: "stop",
      SessionEnd: "sessionend",
    };
    expect(Object.keys(hooks).sort()).toEqual(Object.keys(events).sort());
    for (const [event, arg] of Object.entries(events)) {
      const [handler] = hooks[event]?.[0]?.hooks ?? [];
      // Codex trusts a hook by a hash of its definition: the command names no version, so an
      // update keeps the same text.
      expect(handler).toMatchObject({
        type: "command",
        command: `node "$PLUGIN_ROOT/dist/cli.js" hook ${arg} --agent codex`,
        commandWindows: `node "%PLUGIN_ROOT%\\dist\\cli.js" hook ${arg} --agent codex`,
      });
      expect(handler?.args).toBeUndefined();
    }
    // Codex caps SessionEnd at 3 s; Stop waits for headless closes like Claude's does.
    expect(hooks.SessionEnd?.[0]?.hooks[0]?.timeout).toBeLessThanOrEqual(3);
    expect(hooks.Stop?.[0]?.hooks[0]?.timeout).toBe(600);
  });

  it("lists the plugin for Codex from the same branch, in a source Codex reads", async () => {
    const marketplace = await read("../../../.agents/plugins/marketplace.json");
    // Codex skips Claude's `github` source; it looks in .agents/plugins before .claude-plugin.
    expect(marketplace.name).toBe("cogit");
    expect(marketplace.plugins).toEqual([
      expect.objectContaining({
        name: "cogit",
        source: { source: "url", url: "https://github.com/erensrtky/cogit.git", ref: "plugin" },
      }),
    ]);
  });

  it("tells a Codex user the two commands that install from that marketplace", () => {
    // Measured on Codex 0.167.1: the marketplace is added by repo, the plugin as name@marketplace.
    // On 0.167.2 `--sparse .agents` cut the fetch from the whole repository (33 MB, past
    // `marketplace upgrade`'s 30 s on a slow line) to about 1 MB.
    expect(codex.installCommand).toBe(
      "codex plugin marketplace add erensrtky/cogit --sparse .agents && codex plugin add cogit@cogit",
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
    expect(pkg.description).toBe("Git for the intent behind agent-written code.");
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
    // The feature gallery: the map, a message's Shape, the Tasks panel and a file's history.
    for (const shot of ["map.png", "shape.png", "tasks.png", "files.png"]) {
      expect(readme).toContain(`src="docs/images/${shot}"`);
    }
    expect(readme).toContain("(docs/guide/getting-started.md)");
    expect(readme).toContain("(LICENSE)");
    // A relative image only renders when the file it names is in the repository.
    for (const image of ["map.png", "shape.png", "tasks.png", "files.png"]) {
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
