import { describe, expect, it } from "vitest";
import { formatDate, formatTime } from "../src/format.js";

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
