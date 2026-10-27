import { describe, expect, it } from "vitest";
import { parseSubject, splitPath, typeColour } from "../src/codeRefs.js";

describe("parseSubject", () => {
  it("splits a Conventional Commits subject into type, scope and text", () => {
    expect(parseSubject("feat(map): open a map from its card")).toEqual({
      type: "feat",
      scope: "map",
      breaking: false,
      text: "open a map from its card",
    });
  });

  it("reads a subject without a scope and a breaking mark", () => {
    expect(parseSubject("fix!: drop the old flag")).toEqual({
      type: "fix",
      breaking: true,
      text: "drop the old flag",
    });
  });

  it("keeps any other subject whole", () => {
    expect(parseSubject("Merge branch 'main'")).toEqual({
      breaking: false,
      text: "Merge branch 'main'",
    });
  });
});

describe("typeColour", () => {
  it("colours the common types and leaves the rest neutral", () => {
    expect(typeColour("feat")).toBe(1);
    expect(typeColour("fix")).toBe(5);
    expect(typeColour("chore")).toBeUndefined();
  });
});

describe("splitPath", () => {
  it("splits a path into its folder and file name", () => {
    expect(splitPath("packages/template/src/Graph.tsx")).toEqual({
      dir: "packages/template/src/",
      name: "Graph.tsx",
    });
  });

  it("has no folder at the repository root", () => {
    expect(splitPath("README.md")).toEqual({ dir: "", name: "README.md" });
  });
});
