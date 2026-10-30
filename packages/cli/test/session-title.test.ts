import { describe, expect, it } from "vitest";
import { sessionTitle } from "../src/view/lineage.js";

describe("sessionTitle", () => {
  const nodes = [
    { kind: "phase", title: "An old topic node" },
    { kind: "message", title: " İroni postmodern " },
    { kind: "message", title: "Later message" },
  ] as Parameters<typeof sessionTitle>[0]["nodes"];

  it("keeps the session's own title", () => {
    expect(sessionTitle({ title: " Release 0.22 ", nodes })).toBe("Release 0.22");
  });

  it("falls back to the first message's title when the recorder left it empty", () => {
    expect(sessionTitle({ title: "  ", nodes })).toBe("İroni postmodern");
  });

  it("stays empty without any message", () => {
    expect(sessionTitle({ title: "", nodes: [] })).toBe("");
  });
});
