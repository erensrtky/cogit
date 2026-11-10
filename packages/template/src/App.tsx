import { useCallback, useDeferredValue, useMemo, useState } from "react";
import type { LineageViewModel } from "../../cli/src/view/model.js";
import {
  type HashRefResult,
  isHashQuery,
  resolveHashPrefix,
  searchLineage,
  stepHitIndex,
} from "../../cli/src/view/search.js";
import { BackToPanel, Brand } from "./Brand.js";
import { Graph } from "./Graph.js";
import { Inbox } from "./Inbox.js";
import { type MapSearchState, SearchBox } from "./MapSearch.js";
import { ProjectSwitcher } from "./ProjectSwitcher.js";
import { SettingsButton } from "./SettingsModal.js";
import { branchOf, type ScopeAnchor, type SearchScope, scopeHits } from "./searchScope.js";
import { ThemeButton } from "./ThemeButton.js";

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
  const allHits = useMemo(
    () => (hash === null ? searchLineage(model, deferred) : []),
    [model, deferred, hash],
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
