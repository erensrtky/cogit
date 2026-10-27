import type { PanelProject, PanelViewModel } from "../../cli/src/view/model.js";
import { Brand } from "./Brand.js";
import { isLivePage } from "./data.js";
import { formatTime } from "./format.js";
import { Inbox } from "./Inbox.js";
import { SettingsButton } from "./SettingsModal.js";

/**
 * From the local server, maps open as pages of that server so they refresh too;
 * the standalone panel file keeps its `file://` links.
 */
function mapHref(project: PanelProject): string | null {
  if (!project.lineageUrl) return null;
  return typeof document !== "undefined" && isLivePage()
    ? `/map?dir=${encodeURIComponent(project.path)}`
    : project.lineageUrl;
}

export function Panel({ model }: { model: PanelViewModel }) {
  return (
    <main className="panel-page">
      <div className="page-bar">
        <Brand home />
      </div>
      <header className="project">
        <div>
          <h1>Projects</h1>
          <p className="muted">Every project cogit knows about.</p>
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

      {/* Story 11.1: sessions waiting on the user, across every project. */}
      <Inbox rows={model.inbox ?? []} />

      {model.projects.length === 0 ? (
        <p className="empty">No projects registered yet. Run `cogit init` in a project.</p>
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
                  {project.unreadBigCount === undefined ? null : (
                    <div>
                      <dt title="Unread messages whose commits changed at least the big-change threshold of lines">
                        Unread big changes
                      </dt>
                      <dd>{project.unreadBigCount}</dd>
                    </div>
                  )}
                </dl>
                {href ? (
                  <a className="card-open" href={href}>
                    Open the map →
                  </a>
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
