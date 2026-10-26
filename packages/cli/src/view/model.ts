import type { BranchSummary, NodeKind } from "../schema/session.js";

/**
 * Serialized contract between `cogit build` and the HTML template. The
 * builder fills this shape, JSON-serializes it into the page's data element and
 * the React app in `packages/template` renders it. Keep this file free of runtime
 * dependencies so both sides can import it.
 */

/** Id of the `<script type="application/json">` that carries the model. */
export const DATA_ELEMENT_ID = "cogit-data";

/**
 * Meta tag the local map server injects into the pages it serves. The page
 * subscribes to rebuild events only when it is present, so a `file://` page or
 * the Vite dev server never tries to reach a server that is not there.
 */
export const LIVE_META_NAME = "cogit-live";

/**
 * Meta tag the local map server puts in every page it serves: a random token
 * for this server start that a settings read or write must echo. Other sites
 * cannot read it, so they cannot post a change even when the host check is
 * bypassed. A `file://` page has no token and its settings stay read-only.
 */
export const TOKEN_META_NAME = "cogit-token";

/**
 * Settings the panel may change over the local server (Story 8.9). The rest are
 * setup-time or security-adjacent and stay on `cogit config set`.
 */
export const PANEL_EDITABLE_KEYS = [
  "messageSummaries",
  "startupContext",
  "language",
  "updateEveryTurns",
  "sessionEndCatchUp",
  "catchUpModel",
] as const;

export type PanelEditableKey = (typeof PANEL_EDITABLE_KEYS)[number];

export function isPanelEditableKey(key: string): key is PanelEditableKey {
  return (PANEL_EDITABLE_KEYS as readonly string[]).includes(key);
}

/** Version of the serialized view model (not the session schema). */
export const VIEW_SCHEMA = 1;

/** A code commit a message carries, with the subject read from git at build time. */
export interface ViewCommit {
  /** The hash as the record holds it (short or full). */
  hash: string;
  /** The commit's subject; absent when git no longer knows the commit. */
  subject?: string;
}

export interface ViewNode {
  /** Stable id (`h…`); the key of the node, never shown to the user. */
  id: string;
  /** Display label (`m1`, `m2`, …) derived from send order (Story 8.5). */
  label?: string;
  kind: NodeKind;
  title: string;
  summary?: string;
  why?: string;
  at?: string;
  /**
   * The earlier message this one reacts to; `null` for a new root. Always set
   * on the messages the map draws (buildMessages falls back to the previous
   * message when a record points elsewhere).
   */
  parent?: string | null;
  /**
   * Set when the message hangs from a message of an earlier session (Story
   * 8.6): the map then draws a "continues …" mark and a root for the layout,
   * because the other session has its own graph.
   */
  continues?: ViewContinue;
  /** Earlier messages this one returns to or builds on besides its parent. */
  links?: string[];
  /** On a branch's first message: what that thread asked and what came of it. */
  branch?: BranchSummary;
  decidedBy?: "user" | "agent" | "agreed";
  alternatives?: { option: string; why: string }[];
  commits?: string[];
  /**
   * `commits` with their subjects (Story 8.8); the map draws them as small tag
   * chips. A tag without a subject is a commit git no longer has, drawn greyed.
   */
  commitTags?: ViewCommit[];
  files?: string[];
  /** For a message: what the agent did about it. */
  work?: string[];
  /** For a message: choices the agent made on its own. */
  agentDecisions?: {
    title: string;
    why: string;
    alternatives?: { option: string; why: string }[] | undefined;
  }[];
  /** When the node was first added. */
  addedAt?: string;
  /** When the node was last added or changed; marks where the work left off. */
  touchedAt?: string;
  /** A user message the record does not hold yet: the row is not summarized. */
  unsummarized?: true;
}

/** The earlier session's message a first message continues (Story 8.6). */
export interface ViewContinue {
  sessionId: string;
  /** The other session's title, or its id when the record is gone. */
  sessionTitle: string;
  /** The id of the message in the other session. */
  id: string;
  /** Its `m67` label from that session, when the message is still there. */
  label?: string;
}

export interface ViewPendingItem {
  text: string;
  needsUser: boolean;
}

export interface ViewStatus {
  goal: string;
  done: string[];
  pending: ViewPendingItem[];
  next: string;
}

/** Status card at the top of the map (merged across sessions). */
export interface StatusCard extends ViewStatus {
  /** `updatedAt` of the most recently updated session, or null with no sessions. */
  lastActivity: string | null;
}

/** A user message the record does not hold yet, read from the transcript at build time. */
export interface ViewPendingMessage {
  /** The stable id the message will get as a node (`h…`). */
  id: string;
  /** The `m1`, `m2`, … label the user reads. */
  label?: string;
  at: string;
  /** The first words of the message, used as the card title. */
  title: string;
}

/** One user message and the agent's written answer, read from the transcript at build time. */
export interface ViewChatTurn {
  /** Same stable id as the message node it belongs to (`h…`). */
  id: string;
  /** The `m1`, `m2`, … label the user reads. */
  label?: string;
  at: string;
  /** The user's message as written, without injected reminders. */
  text: string;
  /** The agent's written replies until the next message; tool output is never included. */
  replies: string[];
  /** What the agent did with tools in that turn, counted, not shown. */
  tools: { commands: number; files: string[]; other: number };
}

