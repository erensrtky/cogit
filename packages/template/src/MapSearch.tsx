import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef } from "react";
import type { HashRefResult, SearchHit } from "../../cli/src/view/search.js";

/**
 * The map's search box (Story 8.14): Ctrl/Cmd+F focuses it while the map has the
 * page (a second press lets the browser's own find through), matching messages
 * are highlighted and their sessions open, ↑/↓ (or Enter / Shift+Enter) step
 * through the hits, Esc clears. A pasted message hash jumps like `show`.
 */

/** What App passes down to Graph: the hits and where the user is in them. */
export interface MapSearchState {
  hits: SearchHit[];
  /** Index of the active hit in `hits`. */
  active: number;
  /** Bumped whenever the view should move to the active hit (or the hash). */
  step: number;
  /** A hash the query resolved to, when the query looks like one. */
  hash: HashRefResult | null;
}

export function SearchBox({
  value,
  state,
  onQuery,
  onStep,
  onClear,
}: {
  /** The text in the box; the hits in `state` may lag behind it while scanning. */
  value: string;
  state: MapSearchState;
  onQuery: (query: string) => void;
  onStep: (delta: number) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl/Cmd+F focuses the box; while it is focused the browser keeps its own
  // find, so a second press still offers the page's native search.
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "f") return;
      if (document.activeElement === inputRef.current) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onClear();
      inputRef.current?.blur();
      return;
    }
    if (state.hash !== null) return;
    if (event.key === "Enter") {
      event.preventDefault();
      onStep(event.shiftKey ? -1 : 1);
    }
  }

  const count = state.hits.length;
  const index = Math.min(state.active, count - 1);
  const status =
    state.hash !== null
      ? state.hash.kind === "ok"
        ? "1 / 1"
        : state.hash.kind === "ambiguous"
          ? `${state.hash.count} matches`
          : "no match"
      : value.trim() === ""
        ? ""
        : count === 0
          ? "0 hits"
          : `${index + 1} / ${count}`;
  const hint =
    state.hash !== null
      ? state.hash.kind === "ok"
        ? `→ ${state.hash.label ?? state.hash.messageId} · ${state.hash.title}`
        : state.hash.kind === "ambiguous"
          ? "several messages match — type more of the hash"
          : "no recorded message has that hash"
      : count === 0 && value.trim() !== ""
        ? "no matches"
        : null;

  return (
    <div className="map-search" role="search">
      <div className="map-search-row">
        <input
          ref={inputRef}
          type="search"
          className="map-search-input"
          placeholder="Search the lineage"
          aria-label="Search the lineage"
          value={value}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {status === "" ? null : <span className="map-search-count">{status}</span>}
        {state.hash === null && count > 0 ? (
          <>
            <button
              type="button"
              className="map-search-step"
              aria-label="Previous hit"
              title="Previous hit (Shift+Enter)"
              disabled={index <= 0}
              onClick={() => onStep(-1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="map-search-step"
              aria-label="Next hit"
              title="Next hit (Enter)"
              disabled={index >= count - 1}
              onClick={() => onStep(1)}
            >
              ↓
            </button>
          </>
        ) : null}
      </div>
      {hint === null ? null : <p className="map-search-hint">{hint}</p>}
    </div>
  );
}
