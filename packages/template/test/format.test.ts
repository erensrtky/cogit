import { describe, expect, it } from "vitest";
import { formatDate, formatTime, kindLabel } from "../src/format.js";

describe("format", () => {
  it("shows a placeholder for a missing time and an unparseable value as-is", () => {
    expect(formatTime(null)).toBe("—");
    expect(formatDate(null)).toBe("—");
    expect(formatTime("soon")).toBe("soon");
    expect(formatDate("soon")).toBe("soon");
  });

  it("renders a short date without the time of day", () => {
    // A local time, so the expectation does not depend on the machine's zone.
    const iso = new Date(2026, 9, 21, 10, 0).toISOString();
    expect(formatDate(iso)).toBe("10-21");
  });

  it("renders a full time like the map rows, not in the browser's locale", () => {
    const iso = new Date(2026, 9, 30, 21, 9, 30).toISOString();
    expect(formatTime(iso)).toBe("2026-10-30 21:09");
  });
});

describe("kindLabel", () => {
  it("shows phases as topics and keeps the other kinds", () => {
    expect(kindLabel("phase")).toBe("topic");
    expect(kindLabel("decision")).toBe("decision");
  });
});
