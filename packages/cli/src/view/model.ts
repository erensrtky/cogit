import type { BranchSummary, NodeKind } from "../schema/session.js";

/**
 * Serialized contract between `codelineage build` and the HTML template. The
 * builder fills this shape, JSON-serializes it into the page's data element and
 * the React app in `packages/template` renders it. Keep this file free of runtime
 * dependencies so both sides can import it.
 */

/** Id of the `<script type="application/json">` that carries the model. */
export const DATA_ELEMENT_ID = "codelineage-data";

/**
 * Meta tag the local map server injects into the pages it serves. The page
 * subscribes to rebuild events only when it is present, so a `file://` page or
 * the Vite dev server never tries to reach a server that is not there.
 */
export const LIVE_META_NAME = "codelineage-live";

/** Version of the serialized view model (not the session schema). */
export const VIEW_SCHEMA = 1;

export interface ViewNode {
  id: string;
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
  /** Earlier messages this one returns to or builds on besides its parent. */
  links?: string[];
  /** On a branch's first message: what that thread asked and what came of it. */
  branch?: BranchSummary;
  decidedBy?: "user" | "agent" | "agreed";
  alternatives?: { option: string; why: string }[];
  commits?: string[];
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
  /** Same id the message will get as a node (`m1`, `m2`, …). */
  id: string;
  at: string;
  /** The first words of the message, used as the card title. */
  title: string;
}

/** One user message and the agent's written answer, read from the transcript at build time. */
export interface ViewChatTurn {
  /** Same id as the message node it belongs to (`m1`, `m2`, …). */
  id: string;
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

/** Global settings, shown read-only on the panel. */
export interface PanelSettings {
  language: string;
  updateEveryTurns: number;
  sessionEndCatchUp: boolean;
  gitPolicy: "ignore" | "commit";
  agents: string[];
}

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
