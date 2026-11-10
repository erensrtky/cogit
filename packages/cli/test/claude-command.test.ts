import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claudeCommand, runClaude } from "../src/commands/backfill.js";
import { tempDir } from "./helpers.js";

let root: string;
beforeEach(async () => {
  root = await tempDir();
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("claudeCommand", () => {
  it("starts plain claude, which finds claude.exe on Windows too", () => {
    expect(claudeCommand(["-p", "--model", "haiku"], false)).toEqual({
      command: "claude",
      args: ["-p", "--model", "haiku"],
      verbatim: false,
    });
  });

  it("runs the claude.cmd shim through cmd.exe, which Node no longer spawns bare", () => {
    expect(claudeCommand(["-p", "--model", "claude-opus-5-5[1m]"], true, {})).toEqual({
      command: "cmd.exe",
      args: ["/d", "/s", "/c", '"claude.cmd -p --model claude-opus-5-5[1m]"'],
      verbatim: true,
    });
    expect(claudeCommand(["-p"], true, { ComSpec: "C:\\Windows\\cmd.exe" }).command).toBe(
      "C:\\Windows\\cmd.exe",
    );
  });

  it("refuses an argument cmd.exe would read as syntax", () => {
    for (const model of ["haiku & calc", "a|b", 'x"y', "%PATH%", "two words", ""]) {
      expect(() => claudeCommand(["--model", model], true, {})).toThrow(/claude\.cmd safely/);
    }
  });
});

describe("runClaude on Windows", () => {
  const platform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, "platform", { value: platform });
  });

  // Linux and macOS stand in for Windows here; the next test runs the real thing.
  it.skipIf(platform === "win32")(
    "falls back to the claude.cmd shim when plain claude is missing",
    async () => {
      const bin = join(root, "bin");
      await mkdir(bin, { recursive: true });
      // Stands in for cmd.exe: notes what it was asked to run and answers.
      const shell = join(bin, "fake-cmd");
      const argv = join(root, "argv.json");
      await writeFile(
        shell,
        `#!${process.execPath}\nrequire("node:fs").writeFileSync(${JSON.stringify(argv)}, JSON.stringify(process.argv.slice(2)));\nprocess.stdin.resume();\nprocess.stdin.on("end", () => process.stdout.write("answer"));\n`,
      );
      await chmod(shell, 0o755);
      Object.defineProperty(process, "platform", { value: "win32" });
      const env = { PATH: root, ComSpec: shell };
      expect(await runClaude("hi", "haiku", env)).toBe("answer");
      const args = JSON.parse(await readFile(argv, "utf8")) as string[];
      expect(args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
      expect(args.join(" ")).toContain("claude.cmd -p --safe-mode");
    },
  );

  it.runIf(platform === "win32")("runs a real claude.cmd through the real cmd.exe", async () => {
    const bin = join(root, "bin");
    await mkdir(bin, { recursive: true });
    // Reads the prompt off stdin, as claude does, then answers.
    await writeFile(join(bin, "claude.cmd"), "@echo off\r\nmore >nul\r\necho answer %*\r\n");
    const env = { PATH: `${bin};${process.env.SystemRoot ?? "C:\\Windows"}\\System32` };
    const out = await runClaude("hi", "haiku", env);
    expect(out).toContain("answer -p --safe-mode");
    expect(out).toContain("--model haiku");
  });

  it.skipIf(platform === "win32")("says claude is missing when neither is there", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const env = { PATH: root, ComSpec: join(root, "no-such-cmd") };
    await expect(runClaude("hi", "haiku", env)).rejects.toThrow(/could not run claude/);
  });
});
