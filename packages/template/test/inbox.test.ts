import { describe, expect, it } from "vitest";
import { projectColour } from "../src/Inbox.js";

describe("projectColour", () => {
  it("gives a project the same lane colour every time", () => {
    expect(projectColour("/home/a/cogit")).toBe(projectColour("/home/a/cogit"));
  });

  it("stays within the six lane colours", () => {
    for (const path of ["/a", "/home/a/cogit", "/home/a/seo-toolkit", "", "/x/y/z"]) {
      const colour = projectColour(path);
      expect(colour).toBeGreaterThanOrEqual(0);
      expect(colour).toBeLessThan(6);
    }
  });

  it("tells different projects apart", () => {
    const colours = new Set(["/p/one", "/p/two", "/p/three", "/p/four"].map(projectColour));
    expect(colours.size).toBeGreaterThan(1);
  });
});
