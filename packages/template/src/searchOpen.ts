/**
 * Sessions the map search opened, kept apart from the ones the user opened: the
 * search opens a match's session so its highlights show, closes it again once it
 * no longer matches, and never stores it as open for the next reload.
 */
export interface SearchOpen {
  /** Every open session, the search's included. */
  open: ReadonlySet<string>;
  /** The open sessions only the search opened. */
  bySearch: ReadonlySet<string>;
}

/** Opens the sessions with a hit and closes the ones an earlier search opened that no longer match. */
export function applySearchHits(state: SearchOpen, hits: readonly string[]): SearchOpen {
  const matching = new Set(hits);
  const open = new Set(state.open);
  const bySearch = new Set<string>();
  for (const id of state.bySearch) {
    if (matching.has(id)) bySearch.add(id);
    else open.delete(id);
  }
  for (const id of matching) {
    if (open.has(id)) continue;
    open.add(id);
    bySearch.add(id);
  }
  return { open, bySearch };
}

/** The open sessions a reload should open again: the user's, not the search's. */
export function storedOpen(state: SearchOpen): string[] {
  return [...state.open].filter((id) => !state.bySearch.has(id));
}
