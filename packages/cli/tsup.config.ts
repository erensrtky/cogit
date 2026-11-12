import { copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { defineConfig } from "tsup";
// @ts-expect-error plain ESM script without types
import { run as writeCodexSkill } from "../../scripts/codex-skill.mjs";

export default defineConfig({
  entry: { cli: "src/cli.ts" },
  format: ["esm"],
  platform: "node",
  target: "node22",
  bundle: true,
  noExternal: [/.*/],
  clean: true,
  // The template HTML ships inside the bundle so dist/cli.js is self-contained.
  loader: { ".html": "text" },
  // Mermaid is too big for every map; the server hands this copy to the page.
  onSuccess: async () => {
    const source = createRequire(import.meta.url).resolve("mermaid/dist/mermaid.min.js");
    await copyFile(source, "dist/mermaid.min.js");
    // Codex fills in no variable of Claude Code's skill text; it gets its own copy.
    writeCodexSkill(".");
  },
  // CJS deps bundled into ESM still call require() for node builtins
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __cl_createRequire } from "node:module";',
      "const require = __cl_createRequire(import.meta.url);",
    ].join("\n"),
  },
});
