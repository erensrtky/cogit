import { type FormEvent, useEffect, useRef, useState } from "react";
import type { PanelSettings } from "../../cli/src/view/model.js";
import {
  formatSetting,
  type SettingField,
  settingsSections,
  withDefaults,
} from "../../cli/src/view/settings.js";
import { isLivePage, loadSettings, pageToken, saveSetting } from "./data.js";

/**
 * The settings modal (Story 8.13). Every page carries a ⚙ Settings button in
 * its top bar; the modal is the one place settings are changed. Over the local
 * server it reads the live values with `GET /api/config` and writes with the
 * 8.9 path; over `file://` it shows the values embedded at build time read-only.
 */

type SettingValue = PanelSettings[keyof PanelSettings];

/**
 * The "?" next to a setting's label (Story 12.1): a plain-language answer to
 * "what is this, when do I change it, what does it cost", closed by default so
 * the modal stays short.
 */
function FieldDetails({ id, field }: { id: string; field: SettingField }) {
  const [open, setOpen] = useState(false);
  const detailId = `${id}-details`;
  return (
    <>
      <button
        type="button"
        className="settings-why"
        aria-expanded={open}
        aria-controls={detailId}
        aria-label={`What does ${field.label} do?`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        ?
      </button>
      {open ? (
        <p className="settings-details" id={detailId}>
          {field.details}
        </p>
      ) : null}
    </>
  );
}

interface EditableProps {
  id: string;
  field: SettingField;
  value: SettingValue;
  token: string;
  onSaved: (key: keyof PanelSettings, value: SettingValue) => void;
}

/**
 * One editable setting with its control and Save button. The draft follows the
 * parent value, so the live value from `GET /api/config` (or a successful save)
 * is what the form shows.
 */
function EditableSetting({ id, field, value, token, onSaved }: EditableProps) {
  const [draft, setDraft] = useState(String(value));
  const [checked, setChecked] = useState(Boolean(value));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(String(value));
    setChecked(Boolean(value));
    setSaving(false);
    setError(null);
  }, [value]);

  const dirty = field.kind === "boolean" ? checked !== Boolean(value) : draft !== String(value);

  /** A new edit supersedes the previous "Saved" / error line. */
  function edited(): void {
    setStatus(null);
    setError(null);
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!dirty || saving) return;
    const next: SettingValue =
      field.kind === "boolean" ? checked : field.kind === "number" ? Number(draft) : draft;
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      await saveSetting(field.key, next, token);
      onSaved(field.key, next);
      setStatus("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-field">
      <div className="settings-field-text">
        <span className="settings-label">
          <label htmlFor={id}>{field.label}</label>
          <FieldDetails id={id} field={field} />
        </span>
        <p className="settings-help" id={`${id}-help`}>
          {field.help}
        </p>
      </div>
      <form className="setting-form" onSubmit={submit}>
        {field.kind === "boolean" ? (
          <input
            id={id}
            type="checkbox"
            checked={checked}
            aria-describedby={`${id}-help`}
            onChange={(event) => {
              setChecked(event.target.checked);
              edited();
            }}
          />
        ) : field.kind === "select" ? (
          <select
            id={id}
            value={draft}
            aria-describedby={`${id}-help`}
            onChange={(event) => {
              setDraft(event.target.value);
              edited();
            }}
          >
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            type={field.kind === "number" ? "number" : "text"}
            value={draft}
            aria-describedby={`${id}-help`}
            onChange={(event) => {
              setDraft(event.target.value);
              edited();
            }}
          />
        )}
        <button type="submit" disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        {status ? <span className="setting-status">{status}</span> : null}
        {error ? <span className="setting-error">{error}</span> : null}
      </form>
    </div>
  );
}

function SettingsDialog({
  embedded,
  onClose,
}: {
  embedded: PanelSettings | undefined;
  onClose: () => void;
}) {
  // A map built before a change carries old values; the server answer wins.
  const token = isLivePage() ? pageToken() : null;
  const [values, setValues] = useState<PanelSettings>(() => withDefaults(embedded));
  const [loading, setLoading] = useState(token !== null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Focus goes into the dialog on open; the button takes it back on close.
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    loadSettings(token)
      .then((live) => {
        if (alive) setValues((current) => ({ ...current, ...live }));
      })
      .catch((err: unknown) => {
        if (alive) setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const canEdit = token !== null;
  const sections = settingsSections(canEdit);

  return (
    <div
      className="settings-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="settings-head">
          <h2 id="settings-title">Settings</h2>
          <button
            ref={closeRef}
            type="button"
            className="settings-close"
            aria-label="Close settings"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p className="muted">
          {canEdit
            ? "A change here applies to new builds and chats."
            : "Read-only. Open this page with `cogit open` to change settings, or use `cogit config set <key> <value>`."}
        </p>
        {loading ? <p className="settings-help">Reading the current settings…</p> : null}
        {loadError ? <p className="setting-error">{loadError}</p> : null}

        {sections.map((section) => (
          <section key={section.title} className="settings-section" aria-label={section.title}>
            <h3>{section.title}</h3>
            {section.fields.map((field) => {
              const id = `setting-${field.key}`;
              const value = values[field.key];
              return field.editable && token ? (
                <EditableSetting
                  key={field.key}
                  id={id}
                  field={field}
                  value={value}
                  token={token}
                  onSaved={(key, next) => setValues((current) => ({ ...current, [key]: next }))}
                />
              ) : (
                <div key={field.key} className="settings-field">
                  <div className="settings-field-text">
                    <span className="settings-label">
                      {field.label}
                      <FieldDetails id={id} field={field} />
                    </span>
                    <p className="settings-help" id={`${id}-help`}>
                      {field.help}
                    </p>
                  </div>
                  <span className="settings-value">{formatSetting(value)}</span>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}

/** The ⚙ Settings button both pages put in their top bar. */
export function SettingsButton({ settings }: { settings?: PanelSettings | undefined }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function close(): void {
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="settings-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">⚙</span> Settings
      </button>
      {open ? <SettingsDialog embedded={settings} onClose={close} /> : null}
    </>
  );
}
