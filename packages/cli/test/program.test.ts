import { describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { createProgram } from "../src/program.js";

function run(args: string[]): string {
  let out = "";
  const program = createProgram()
    .exitOverride()
    .configureOutput({ writeOut: (s) => (out += s) });
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
    expect(run(["--help"])).toContain("Usage: codelineage");
  });
});
