import { describe, expect, it } from "vitest";
import { applySearchHits, storedOpen } from "../src/searchOpen.js";

const state = (open: string[], bySearch: string[] = []) => ({
  open: new Set(open),
  bySearch: new Set(bySearch),
});

describe("applySearchHits", () => {
  it("opens a matching session and remembers the search opened it", () => {
    const next = applySearchHits(state(["a"]), ["a", "b"]);
    expect([...next.open].sort()).toEqual(["a", "b"]);
    expect([...next.bySearch]).toEqual(["b"]);
  });

  it("closes a session the search opened once it stops matching, not the user's", () => {
    const next = applySearchHits(state(["a", "b", "c"], ["b", "c"]), ["c"]);
    expect([...next.open].sort()).toEqual(["a", "c"]);
    expect([...next.bySearch]).toEqual(["c"]);
  });

  it("closes every search-opened session when the search is cleared", () => {
    const next = applySearchHits(state(["a", "b"], ["b"]), []);
    expect([...next.open]).toEqual(["a"]);
    expect(next.bySearch.size).toBe(0);
  });
});

describe("storedOpen", () => {
  it("stores only the sessions the user opened", () => {
    expect(storedOpen(state(["a", "b"], ["b"]))).toEqual(["a"]);
  });
});
