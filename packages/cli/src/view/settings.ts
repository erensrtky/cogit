import type { PanelEditableSettings, PanelSettings } from "./model.js";

/**
 * The settings modal's model (Story 8.13): one description per field, the
 * sections it is laid out in, and the values shown when the page was built
 * before the current setting changed. Runtime-free so the template can import
 * it and tests can check the modal without a DOM.
 *
 * Every field also carries a `details` text: the longer plain-language answer
 * the "?" next to its label opens (Story 12.1). `cogit config --help` prints
 * the same text, so the two never drift.
 */

/** What a setting's control looks like. */
export type SettingKind = "text" | "number" | "boolean" | "select";

export interface SettingOption {
  value: string;
  label: string;
}

export interface SettingField {
  key: keyof PanelSettings;
  label: string;
  /** One short line under the label, so nobody has to read the docs. */
  help: string;
  /** The longer explanation behind "?" (Story 12.1). Plain language, no keys. */
  details: string;
  kind: SettingKind;
  /** The choices of a `select`. */
  options?: SettingOption[];
  /** False over `file://` and for the setup-time keys the modal only shows. */
  editable: boolean;
}

export interface SettingsSection {
  title: string;
  fields: SettingField[];
}

export interface FieldSpec {
  key: keyof PanelSettings;
  label: string;
  help: string;
  details: string;
  kind: SettingKind;
  options?: SettingOption[];
}

const EDITABLE: FieldSpec[] = [
  {
    key: "recorder",
    label: "Recording mode",
    help: "Who writes the record: a side model, the main agent, or both.",
    details:
      "Who writes the record. Mixed (recommended): a small side model records every few " +
      "turns and the main agent still checks in every 15 turns to record its own decisions; " +
      "measured on real sessions this costs about 1–2% of a session. Main agent: the agent " +
      "records its own work every few turns, which costs about 5% of a session but catches its " +
      "technical decisions best. Side model only: a small model records everything in the " +
      "background and the agent is never interrupted.",
    kind: "select",
    options: [
      { value: "mixed", label: "Mixed (recommended)" },
      { value: "agent", label: "Main agent" },
      { value: "side", label: "Side model only" },
    ],
  },
  {
    key: "messageSummaries",
    label: "Message summaries",
    help: "Write a one-line summary for each recorded message.",
    details:
      "A one-sentence summary under each message title, so a skim reads better. Off keeps " +
      "the record shorter and cheaper.",
    kind: "boolean",
  },
  {
    key: "startupContext",
    label: "Lineage at session start",
    help: "Hand the agent the previous session's lineage when a chat starts.",
    details:
      "When a chat starts, the agent gets a short summary of where the previous session left " +
      "off and how to read the record. It costs a few tokens; turn it off if your projects " +
      "are unrelated.",
    kind: "boolean",
  },
  {
    key: "tryBeforeNotes",
    label: "Tried-before notes",
    help: "Before the agent edits a file, tell it which options earlier thoughts rejected for it.",
    details:
      "Before the agent edits a file, it hears which options earlier thoughts tried and " +
      "rejected for that file. These are notes from the record, never rules; they can make " +
      "the agent ask before repeating a dead end.",
    kind: "boolean",
  },
  {
    key: "language",
    label: "Language",
    help: "Language the agent writes records in; `auto` follows the chat.",
    details:
      "The language the record is written in. With auto, it follows the language of the " +
      "conversation.",
    kind: "text",
  },
  {
    key: "updateEveryTurns",
    label: "Record every N turns",
    help: "Ask the agent to record after this many turns.",
    details:
      "How often the main agent is asked to update the record inside the chat. In mixed mode " +
      "the side model records in between, so this can be rare (15 turns by default).",
    kind: "number",
  },
  {
    key: "sideEveryTurns",
    label: "Side model every N turns",
    help: "How often the background recorder writes in mixed or side mode.",
    details:
      "How often the small side model records in the background. A lower number keeps the " +
      "map fresher and costs a little more; a higher number is quieter.",
    kind: "number",
  },
  {
    key: "sessionEndCatchUp",
    label: "Side model at session end",
    help: "When a session ends, the side model records the messages still unrecorded.",
    details:
      "When a session ends, the side model records whatever nobody got to. It runs outside " +
      "the chat, so it does not spend the session's tokens.",
    kind: "boolean",
  },
  {
    key: "sideModel",
    label: "Side model",
    help: "The small model that records outside the chat.",
    details:
      "The small model behind every side record: every few turns in mixed mode, all the " +
      "time in side mode, and at session end. Haiku is cheap and good enough for titles, " +
      "parents and short decisions.",
    kind: "text",
  },
  {
    key: "shareConversations",
    label: "Share conversations",
    help: "Commit the raw chat text too, not only the session record (off: chat stays local).",
    details:
      "Also commit the raw chat text, not only the record. Leave it off to keep conversations " +
      "on your machine while the record still travels with the branch.",
    kind: "boolean",
  },
  {
    key: "recordCommit",
    label: "Commit the record",
    help: "ask, auto or off: what to do with the last messages after the last code commit.",
    details:
      "What happens to record changes made after your last code commit: ask you next time, " +
      "commit them automatically, or leave them for you to commit.",
    kind: "text",
  },
];

