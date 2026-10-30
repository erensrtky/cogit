import type { Command } from "commander";
import { describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { createProgram } from "../src/program.js";

function run(args: string[]): string {
  let out = "";
  const program = createProgram();
  const writeOut = (s: string): void => {
    out += s;
  };
  // Help of a subcommand writes through that command's own output.
  const configure = (command: Command): void => {
    command.exitOverride().configureOutput({ writeOut });
    for (const sub of command.commands) configure(sub);
  };
  configure(program);
  try {
    program.parse(args, { from: "user" });
  } catch {
    // commander throws on --version/--help under exitOverride
  }
  return out;
}

describe("createProgram", () => {
  it("prints the package version", () => {
    expect(run(["--version"]).trim()).toBe(pkg.version);
  });

  it("names the binary in help", () => {
    expect(run(["--help"])).toContain("Usage: cogit");
  });

  it("groups the top-level commands for reading (Story 10.2)", () => {
    const help = run(["--help"]);
    for (const heading of ["Read:", "Map:", "Set up:", "Agent:"]) expect(help).toContain(heading);
    const order = ["Read:", "Map:", "Set up:", "Agent:"].map((heading) => help.indexOf(heading));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(help).toContain("Docs: https://github.com/erensrtky/cogit#readme");
  });

  it("gives every user-facing command an examples block (Story 10.2)", () => {
    const commands = [
      "init",
      "build",
      "blame",
      "why",
      "log",
      "show",
      "search",
      "pr",
      "open",
      "config",
      "hooks",
      "session",
      "backfill",
      "hook",
    ];
    for (const command of commands) {
      const help = run([command, "--help"]);
      expect(help, command).toContain("Examples:");
      expect(help, command).toContain(`$ cogit ${command}`);
    }
  });
});
