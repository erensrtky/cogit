import type { NodeKind } from "../schema/session.js";

/**
 * Serialized contract between `codelineage build` and the HTML template. The
 * builder fills this shape, JSON-serializes it into the page's data element and
 * the React app in `packages/template` renders it. Keep this file free of runtime
 * dependencies so both sides can import it.
 */

/** Id of the `<script type="application/json">` that carries the model. */
export const DATA_ELEMENT_ID = "codelineage-data";

/** Version of the serialized view model (not the session schema). */
export const VIEW_SCHEMA = 1;

export interface ViewNode {
  id: string;
  kind: NodeKind;
  title: string;
  summary?: string;
  why?: string;
  at?: string;
  /** Nested children, already ordered as the graph should draw them. */
  children: ViewNode[];
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

export interface ViewSession {
  sessionId: string;
  agent: string;
  title: string;
  epoch: string | null;
  startedAt: string;
  updatedAt: string;
  status: ViewStatus;
  nodes: ViewNode[];
  /** False when the Claude Code transcript is gone, so resume cannot work. */
  transcriptAvailable: boolean;
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
