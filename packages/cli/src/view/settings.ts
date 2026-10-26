import type { PanelEditableSettings, PanelSettings } from "./model.js";

/**
 * The settings modal's model (Story 8.13): one description per field, the
 * sections it is laid out in, and the values shown when the page was built
 * before the current setting changed. Runtime-free so the template can import
 * it and tests can check the modal without a DOM.
 */

/** What a setting's control looks like. */
export type SettingKind = "text" | "number" | "boolean";

export interface SettingField {
  key: keyof PanelSettings;
  label: string;
  /** One short line under the label, so nobody has to read the docs. */
  help: string;
  kind: SettingKind;
  /** False over `file://` and for the setup-time keys the modal only shows. */
  editable: boolean;
}

export interface SettingsSection {
  title: string;
  fields: SettingField[];
}

interface FieldSpec {
  key: keyof PanelSettings;
  label: string;
  help: string;
  kind: SettingKind;
}

const EDITABLE: FieldSpec[] = [
  {
    key: "messageSummaries",
    label: "Message summaries",
    help: "Write a one-line summary for each recorded message.",
    kind: "boolean",
  },
  {
    key: "startupContext",
    label: "Lineage at session start",
    help: "Hand the agent the previous session's lineage when a chat starts.",
    kind: "boolean",
  },
  {
    key: "language",
    label: "Language",
    help: "Language the agent writes records in; `auto` follows the chat.",
    kind: "text",
  },
  {
    key: "updateEveryTurns",
    label: "Update every turns",
    help: "Ask the agent to record after this many turns.",
    kind: "number",
  },
  {
    key: "sessionEndCatchUp",
    label: "Catch up on session end",
    help: "Record the unrecorded messages when a session ends.",
    kind: "boolean",
  },
  {
    key: "catchUpModel",
    label: "Catch-up model",
    help: "Model the catch-up and backfill use to summarize.",
    kind: "text",
  },
];

const READ_ONLY: FieldSpec[] = [
  {
    key: "gitPolicy",
    label: "Git policy",
    help: "Whether captures are committed to git; change it per project with `codelineage config set`.",
    kind: "text",
  },
  {
    key: "agents",
    label: "Agents",
    help: "Which agents record lineage; change it with `codelineage config set`.",
    kind: "text",
  },
];

/**
 * One section today, "Recording", so later groups slot in without a redesign.
 * Over `file://` (`canEdit` false) the editable fields still appear, read-only,
 * with the build-time values.
 */
export function settingsSections(canEdit: boolean): SettingsSection[] {
  return [
    {
      title: "Recording",
      fields: [
        ...EDITABLE.map((field) => ({ ...field, editable: canEdit })),
        ...READ_ONLY.map((field) => ({ ...field, editable: false })),
      ],
    },
  ];
}

/**
 * The values a modal starts with when no server answers (a `file://` page):
 * the defaults from the config schema, overridden by what the build embedded.
 */
export const DEFAULT_SETTINGS: PanelSettings = {
  language: "auto",
  updateEveryTurns: 5,
  sessionEndCatchUp: true,
  catchUpModel: "haiku",
  messageSummaries: false,
  startupContext: true,
  gitPolicy: "ignore",
  agents: ["claude-code"],
};

export function withDefaults(settings: Partial<PanelSettings> | undefined): PanelSettings {
  return { ...DEFAULT_SETTINGS, ...settings };
}

/** The keys `GET /api/config` returns; never the setup-time or security-adjacent ones. */
export function editableSettings(settings: PanelSettings): PanelEditableSettings {
  return {
    messageSummaries: settings.messageSummaries,
    startupContext: settings.startupContext,
    language: settings.language,
    updateEveryTurns: settings.updateEveryTurns,
    sessionEndCatchUp: settings.sessionEndCatchUp,
    catchUpModel: settings.catchUpModel,
  };
}

/** How a read-only value reads in the modal. */
export function formatSetting(value: PanelSettings[keyof PanelSettings] | undefined): string {
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return value === undefined ? "—" : String(value);
}
