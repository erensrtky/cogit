import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LineageViewModel } from "../../cli/src/view/model.js";
import type { SearchHit } from "../../cli/src/view/search.js";
import { type MapSearchState, SearchBox } from "../src/MapSearch.js";
import { declineOffer, meaningHits, mergeHits, offerDeclined } from "../src/meaningSearch.js";
import { branchOf, scopeHits } from "../src/searchScope.js";

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

describe("search scope", () => {
  const anchor = { sessionId: "s1", nodeId: "h1" };
  const make = (sessionId: string, messageId: string | null): SearchHit => ({
    ...hit(0),
    sessionId,
    messageId,
  });
  const hits = [make("s1", "h1"), make("s1", "h2"), make("s1", null), make("s2", "h3")];

  it("keeps every hit for All or with nothing open", () => {
    expect(scopeHits(hits, "all", anchor, null)).toHaveLength(4);
    expect(scopeHits(hits, "session", null, null)).toHaveLength(4);
  });

  it("keeps the open session's hits, then only its branch's messages", () => {
    expect(scopeHits(hits, "session", anchor, null).map((h) => h.messageId)).toEqual([
      "h1",
      "h2",
      null,
    ]);
    expect(
      scopeHits(hits, "branch", anchor, { ids: new Set(["h1"]) }).map((h) => h.messageId),
    ).toEqual(["h1"]);
    // No branch to narrow to: the session's hits.
    expect(scopeHits(hits, "branch", anchor, null)).toHaveLength(3);
  });

  it("finds the branch an open message sits in", () => {
    const model = {
      sessions: [
        {
          sessionId: "s1",
          title: "One",
          messages: [
            { id: "h1", kind: "message", title: "First", parent: null, at: "2026-10-21T10:00:00Z" },
            {
              id: "h2",
              kind: "message",
              title: "Second",
              parent: "h1",
              at: "2026-10-21T10:01:00Z",
            },
          ],
        },
      ],
    } as unknown as LineageViewModel;
    expect([...(branchOf(model, anchor)?.ids ?? [])]).toEqual(["h1", "h2"]);
    expect(branchOf(model, { sessionId: "s1", nodeId: null })).toBeNull();
    expect(branchOf(model, { sessionId: "nope", nodeId: "h1" })).toBeNull();
    expect(branchOf(model, { sessionId: "s1", nodeId: "h9" })).toBeNull();
  });

  it("shows the scope buttons only while something is open, with the hint to match", () => {
    const render = (scope: Parameters<typeof SearchBox>[0]["scope"]) =>
      renderToStaticMarkup(
        createElement(SearchBox, {
          value: "",
          state: state(),
          onQuery: () => {},
          onStep: () => {},
          onClear: () => {},
          scope,
        }),
      );
    const closed = render(null);
    expect(closed).not.toContain("map-search-scope");
    expect(closed).toContain('placeholder="Search words, or paste a message hash"');
    const open = render({ current: "session", session: "One", branch: null, onScope: () => {} });
    expect(open).toContain("This session");
    expect(open).toContain('placeholder="Search this session: words or a message hash"');
    // A session with no message open has no branch to narrow to.
    expect(open).toMatch(/disabled=""[^>]*>This branch/);
    expect(
      render({ current: "branch", session: "One", branch: "First", onScope: () => {} }),
    ).toContain('placeholder="Search this branch: words or a message hash"');
  });
});

describe("search by meaning on the map", () => {
  const model = {
    sessions: [
      {
        sessionId: "s1",
        title: "",
        messages: [
          { id: "h1", kind: "message", title: "Fix login", label: "m1", at: "2026-10-21" },
        ],
      },
    ],
  } as unknown as LineageViewModel;

  it("turns the server's hits into map hits and keeps word hits after them", () => {
    const meaning = meaningHits(model, [
      { sessionId: "s1", messageId: "h1", score: 0.7 },
      { sessionId: "s1", messageId: "gone", score: 0.6 },
      { sessionId: "nope", messageId: "h1", score: 0.5 },
    ]);
    expect(meaning).toEqual([
      {
        sessionId: "s1",
        sessionTitle: "s1",
        messageId: "h1",
        label: "m1",
        at: "2026-10-21",
        field: "meaning",
        excerpt: "Fix login",
      },
    ]);
    const words = [
      { ...hit(0), sessionId: "s1", messageId: "h1" },
      { ...hit(1), sessionId: "s1", messageId: "h2" },
    ];
    expect(mergeHits(meaning, words).map((h) => [h.messageId, h.field])).toEqual([
      ["h1", "meaning"],
      ["h2", "title"],
    ]);
  });

  it("remembers a no to the offer, and treats blocked storage as not asked", () => {
    const items = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => void items.set(key, value),
      },
    };
    expect(offerDeclined()).toBe(false);
    declineOffer();
    expect(offerDeclined()).toBe(true);
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    };
    expect(offerDeclined()).toBe(false);
    expect(() => declineOffer()).not.toThrow();
    delete (globalThis as { window?: unknown }).window;
    expect(offerDeclined()).toBe(false);
  });

  it("offers it once, shows why it cannot run, and says how hits are ranked", () => {
    const render = (meaning: Parameters<typeof SearchBox>[0]["meaning"]) =>
      renderToStaticMarkup(
        createElement(SearchBox, {
          value: "login",
          state: state(),
          onQuery: () => {},
          onStep: () => {},
          onClear: () => {},
          meaning,
          onMeaning: () => {},
        }),
      );
    expect(render(null)).not.toContain("map-search-meaning");
    expect(render({ offer: true, note: null, ranked: false })).toContain("Turn on");
    expect(render({ offer: false, note: "Run `ollama pull bge-m3`.", ranked: false })).toContain(
      "ollama pull bge-m3",
    );
    expect(render({ offer: false, note: null, ranked: true })).toContain(
      "Closest in meaning first",
    );
    expect(render({ offer: false, note: null, ranked: false })).not.toContain("map-search-meaning");
  });
});
