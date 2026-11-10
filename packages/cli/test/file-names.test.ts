import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("file names", () => {
  // macOS and Windows ignore case, and `./x.js` finds x.ts or x.tsx, so two
  // such files are one there: `Graph.tsx` beside `graph.ts` broke the build.
  it("keeps every source module distinct on a case-blind file system", () => {
    const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n");
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const file of files.filter(Boolean)) {
      const key = file.replace(/\.(tsx?|jsx?|mjs)$/, "").toLowerCase();
      const other = seen.get(key);
      if (other === undefined) seen.set(key, file);
      else clashes.push(`${other} / ${file}`);
    }
    expect(clashes).toEqual([]);
  });
});
