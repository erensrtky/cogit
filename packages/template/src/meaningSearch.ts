import type { LineageViewModel } from "../../cli/src/view/model.js";
import type { SearchHit } from "../../cli/src/view/search.js";
import type { MeaningHit } from "./data.js";

/**
 * Search by meaning on the map: the server's closest messages become ordinary
 * hits, closest first, and the word matches they did not already cover follow.
 * The box steps through one list either way.
 */

/** The meaning hits as map hits; a message no longer in the model is skipped. */
export function meaningHits(model: LineageViewModel, hits: readonly MeaningHit[]): SearchHit[] {
  const out: SearchHit[] = [];
  for (const hit of hits) {
    const session = model.sessions.find((candidate) => candidate.sessionId === hit.sessionId);
    const node = session?.messages.find((candidate) => candidate.id === hit.messageId);
    if (session === undefined || node === undefined) continue;
    out.push({
      sessionId: session.sessionId,
      sessionTitle: session.title || session.sessionId,
      messageId: node.id,
      label: node.label ?? null,
      at: node.at ?? null,
      field: "meaning",
      excerpt: node.title,
    });
  }
  return out;
}

/** Meaning hits first, then the word hits not already among them. */
export function mergeHits(meaning: readonly SearchHit[], words: readonly SearchHit[]): SearchHit[] {
  const seen = new Set(meaning.map((hit) => `${hit.sessionId}:${hit.messageId}`));
  return [...meaning, ...words.filter((hit) => !seen.has(`${hit.sessionId}:${hit.messageId}`))];
}

const OFFER_KEY = "cogit.meaningOffer";

/** Whether the viewer said no to the search-by-meaning offer; storage that fails counts as not. */
export function offerDeclined(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(OFFER_KEY) === "no";
  } catch {
    return false;
  }
}

/** Remembers the viewer's no, so the offer does not come back. */
export function declineOffer(): void {
  try {
    window.localStorage.setItem(OFFER_KEY, "no");
  } catch {
    // Without storage the offer only comes back on the next page.
  }
}
