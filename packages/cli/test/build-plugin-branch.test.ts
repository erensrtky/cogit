import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { run, stagePlugin, writePluginBranch } from "../../../scripts/build-plugin-branch.mjs";
import { tempDir } from "./helpers.js";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/** A repository shaped like this one, with a build in packages/cli/dist. */
async function builtRepo(): Promise<string> {
  const root = await tempDir();
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Test");
  git(root, "config", "user.email", "test@example.com");
  // A rule like the repository's own must not keep dist/ off the branch.
  await writeFile(join(root, ".gitignore"), "dist/\n");
  const files: Record<string, string> = {
    VERSION: "1.2.3\n",
    "README.md": "readme\n",
    LICENSE: "licence\n",
    "packages/cli/.claude-plugin/plugin.json": '{ "name": "cogit", "version": "1.2.3" }\n',
    "packages/cli/dist/cli.js": "built\n",
    "packages/cli/hooks/hooks.json": "{}\n",
    "packages/cli/skills/record/SKILL.md": "skill\n",
    "packages/cli/src/cli.ts": "source\n",
  };
  for (const [rel, text] of Object.entries(files)) {
    await mkdir(join(root, rel, ".."), { recursive: true });
    await writeFile(join(root, rel), text);
  }
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  return root;
}

describe("build-plugin-branch", () => {
  it("refuses to stage a plugin that was not built", async () => {
    const root = await tempDir();
    expect(() => stagePlugin(root, join(root, "out"))).toThrow(/npm run build/);
  });

  it("commits only the built plugin onto its own branch, leaving main alone", async () => {
    const root = await builtRepo();
    const head = git(root, "rev-parse", "HEAD");

    const first = writePluginBranch(root);
    expect(first).toMatchObject({ changed: true, version: "1.2.3" });
    expect(git(root, "ls-tree", "-r", "--name-only", "plugin").split("\n")).toEqual([
      ".claude-plugin/plugin.json",
      "LICENSE",
      "README.md",
      "dist/cli.js",
      "hooks/hooks.json",
      "skills/record/SKILL.md",
    ]);
    expect(git(root, "log", "--format=%s", "plugin")).toBe("plugin v1.2.3");
    // An orphan branch: nothing of main's history comes along.
    expect(git(root, "rev-list", "--count", "plugin")).toBe("1");
    expect(git(root, "rev-parse", "HEAD")).toBe(head);
    expect(git(root, "status", "--porcelain")).toBe("");

    // The same build adds nothing; a new one adds a commit on top.
    expect(writePluginBranch(root)).toEqual({ ...first, changed: false });
    await writeFile(join(root, "packages/cli/dist/cli.js"), "rebuilt\n");
    const lines: string[] = [];
    const next = run((line: string) => lines.push(line), root);
    expect(next.changed).toBe(true);
    expect(git(root, "rev-parse", "plugin^")).toBe(first.commit);
    expect(git(root, "show", "plugin:dist/cli.js")).toBe("rebuilt");
    expect(lines).toEqual([`plugin: v1.2.3 at ${next.commit.slice(0, 7)}`]);

    run((line: string) => lines.push(line), root);
    expect(lines[1]).toBe(`plugin: v1.2.3 unchanged at ${next.commit.slice(0, 7)}`);
  });
});
