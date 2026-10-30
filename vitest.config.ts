import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/**
 * tsup bundles the template with the `text` loader. Vite would hand a `.html`
 * import to its page plugin, so tests load the same file as a string module.
 */
const templateAsText: Plugin = {
  name: "cogit-template-as-text",
  enforce: "pre",
  load(id) {
    const file = id.split("?")[0] ?? "";
    if (!file.endsWith(".html") || !file.includes("/packages/template/dist/")) return null;
    return `export default ${JSON.stringify(readFileSync(file, "utf8"))};`;
  },
};

export default defineConfig({
  plugins: [templateAsText],
  test: {
    include: ["packages/*/test/**/*.test.{ts,tsx}"],
    globalSetup: ["./packages/cli/test/global-setup.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**", "scripts/**"],
      exclude: ["packages/cli/src/cli.ts"],
      reporter: ["text-summary", "lcov"],
    },
  },
});
