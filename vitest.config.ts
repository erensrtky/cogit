import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**"],
      exclude: ["packages/cli/src/cli.ts"],
      reporter: ["text-summary", "lcov"],
    },
  },
});
