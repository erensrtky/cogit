import type { PanelProject, PanelViewModel } from "../../cli/src/view/model.js";
import { isLivePage } from "./data.js";
import { formatTime } from "./format.js";
import { SettingsButton } from "./SettingsModal.js";

/**
 * From the local server, maps open as pages of that server so they refresh too;
 * the standalone panel file keeps its `file://` links.
 */
function mapHref(project: PanelProject): string | null {
  if (!project.lineageUrl) return null;
  return isLivePage() ? `/map?dir=${encodeURIComponent(project.path)}` : project.lineageUrl;
}

export function Panel({ model }: { model: PanelViewModel }) {
  return (
    <main>
      <header className="project">
        <div>
          <h1>Projects</h1>
          <p className="muted">Every project codelineage knows about.</p>
        </div>
        <div className="page-actions">
          <SettingsButton settings={model.settings} />
          <div className="meta">
            <span>
              {model.projects.length} {model.projects.length === 1 ? "project" : "projects"}
            </span>
            <span className="muted">generated {formatTime(model.generatedAt)}</span>
          </div>
        </div>
      </header>

      {model.projects.length === 0 ? (
        <p className="empty">No projects registered yet. Run `codelineage init` in a project.</p>
      ) : (
        <ul className="panel-grid">
          {model.projects.map((project) => {
            const href = mapHref(project);
            return (
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
                {href ? (
                  <a href={href}>Open the map →</a>
                ) : (
                  <p className="empty">Directory not found.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
