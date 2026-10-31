import { type FormEvent, useEffect, useRef, useState } from "react";
import type { PanelSettings } from "../../cli/src/view/model.js";
import {
  formatSetting,
  type SettingField,
  settingsSections,
  withDefaults,
} from "../../cli/src/view/settings.js";
import { isLivePage, loadSettings, pageToken, saveSetting } from "./data.js";
import { HelpTip } from "./HelpTip.js";

/**
 * The settings modal (Story 8.13). Every page carries a ⚙ Settings button in
 * its top bar; the modal is the one place settings are changed. Over the local
 * server it reads the live values with `GET /api/config` and writes with the
 * 8.9 path; over `file://` it shows the values embedded at build time read-only.
 */

type SettingValue = PanelSettings[keyof PanelSettings];

/** The "?" next to a setting's label: what it is, when to change it, what it costs. */
function FieldDetails({ id, field }: { id: string; field: SettingField }) {
  return (
    <HelpTip id={id} label={`What does ${field.label} do?`}>
      {field.details}
    </HelpTip>
  );
}

/** What a control holds before Save: text for inputs and selects, a flag for a checkbox. */
type Draft = string | boolean;
type SettingKey = keyof PanelSettings;

/** The value a draft saves as; a number field sends a number. */
function draftValue(field: SettingField, draft: Draft): SettingValue {
  if (field.kind === "boolean") return Boolean(draft);
  return field.kind === "number" ? Number(draft) : String(draft);
}

/** Whether a draft still differs from the saved value. */
function differs(field: SettingField, draft: Draft, value: SettingValue): boolean {
  return field.kind === "boolean"
    ? Boolean(draft) !== Boolean(value)
    : String(draft) !== String(value);
}

interface EditableProps {
  id: string;
  field: SettingField;
  value: SettingValue;
  /** The unsaved edit, if any; the control shows it instead of the saved value. */
  draft: Draft | undefined;
  error: string | undefined;
  onChange: (field: SettingField, draft: Draft) => void;
}

/**
 * One editable setting. It holds no state of its own: the dialog keeps every
 * unsaved edit and saves them together with its single Save button.
 */
function EditableSetting({ id, field, value, draft, error, onChange }: EditableProps) {
  const shown = draft ?? (field.kind === "boolean" ? Boolean(value) : String(value));
  return (
    <div className={draft === undefined ? "settings-field" : "settings-field is-changed"}>
      <div className="settings-field-text">
        <span className="settings-label">
          <label htmlFor={id}>{field.label}</label>
          <FieldDetails id={id} field={field} />
        </span>
        <p className="settings-help" id={`${id}-help`}>
          {field.help}
        </p>
      </div>
      <div className="setting-form">
        {field.kind === "boolean" ? (
          <input
            id={id}
            type="checkbox"
            checked={Boolean(shown)}
            aria-describedby={`${id}-help`}
            onChange={(event) => onChange(field, event.target.checked)}
          />
        ) : field.kind === "select" ? (
          <select
            id={id}
            value={String(shown)}
            aria-describedby={`${id}-help`}
            onChange={(event) => onChange(field, event.target.value)}
          >
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            {/* A value set with `cogit config set` that the panel does not offer still shows. */}
            {(field.options ?? []).some((option) => option.value === String(shown)) ? null : (
              <option value={String(shown)}>{String(shown)}</option>
            )}
          </select>
        ) : (
          <input
            id={id}
            type={field.kind === "number" ? "number" : "text"}
            value={String(shown)}
            aria-describedby={`${id}-help`}
            onChange={(event) => onChange(field, event.target.value)}
          />
        )}
        {error ? <span className="setting-error">{error}</span> : null}
      </div>
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
  const [drafts, setDrafts] = useState<Partial<Record<SettingKey, Draft>>>({});
  const [errors, setErrors] = useState<Partial<Record<SettingKey, string>>>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
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
  const fields = new Map(sections.flatMap((section) => section.fields).map((f) => [f.key, f]));
  const changed = Object.keys(drafts) as SettingKey[];

  /** Keeps an edit as a draft, or drops it once it is back at the saved value. */
  function change(field: SettingField, draft: Draft): void {
    setDrafts((current) => {
      const next = { ...current };
      if (differs(field, draft, values[field.key])) next[field.key] = draft;
      else delete next[field.key];
      return next;
    });
    setErrors((current) => {
      const next = { ...current };
      delete next[field.key];
      return next;
    });
    setStatus(null);
  }

  /** Saves every changed setting; one that fails keeps its draft and shows why. */
  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!token || saving || changed.length === 0) return;
    setSaving(true);
    setStatus(null);
    const failed: Partial<Record<SettingKey, string>> = {};
    for (const key of changed) {
      const field = fields.get(key);
      const draft = drafts[key];
      if (!field || draft === undefined) continue;
      const next = draftValue(field, draft);
      try {
        await saveSetting(key, next, token);
        setValues((current) => ({ ...current, [key]: next }));
        setDrafts((current) => {
          const rest = { ...current };
          delete rest[key];
          return rest;
        });
      } catch (err) {
        failed[key] = err instanceof Error ? err.message : String(err);
      }
    }
    setErrors(failed);
    const failures = Object.keys(failed).length;
    setStatus(failures === 0 ? "Saved" : `${failures} not saved`);
    setSaving(false);
  }

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

        <form onSubmit={save}>
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
                    draft={drafts[field.key]}
                    error={errors[field.key]}
                    onChange={change}
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
          {canEdit ? (
            <div className="settings-foot">
              <span className="setting-status" role="status">
                {saving
                  ? "Saving…"
                  : changed.length > 0
                    ? `${changed.length} unsaved ${changed.length === 1 ? "change" : "changes"}`
                    : (status ?? "")}
              </span>
              <button type="submit" disabled={changed.length === 0 || saving}>
                Save
              </button>
            </div>
          ) : null}
        </form>
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