/** A setting only `cogit config` changes: per project, set up once, or rarely touched. */
export interface CliSetting {
  key: string;
  label: string;
  help: string;
  details: string;
}

/** The settings the panel leaves out; `cogit config --help` and the guide explain them. */
export const CLI_ONLY: CliSetting[] = [
  {
    key: "gitPolicy",
    label: "Git policy",
    help: "What `cogit init` offers a new project: commit the record to git, or ignore it.",
    details:
      "Only the default for new projects: each project answers it during `cogit init`. " +
      "`cogit config git` shows the current project's policy and `cogit config git commit` " +
      "or `ignore` switches it.",
  },
  {
    key: "agents",
    label: "Agents",
    help: "Which agents record lineage; change it with `cogit config set`.",
    details:
      "Which AI agents in this project should record what they are asked and what they " +
      "decide. Claude Code is the only one today.",
  },
  {
    key: "inboxMaxAgeDays",
    label: "Inbox age",
    help: 'Days a waiting session stays in the "Your turn" inbox.',
    details:
      "A session that waits on you longer than this leaves the inbox. It is hidden, not " +
      "deleted: the map still has it.",
  },
  {
    key: "bigChangeLines",
    label: "Big change",
    help: "Lines of code after which a message counts as a big change on the map.",
    details:
      "Messages whose commits changed at least this many lines get a quiet highlight in " +
      "the unread list. It never hides or ranks anything by itself.",
  },
  {
    key: "trailerMaxAgeHours",
    label: "Trailer age",
    help: "How old the last message may be for a commit to get its `Thought:` trailer.",
    details:
      "A commit made hours after the last message is probably not about that message, so " +
      "past this age the commit gets no trailer instead of a wrong one.",
  },
  {
    key: "serverPort",
    label: "Server port",
    help: "Port of the local map server on 127.0.0.1.",
    details: "Change it only when another program already uses the port.",
  },
];

/**
 * One section today, "Recording", so later groups slot in without a redesign.
 * Over `file://` (`canEdit` false) the editable fields still appear, read-only,
 * with the build-time values. The CLI-only settings (`CLI_ONLY`) stay out of
 * the panel: they are per project, set up once or rarely touched.
 */
/** The panel's settings in their order, for the guide. */
export function panelSettingFields(): readonly FieldSpec[] {
  return EDITABLE;
}

export function settingsSections(canEdit: boolean): SettingsSection[] {
  return [
    {
      title: "Recording",
      fields: EDITABLE.map((field) => ({ ...field, editable: canEdit })),
    },
  ];
}

/** The long plain-language text of one setting, for `cogit config --help`. */
export function configHelpLines(): string[] {
  return [...EDITABLE, ...CLI_ONLY].map(
    (field) => `  ${field.key}\n    ${field.label}: ${field.help}\n    ${field.details}`,
  );
}

/**
 * The values a modal starts with when no server answers (a `file://` page):
 * the defaults from the config schema, overridden by what the build embedded.
 */
export const DEFAULT_SETTINGS: PanelSettings = {
  recorder: "mixed",
  language: "auto",
  updateEveryTurns: 15,
  sideEveryTurns: 5,
  sessionEndCatchUp: true,
  sideModel: "haiku",
  messageSummaries: false,
  startupContext: true,
  tryBeforeNotes: true,
  shareConversations: false,
  recordCommit: "ask",
  gitPolicy: "commit",
  agents: ["claude-code"],
  bigChangeLines: 300,
};

export function withDefaults(settings: Partial<PanelSettings> | undefined): PanelSettings {
  return { ...DEFAULT_SETTINGS, ...settings };
}

/** The keys `GET /api/config` returns; never the setup-time or security-adjacent ones. */
export function editableSettings(settings: PanelSettings): PanelEditableSettings {
  return {
    recorder: settings.recorder,
    messageSummaries: settings.messageSummaries,
    startupContext: settings.startupContext,
    tryBeforeNotes: settings.tryBeforeNotes,
    language: settings.language,
    updateEveryTurns: settings.updateEveryTurns,
    sideEveryTurns: settings.sideEveryTurns,
    sessionEndCatchUp: settings.sessionEndCatchUp,
    sideModel: settings.sideModel,
    shareConversations: settings.shareConversations,
    recordCommit: settings.recordCommit,
  };
}

/** How a read-only value reads in the modal. */
export function formatSetting(value: PanelSettings[keyof PanelSettings] | undefined): string {
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return value === undefined ? "—" : String(value);
}