export interface ViewSession {
  sessionId: string;
  agent: string;
  title: string;
  epoch: string | null;
  startedAt: string;
  updatedAt: string;
  status: ViewStatus;
  /**
   * The session's user messages, flat and in the order they were sent. Older
   * records' topic nodes are not part of the map any more (Epic 8); every
   * message carries the id of the message it hangs from.
   */
  messages: ViewNode[];
  /** False when the Claude Code transcript is gone, so resume cannot work. */
  transcriptAvailable: boolean;
  /** The linked git worktree the session ran in, if any. */
  worktree?: { path: string; branch: string | null };
  /**
   * User messages the record does not hold yet, counted from the transcript at
   * build time. Only set while the SessionEnd catch-up is off.
   */
  unrecordedMessages?: number;
  /**
   * The conversation, for sessions that record messages and still have their
   * transcript. It lives only in the generated page, never in the session file.
   */
  chat?: ViewChatTurn[];
}

export interface ViewEpoch {
  id: string;
  title: string;
  createdAt: string;
  sessions: ViewSession[];
}

/**
 * One entry of the map's project switcher (Story 8.12): a registered project
 * with the line that says where its work left off.
 */
export interface ViewSwitcherProject {
  name: string;
  path: string;
  /** `updatedAt` of the project's most recently updated session. */
  lastActivity: string | null;
  /** The newest session's `next`, or its last message title when `next` is empty. */
  leftOff: string;
  /** `file://` URL of the project's map. */
  lineageUrl: string;
  /** True for the project the page belongs to. */
  current: boolean;
}

export interface LineageViewModel {
  kind: "lineage";
  schema: typeof VIEW_SCHEMA;
  project: {
    name: string;
    path: string;
    generatedAt: string;
  };
  status: StatusCard;
  epochs: ViewEpoch[];
  /** Sessions with no epoch, or with an epoch that no longer exists. */
  unassigned: ViewSession[];
  /**
   * Every registered project, most recently active first, for the map's
   * switcher (Story 8.12). Missing directories are left out; older pages simply
   * have no switcher.
   */
  switcher?: ViewSwitcherProject[];
  /**
   * Which conversations touched which file (Story 8.15), most recently touched
   * first: the union of each message's `files` and the files of its commits,
   * read from git at build time. Absent on pages built before 8.15.
   */
  files?: ViewFile[];
  /**
   * Settings embedded at build time (Story 8.13). The settings modal shows them
   * read-only over `file://`; over the local server it reads the live values
   * instead. Absent on pages built before 8.13.
   */
  settings?: PanelSettings;
}

/**
 * One message that touched a file (Story 8.15): the file view's row on the map
 * and what `cogit log --file` prints. `commits` are the commits that
 * touched this file; a commit git no longer knows leaves an empty list.
 */
export interface ViewFileHit {
  sessionId: string;
  /** The session's title, or its id when the record has none yet. */
  sessionTitle: string;
  messageId: string;
  /** The message's `mN` label. */
  label: string;
  at?: string;
  title: string;
  /** The branch the message sits in, when a branch summary starts at or before it. */
  branch?: string;
  commits: string[];
}

/** A file recorded messages touched, most recently touched first. */
export interface ViewFile {
  /** Project-relative path (`src/app.ts`). */
  path: string;
  /** Messages that touched it, newest first. */
  hits: ViewFileHit[];
  count: number;
  /** Time of the newest hit. */
  lastAt?: string;
}

/** One project card in the global panel. */
export interface PanelProject {
  name: string;
  path: string;
  /** True when the registered directory no longer exists. */
  missing: boolean;
  /** `updatedAt` of the project's most recently updated session. */
  lastActivity: string | null;
  /** Pending items flagged `needsUser` after merging active sessions. */
  needsUserCount: number;
  /** `file://` URL of the project's map; null when the directory is gone. */
  lineageUrl: string | null;
}

/**
 * Global settings on the panel. `gitPolicy` and `agents` are shown read-only;
 * the keys in `PANEL_EDITABLE_KEYS` are editable when the page comes from the
 * local server (over `file://` everything stays read-only).
 */
export interface PanelSettings {
  language: string;
  updateEveryTurns: number;
  sessionEndCatchUp: boolean;
  catchUpModel: string;
  messageSummaries: boolean;
  startupContext: boolean;
  gitPolicy: "ignore" | "commit";
  agents: string[];
}

/**
 * The subset `GET /api/config` returns and a settings modal may change
 * (Story 8.13). Everything else stays on `cogit config set`.
 */
export type PanelEditableSettings = Pick<PanelSettings, PanelEditableKey>;

export interface PanelViewModel {
  kind: "panel";
  schema: typeof VIEW_SCHEMA;
  generatedAt: string;
  settings: PanelSettings;
  /** Registry order. */
  projects: PanelProject[];
}

/** Either page the template can render; the embedded data decides which. */
export type PageModel = LineageViewModel | PanelViewModel;
