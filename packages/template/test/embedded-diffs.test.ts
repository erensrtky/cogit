import { describe, expect, it } from "vitest";
import type { PageModel } from "../../cli/src/view/model.js";
import { embeddedDiff, hasEmbeddedDiff, rememberEmbeddedDiffs } from "../src/data.js";

function page(over: Record<string, unknown>): PageModel {
  return { kind: "lineage", ...over } as unknown as PageModel;
}

describe("embedded diffs", () => {
  it("answers a saved page's rows from its own patches", () => {
    rememberEmbeddedDiffs(
      page({ diffs: { abc1234: { "": "the whole commit", "a.ts": "one file" } } }),
    );
    expect(embeddedDiff("abc1234")).toBe("the whole commit");
    expect(embeddedDiff("abc1234", "a.ts")).toBe("one file");
  });

  it("says nothing for a commit or file the page does not carry", () => {
    rememberEmbeddedDiffs(page({ diffs: { abc1234: { "": "the whole commit" } } }));
    expect(embeddedDiff("abc1234", "b.ts")).toBeUndefined();
    expect(hasEmbeddedDiff("def5678")).toBe(false);
  });

  it("keeps the rows closed on a page built without diffs", () => {
    rememberEmbeddedDiffs(page({}));
    expect(hasEmbeddedDiff("abc1234")).toBe(false);
  });
});
