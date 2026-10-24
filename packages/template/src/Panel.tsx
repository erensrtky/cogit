import { type FormEvent, useEffect, useState } from "react";
import type {
  PanelEditableKey,
  PanelProject,
  PanelSettings,
  PanelViewModel,
} from "../../cli/src/view/model.js";
import { isLivePage, pageToken, saveSetting } from "./data.js";
import { formatTime } from "./format.js";

interface EditableSpec {
  key: PanelEditableKey;
  label: string;
  kind: "text" | "number" | "boolean";
}

/** The keys the panel may change (Story 8.9); the server enforces the same list. */
const EDITABLE: EditableSpec[] = [
  { key: "messageSummaries", label: "Message summaries", kind: "boolean" },
  { key: "startupContext", label: "Lineage at session start", kind: "boolean" },
  { key: "language", label: "Language", kind: "text" },
  { key: "updateEveryTurns", label: "Update every turns", kind: "number" },
  { key: "sessionEndCatchUp", label: "Catch up on session end", kind: "boolean" },
  { key: "catchUpModel", label: "Catch-up model", kind: "text" },
];

const READ_ONLY: [keyof PanelSettings, string][] = [
  ["gitPolicy", "Git policy"],
  ["agents", "Agents"],
];

/**
 * From the local server, maps open as pages of that server so they refresh too;
 * the standalone panel file keeps its `file://` links.
 */
function mapHref(project: PanelProject): string | null {
  if (!project.lineageUrl) return null;
  return isLivePage() ? `/map?dir=${encodeURIComponent(project.path)}` : project.lineageUrl;
}

function settingText(value: PanelSettings[keyof PanelSettings]): string {
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

/**
 * One setting with a control and a Save button. The draft follows the model, so
 * a live page swap after a rebuild shows the value the server actually stored.
 */
function EditableSetting({
  spec,
  value,
  token,
}: {
  spec: EditableSpec;
  value: PanelSettings[PanelEditableKey];
  token: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const [checked, setChecked] = useState(Boolean(value));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(String(value));
    setChecked(Boolean(value));
    setSaving(false);
    setStatus(null);
    setError(null);
  }, [value]);

  const dirty = spec.kind === "boolean" ? checked !== Boolean(value) : draft !== String(value);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!dirty || saving) return;
    const next = spec.kind === "boolean" ? checked : spec.kind === "number" ? Number(draft) : draft;
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      await saveSetting(spec.key, next, token);
      setStatus("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const id = `setting-${spec.key}`;
  return (
    <div>
      <dt>
        <label htmlFor={id}>{spec.label}</label>
      </dt>
      <dd>
        <form className="setting-form" onSubmit={submit}>
          {spec.kind === "boolean" ? (
            <input
              id={id}
              type="checkbox"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
            />
          ) : (
            <input
              id={id}
              type={spec.kind === "number" ? "number" : "text"}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          )}
          <button type="submit" disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          {status ? <span className="setting-status">{status}</span> : null}
          {error ? <span className="setting-error">{error}</span> : null}
        </form>
      </dd>
    </div>
  );
}

export function Panel({ model }: { model: PanelViewModel }) {
  // No token over `file://`: the page cannot write, so the settings stay text.
  const token = isLivePage() ? pageToken() : null;

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

      <section className="settings" aria-label="Settings">
        <h2>Settings</h2>
        <p className="muted">
          {token
            ? "A change here applies to new builds and chats."
            : "Read-only; change them with `codelineage config set`, or run `codelineage open` to edit them here."}
        </p>
        <dl>
          {EDITABLE.map((spec) =>
            token ? (
              <EditableSetting
                key={spec.key}
                spec={spec}
                value={model.settings[spec.key]}
                token={token}
              />
            ) : (
              <div key={spec.key}>
                <dt>{spec.label}</dt>
                <dd>{settingText(model.settings[spec.key])}</dd>
              </div>
            ),
          )}
          {READ_ONLY.map(([key, label]) => (
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
