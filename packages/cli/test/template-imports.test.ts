import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const templateSrc = join(root, "packages/template/src");

// Runtime imports only: `import type` is erased and loads nothing in the page.
function relativeImports(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [
    ...source.matchAll(/^(?:import|export) (?!type )[^;]*?from "(\.{1,2}\/[^"]+)\.js"/gm),
  ].map((match) => resolve(dirname(file), `${match[1]}.ts`));
}

describe("template imports", () => {
  // The build stubs Node modules out, but the template's dev server cannot load
  // a file that imports one: `node:path` in view/switcher.ts left it blank.
  it("reaches no Node module through the CLI files the page shares", () => {
    const pending = readdirSync(templateSrc, { recursive: true, encoding: "utf8" })
      .filter((name) => /\.tsx?$/.test(name))
      .flatMap((name) => relativeImports(join(templateSrc, name)))
      .filter((file) => file.includes(join("packages", "cli", "src")));
    const seen = new Set<string>();
    const offenders: string[] = [];
    while (pending.length > 0) {
      const file = pending.pop() as string;
      if (seen.has(file)) continue;
      seen.add(file);
      if (/from "node:/.test(readFileSync(file, "utf8"))) offenders.push(file);
      pending.push(...relativeImports(file));
    }
    expect(seen.size).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
