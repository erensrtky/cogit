import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SearchHit } from "../../cli/src/view/search.js";
import { type MapSearchState, SearchBox } from "../src/MapSearch.js";

const hit = (index: number): SearchHit => ({
  sessionId: "s1",
  sessionTitle: "One",
  messageId: `h${String(index).padStart(12, "0")}`,
  label: `m${index + 1}`,
  at: "2026-10-21T10:00:00.000Z",
  field: "title",
  excerpt: `hit ${index}`,
});

function state(over: Partial<MapSearchState> = {}): MapSearchState {
  return { hits: [], active: 0, step: 0, hash: null, ...over };
}

function render(model: MapSearchState, value = "parser"): string {
  return renderToStaticMarkup(
    createElement(SearchBox, {
      value,
      state: model,
      onQuery: () => {},
      onStep: () => {},
      onClear: () => {},
    }),
  );
}

describe("SearchBox", () => {
  it("shows the position in the hit list and its buttons", () => {
    const html = render(state({ hits: [hit(0), hit(1), hit(2), hit(3), hit(4)], active: 2 }));
    expect(html).toContain("3 / 5");
    expect(html).toContain('aria-label="Previous hit"');
    expect(html).toContain('aria-label="Next hit"');
    expect(html).not.toContain("disabled");
  });

  it("disables the arrows at the ends and reports no hits", () => {
    const first = render(state({ hits: [hit(0), hit(1)], active: 0 }));
    expect(first).toMatch(/<button[^>]*aria-label="Previous hit"[^>]*disabled/);
    expect(first).not.toMatch(/<button[^>]*aria-label="Next hit"[^>]*disabled/);

    const none = render(state({ hits: [] }));
    expect(none).toContain("0 hits");
    expect(none).toContain("no matches");
    expect(none).not.toContain('aria-label="Next hit"');
  });

  it("shows a pasted hash and says when it is ambiguous or unknown", () => {
    const ok = render(
      state({
        hash: {
          kind: "ok",
          sessionId: "s1",
          messageId: "h222222222222",
          label: "m3",
          title: "Third",
        },
      }),
    );
    expect(ok).toContain("1 / 1");
    expect(ok).toContain("→ m3 · Third");
    // A hash jump needs no arrows, even though the counter is shown.
    expect(ok).not.toContain('aria-label="Next hit"');

    const ambiguous = render(state({ hash: { kind: "ambiguous", count: 2 } }), "h111111");
    expect(ambiguous).toContain("2 matches");
    expect(ambiguous).toContain("type more of the hash");

    const none = render(state({ hash: { kind: "none" } }), "h999999");
    expect(none).toContain("no recorded message has that hash");
  });

  it("stays quiet with an empty query", () => {
    const html = render(state(), "");
    expect(html).not.toContain("map-search-count");
    expect(html).not.toContain("map-search-hint");
  });
});
