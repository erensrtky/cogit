import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { codexCli, codexSkill, run } from "../../../scripts/codex-skill.mjs";
import { tempDir } from "./helpers.js";

const source = () => readFile(new URL("../skills/record/SKILL.md", import.meta.url), "utf8");

describe("Codex's record skill", () => {
  it("turns Claude Code's variables into what a Codex shell has", async () => {
    const text: string = codexSkill(await source(), "1.5.0");
    const cli = "${CODEX_HOME:-$HOME/.codex}/plugins/cache/cogit/cogit/1.5.0/dist/cli.js";
    expect(codexCli("1.5.0")).toBe(cli);
    // Codex fills in nothing and runs no `!` line: none may be left.
    expect(text).not.toMatch(/CLAUDE_|^!`|allowed-tools/m);
    expect(text).toContain(`node "${cli}" session show "$CODEX_THREAD_ID" -C .`);
    expect(text).toContain("`sessionId`: always the record's `sessionId`.");
    expect(text).toContain("with your file editing tool");
    expect(text).toContain(`node "${cli}" session write -C "<dir from the record>"`);
    // Everything else stays as Claude Code's skill says it.
    expect(text).toContain("## One node per user message");
    expect(text.startsWith("---\nname: record\n")).toBe(true);
  });

  it("refuses a skill that no longer has a part it rewrites", async () => {
    const text = await source();
    expect(() => codexSkill(text.replace(/^allowed-tools:.*\n/m, ""), "1")).toThrow(
      /allowed-tools/,
    );
    expect(() => codexSkill(text.replace(/^!`.*`$/m, ""), "1")).toThrow(/`!` command/);
    expect(() => codexSkill(text.replace("with the Write tool", "with Write"), "1")).toThrow(
      /no longer in SKILL.md/,
    );
    expect(() => codexSkill(`${text}\n\${CLAUDE_OTHER}\n`, "1")).toThrow(
      /\$\{CLAUDE_OTHER\} left in the text/,
    );
  });

  it("writes the copy for the package's version into dist", async () => {
    const pkg = await tempDir();
    await mkdir(join(pkg, "skills", "record"), { recursive: true });
    await writeFile(join(pkg, "package.json"), JSON.stringify({ version: "2.0.0" }));
    await writeFile(join(pkg, "skills", "record", "SKILL.md"), await source());
    const target: string = run(pkg);
    expect(target).toBe(join(pkg, "dist", "codex-skills", "record", "SKILL.md"));
    expect(await readFile(target, "utf8")).toContain("/cogit/cogit/2.0.0/dist/cli.js");
  });
});
