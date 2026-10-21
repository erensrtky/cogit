import type { PanelSettings, PanelViewModel } from "../../cli/src/view/model.js";
import { formatTime } from "./format.js";

const SETTING_LABELS: [keyof PanelSettings, string][] = [
  ["language", "Language"],
  ["updateEveryTurns", "Update every turns"],
  ["sessionEndCatchUp", "Catch up on session end"],
  ["gitPolicy", "Git policy"],
  ["agents", "Agents"],
];

function settingText(value: PanelSettings[keyof PanelSettings]): string {
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

export function Panel({ model }: { model: PanelViewModel }) {
  return (
    <main>
      <header className="project">
        <div>
          <h1>Projects</h1>
          <p className="muted">Every project codelineage knows about.</p>
        </div>
        <div className="meta">
          <span>
            {model.projects.length} {model.projects.length === 1 ? "project" : "projects"}
          </span>
          <span className="muted">generated {formatTime(model.generatedAt)}</span>
        </div>
      </header>

      {model.projects.length === 0 ? (
        <p className="empty">No projects registered yet. Run `codelineage init` in a project.</p>
      ) : (
        <ul className="panel-grid">
          {model.projects.map((project) => (
            <li key={project.path} className={project.missing ? "card missing" : "card"}>
              <div className="card-head">
                <h2>{project.name}</h2>
                {project.missing ? <span className="badge">missing</span> : null}
              </div>
              <p className="muted path">{project.path}</p>
              <dl className="card-facts">
                <div>
                  <dt>Last activity</dt>
                  <dd>{formatTime(project.lastActivity)}</dd>
                </div>
                <div>
                  <dt>Waiting on you</dt>
                  <dd>{project.needsUserCount}</dd>
                </div>
              </dl>
              {project.lineageUrl ? (
                <a href={project.lineageUrl}>Open the map →</a>
              ) : (
                <p className="empty">Directory not found.</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <section className="settings" aria-label="Settings">
        <h2>Settings</h2>
        <p className="muted">Read-only; change them with `codelineage config set`.</p>
        <dl>
          {SETTING_LABELS.map(([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{settingText(model.settings[key])}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
