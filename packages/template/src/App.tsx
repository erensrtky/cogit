import type { LineageViewModel } from "../../cli/src/view/model.js";
import { formatTime } from "./format.js";
import { Graph } from "./Graph.js";
import { ProjectSwitcher } from "./ProjectSwitcher.js";
import { SettingsButton } from "./SettingsModal.js";

export function App({ model }: { model: LineageViewModel }) {
  const sessionCount =
    model.epochs.reduce((sum, epoch) => sum + epoch.sessions.length, 0) + model.unassigned.length;

  return (
    <main>
      <div className="page-head">
        <div className="page-bar">
          <ProjectSwitcher model={model} />
          <SettingsButton settings={model.settings} />
        </div>

        <header className="project">
          <div>
            <h1>{model.project.name}</h1>
            <p className="muted">{model.project.path}</p>
          </div>
          <div className="meta">
            <span>
              {model.epochs.length} epochs · {sessionCount} sessions
            </span>
            <span className="muted">generated {formatTime(model.project.generatedAt)}</span>
          </div>
        </header>
      </div>

      <Graph model={model} />
    </main>
  );
}
