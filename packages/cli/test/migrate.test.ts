import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { atomicWriteJson } from "../src/store/fs.js";
import {
  migrateGlobal,
  migrateProject,
  renameGitignoreLines,
  takeMigrationWarnings,
} from "../src/store/migrate.js";
import { resolveProjectRoot } from "../src/store/root.js";
import { tempDir } from "./helpers.js";

describe("migrateProject", () => {
  it("renames .codelineage to .cogit and fixes the .gitignore lines", async () => {
    const root = await tempDir();
    await mkdir(join(root, ".codelineage", "sessions"), { recursive: true });
    await writeFile(join(root, ".codelineage", "sessions", "s1.json"), '{"kept":true}\n');
    await writeFile(
      join(root, ".gitignore"),
      "node_modules/\n# codelineage\n/.codelineage/\n/.codelineage/state/\n/.cogit/other\n",
    );

    expect(await migrateProject(root)).toBe(true);
    expect(existsSync(join(root, ".codelineage"))).toBe(false);
    expect(await readFile(join(root, ".cogit", "sessions", "s1.json"), "utf8")).toBe(
      '{"kept":true}\n',
    );
    expect(await readFile(join(root, ".gitignore"), "utf8")).toBe(
      "node_modules/\n# cogit\n/.cogit/\n/.cogit/state/\n/.cogit/other\n",
    );

    // Idempotent: the second run has nothing left to do.
    expect(await migrateProject(root)).toBe(false);
  });

  it("leaves the old dir alone when the filesystem refuses the rename", async () => {
    const root = await tempDir();
    await mkdir(join(root, ".codelineage"), { recursive: true });
    await chmod(root, 0o555);
    try {
      expect(await migrateProject(root)).toBe(false);
      expect(existsSync(join(root, ".codelineage"))).toBe(true);
    } finally {
      await chmod(root, 0o755);
    }
  });

  it("touches nothing when both directories exist and warns once", async () => {
    const root = await tempDir();
    await mkdir(join(root, ".codelineage"), { recursive: true });
    await mkdir(join(root, ".cogit"), { recursive: true });
    await writeFile(join(root, ".gitignore"), "/.codelineage/\n");

    expect(await migrateProject(root)).toBe(false);
    expect(await migrateProject(root)).toBe(false);
    expect(existsSync(join(root, ".codelineage"))).toBe(true);
    expect(await readFile(join(root, ".gitignore"), "utf8")).toBe("/.codelineage/\n");
    const warnings = takeMigrationWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("both .codelineage/ and .cogit/ exist");
  });

  it("runs from resolveProjectRoot, so every command and hook picks it up", async () => {
    const root = await tempDir();
    await mkdir(join(root, ".codelineage"), { recursive: true });
    await atomicWriteJson(join(root, ".codelineage", "project.json"), {
      schema: 1,
      name: "p",
      epochs: [],
    });

    const resolved = await resolveProjectRoot(root);
    expect(resolved.root).toBe(root);
    expect(existsSync(join(root, ".cogit", "project.json"))).toBe(true);
    expect(existsSync(join(root, ".codelineage"))).toBe(false);
  });

  it("only rewrites whole path segments in .gitignore", () => {
    expect(renameGitignoreLines("/.codelineage/x\n/.cogitx/\n")).toBe("/.cogit/x\n/.cogitx/\n");
  });
});

describe("migrateGlobal", () => {
  it("moves the default config dir and rewrites registry paths inside it", async () => {
    const dir = await tempDir();
    const xdg = join(dir, "xdg");
    const oldBase = join(xdg, "codelineage");
    const newBase = join(xdg, "cogit");
    await mkdir(oldBase, { recursive: true });
    await atomicWriteJson(join(oldBase, "projects.json"), {
      schema: 1,
      projects: [
        { path: join(oldBase, "a-project"), name: "a", addedAt: "2026-10-21T10:00:00.000Z" },
      ],
    });
    const env = { XDG_CONFIG_HOME: xdg };

    expect(await migrateGlobal(env)).toBe(true);
    expect(existsSync(oldBase)).toBe(false);
    const registry = JSON.parse(await readFile(join(newBase, "projects.json"), "utf8"));
    expect(registry.projects[0].path).toBe(join(newBase, "a-project"));
    expect(await migrateGlobal(env)).toBe(false);
  });

  it("moves a registry it cannot parse without touching the file", async () => {
    const dir = await tempDir();
    const xdg = join(dir, "bad");
    await mkdir(join(xdg, "codelineage"), { recursive: true });
    await writeFile(join(xdg, "codelineage", "projects.json"), "not json\n");

    expect(await migrateGlobal({ XDG_CONFIG_HOME: xdg })).toBe(true);
    expect(await readFile(join(xdg, "cogit", "projects.json"), "utf8")).toBe("not json\n");
  });

  it("leaves registry entries outside the moved dir alone", async () => {
    const dir = await tempDir();
    const xdg = join(dir, "outside");
    await mkdir(join(xdg, "codelineage"), { recursive: true });
    const entries = [
      { path: "/elsewhere", name: "x" },
      { path: 7, name: "y" },
    ];
    await writeFile(
      join(xdg, "codelineage", "projects.json"),
      `${JSON.stringify({ schema: 1, projects: entries })}\n`,
    );

    expect(await migrateGlobal({ XDG_CONFIG_HOME: xdg })).toBe(true);
    const registry = JSON.parse(await readFile(join(xdg, "cogit", "projects.json"), "utf8"));
    expect(registry.projects).toEqual(entries);
  });

  it("keeps an explicit CODELINEAGE_HOME working and moves no default dir", async () => {
    const dir = await tempDir();
    const xdg = join(dir, "xdg");
    await mkdir(join(xdg, "codelineage"), { recursive: true });
    const env = { XDG_CONFIG_HOME: xdg, CODELINEAGE_HOME: join(dir, "custom") };

    expect(await migrateGlobal(env)).toBe(false);
    expect(existsSync(join(xdg, "codelineage"))).toBe(true);
  });

  it("warns instead of merging when both default dirs exist", async () => {
    const dir = await tempDir();
    const xdg = join(dir, "both");
    await mkdir(join(xdg, "codelineage"), { recursive: true });
    await mkdir(join(xdg, "cogit"), { recursive: true });

    expect(await migrateGlobal({ XDG_CONFIG_HOME: xdg })).toBe(false);
    const warnings = takeMigrationWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("both");
  });
});
