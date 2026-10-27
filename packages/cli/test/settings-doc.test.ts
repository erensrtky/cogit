import { describe, expect, it } from "vitest";
import { settingsMarkdown } from "../src/view/settings-doc.js";

describe("the settings guide", () => {
  // `npx vitest run packages/cli/test/settings-doc.test.ts -u` rewrites it after a change.
  it("is generated from the settings texts", async () => {
    await expect(settingsMarkdown()).toMatchFileSnapshot("../../../docs/guide/settings.md");
  });
});
