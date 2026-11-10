import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { LineageViewModel } from "../../cli/src/view/model.js";
import {
  type HashRefResult,
  isHashQuery,
  resolveHashPrefix,
  type SearchHit,
  searchLineage,
  stepHitIndex,
} from "../../cli/src/view/search.js";
import { BackToPanel, Brand } from "./Brand.js";
import { isLivePage, MeaningError, pageToken, saveSetting, searchMeaning } from "./data.js";
import { Graph } from "./GraphView.js";
import { Inbox } from "./Inbox.js";
import { type MapSearchState, SearchBox } from "./MapSearch.js";
import { declineOffer, meaningHits, mergeHits, offerDeclined } from "./meaningSearch.js";
import { ProjectSwitcher } from "./ProjectSwitcher.js";
import { SettingsButton } from "./SettingsModal.js";
import { branchOf, type ScopeAnchor, type SearchScope, scopeHits } from "./searchScope.js";
import { ThemeButton } from "./ThemeButton.js";

/** How often, and how many times, the box asks again while the messages are fingerprinted. */
const MEANING_RETRY_MS = 3000;
const MEANING_RETRIES = 60;

export function App({ model }: { model: LineageViewModel }) {
  // The search state lives here because the box sits in the page head and the
  // map needs the hits; `useDeferredValue` keeps typing responsive while the
  // scan runs over every message and conversation.
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [step, setStep] = useState(0);
  const deferred = useDeferredValue(query);
  const hash: HashRefResult | null = useMemo(
    () => (isHashQuery(deferred) ? resolveHashPrefix(model, deferred) : null),
    [model, deferred],
  );
  const wordHits = useMemo(
    () => (hash === null ? searchLineage(model, deferred) : []),
    [model, deferred, hash],
  );
  // Search by meaning (semantic.ts): only from the local server, which asks the
  // user's Ollama. Off, the box offers it once; a refusal says what to do.
  const live = typeof document !== "undefined" && isLivePage() && pageToken() !== null;
  const [meaningOn, setMeaningOn] = useState(model.settings?.semanticSearch === true);
  const [declined, setDeclined] = useState(offerDeclined);
  const [meaning, setMeaning] = useState<{ query: string; hits: SearchHit[] } | null>(null);
  const [meaningNote, setMeaningNote] = useState<string | null>(null);
  const meaningQuery = deferred.trim();
  useEffect(() => {
    setMeaning(null);
    setMeaningNote(null);
    const token = pageToken();
    if (!live || !meaningOn || hash !== null || meaningQuery.length < 3 || token === null) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    // While the first fingerprints are made the server says "later" (425):
    // ask again every few seconds, for as long as the same query stays.
    const ask = (tries: number) => {
      searchMeaning(model.project.path, meaningQuery, token, abort.signal)
        .then((found) => {
          setMeaningNote(null);
          setMeaning({ query: meaningQuery, hits: meaningHits(model, found) });
        })
        .catch((err: unknown) => {
          if (abort.signal.aborted) return;
          setMeaningNote((err as Error).message);
          if (err instanceof MeaningError && err.later && tries < MEANING_RETRIES)
            timer = setTimeout(() => ask(tries + 1), MEANING_RETRY_MS);
        });
    };
    timer = setTimeout(() => ask(0), 300);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [live, meaningOn, hash, meaningQuery, model]);
  const allHits = useMemo(
    () =>
      meaning !== null && meaning.query === meaningQuery
        ? mergeHits(meaning.hits, wordHits)
        : wordHits,
    [meaning, meaningQuery, wordHits],
  );
  // What the map has open, and how far the search is narrowed to it. With
  // nothing open the scope falls back to the whole project.
  const [anchor, setAnchor] = useState<ScopeAnchor | null>(null);
  const [chosen, setChosen] = useState<SearchScope>("all");
  const branch = useMemo(() => (anchor === null ? null : branchOf(model, anchor)), [model, anchor]);
  const scope: SearchScope =
    anchor === null ? "all" : chosen === "branch" && branch === null ? "session" : chosen;
  const hits = useMemo(
    () => scopeHits(allHits, scope, anchor, branch),
    [allHits, scope, anchor, branch],
  );
  const onAnchor = useCallback((next: ScopeAnchor | null) => {
    setAnchor(next);
    if (next === null) setChosen("all");
  }, []);
  const sessionTitle =
    anchor === null
      ? null
      : (model.sessions.find((session) => session.sessionId === anchor.sessionId)?.title ?? null);
  const search: MapSearchState = { hits, active, step, hash };

  function change(next: string): void {
    setQuery(next);
    setActive(0);
    setStep((value) => value + 1);
  }
  function move(delta: number): void {
    setActive((index) => stepHitIndex(index, hits.length, delta));
    setStep((value) => value + 1);
  }
  function narrow(next: SearchScope): void {
    setChosen(next);
    setActive(0);
    setStep((value) => value + 1);
  }
  function clear(): void {
    setQuery("");
    setActive(0);
    setStep(0);
  }

  return (
    <main className="map-page">
      <div className="page-head">
        <div className="page-bar page-bar-centered">
          <Brand />
          <div className="page-title">
            <h1>{model.project.name}</h1>
            <p className="muted">{model.project.path}</p>
          </div>
          <div className="page-bar-actions">
            <SearchBox
              value={query}
              state={search}
              onQuery={change}
              onStep={move}
              onClear={clear}
              scope={
                anchor === null
                  ? null
                  : {
                      current: scope,
                      session: sessionTitle || anchor.sessionId,
                      branch: branch?.title ?? null,
                      onScope: narrow,
                    }
              }
              meaning={
                !live || hash !== null || query.trim() === ""
                  ? null
                  : meaningOn
                    ? {
                        offer: false,
                        note: meaningNote,
                        ranked: meaning !== null && meaning.hits.length > 0,
                      }
                    : declined
                      ? null
                      : { offer: true, note: meaningNote, ranked: false }
              }
              onMeaning={(answer) => {
                const token = pageToken();
                if (answer === "no") {
                  declineOffer();
                  setDeclined(true);
                  return;
                }
                if (token === null) return;
                saveSetting("semanticSearch", true, token)
                  .then(() => {
                    setMeaningOn(true);
                    setMeaningNote(
                      "On. cogit is fingerprinting the messages with Ollama; results by meaning follow in a moment.",
                    );
                  })
                  .catch((err: unknown) => setMeaningNote((err as Error).message));
              }}
            />
            <ThemeButton />
            <SettingsButton settings={model.settings} />
          </div>
        </div>

        <header className="project">
          <div>
            <ProjectSwitcher model={model} />
            <BackToPanel />
          </div>
        </header>

        {/* Story 11.1: only this project's rows, same as the panel's inbox. */}
        <Inbox rows={model.inbox ?? []} collapsible />
      </div>

      <Graph model={model} search={search} onAnchor={onAnchor} />
    </main>
  );
}
