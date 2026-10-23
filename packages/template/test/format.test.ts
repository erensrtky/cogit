import { describe, expect, it } from "vitest";
import { cardMeta, cardText, formatDate, formatTime, kindLabel } from "../src/format.js";

describe("format", () => {
  it("shows a placeholder for a missing time and an unparseable value as-is", () => {
    expect(formatTime(null)).toBe("—");
    expect(formatDate(null)).toBe("—");
    expect(formatTime("soon")).toBe("soon");
    expect(formatDate("soon")).toBe("soon");
  });

  it("renders a short date without the time of day", () => {
    const iso = "2026-10-21T10:00:00.000Z";
    const expected = new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    expect(formatDate(iso)).toBe(expected);
    expect(formatDate(iso)).not.toContain(":");
  });
});

describe("kindLabel", () => {
  it("shows phases as topics and keeps the other kinds", () => {
    expect(kindLabel("phase")).toBe("topic");
    expect(kindLabel("decision")).toBe("decision");
  });
});

describe("card text", () => {
  it("shows a decision's reason and other kinds' summary", () => {
    expect(cardText({ kind: "decision", summary: "s", why: "w" })).toBe("w");
    expect(cardText({ kind: "decision", summary: "s" })).toBe("s");
    expect(cardText({ kind: "step", summary: "s", why: "w" })).toBe("s");
  });

  it("sums up who decided, commits and rejected options", () => {
    expect(cardMeta({})).toBe("");
    expect(cardMeta({ decidedBy: "agreed", commits: ["a"], alternatives: [1, 2] })).toBe(
      "agreed · 1 commit · 2 options rejected",
    );
    expect(cardMeta({ decidedBy: "user", commits: ["a", "b"], alternatives: [1] })).toBe(
      "you decided · 2 commits · 1 option rejected",
    );
  });
});
