import { defineConfig } from "tsup";

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
  // CJS deps bundled into ESM still call require() for node builtins
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __cl_createRequire } from "node:module";',
      "const require = __cl_createRequire(import.meta.url);",
    ].join("\n"),
  },
});
