import { useDeferredValue, useMemo, useState } from "react";
import type { LineageViewModel } from "../../cli/src/view/model.js";
import {
  type HashRefResult,
  isHashQuery,
  resolveHashPrefix,
  searchLineage,
  stepHitIndex,
} from "../../cli/src/view/search.js";
import { BackToPanel, Brand } from "./Brand.js";
import { formatTime } from "./format.js";
import { Graph } from "./Graph.js";
import { type MapSearchState, SearchBox } from "./MapSearch.js";
import { ProjectSwitcher } from "./ProjectSwitcher.js";
import { SettingsButton } from "./SettingsModal.js";

export function App({ model }: { model: LineageViewModel }) {
  const sessionCount =
    model.epochs.reduce((sum, epoch) => sum + epoch.sessions.length, 0) + model.unassigned.length;

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
  const hits = useMemo(
    () => (hash === null ? searchLineage(model, deferred) : []),
    [model, deferred, hash],
  );
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
  function clear(): void {
    setQuery("");
    setActive(0);
    setStep(0);
  }

  return (
    <main className="map-page">
      <div className="page-head">
        <div className="page-bar">
          <Brand />
          <div className="page-bar-actions">
            <SearchBox
              value={query}
              state={search}
              onQuery={change}
              onStep={move}
              onClear={clear}
            />
            <SettingsButton settings={model.settings} />
          </div>
        </div>

        <header className="project">
          <div>
            <BackToPanel />
            <h1>{model.project.name}</h1>
            <p className="muted">{model.project.path}</p>
            <ProjectSwitcher model={model} />
          </div>
          <div className="meta">
            <span>
              {model.epochs.length} epochs · {sessionCount} sessions
            </span>
            <span className="muted">generated {formatTime(model.project.generatedAt)}</span>
          </div>
        </header>
      </div>

      <Graph model={model} search={search} />
    </main>
  );
}
