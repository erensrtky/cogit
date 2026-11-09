/**
 * How the viewer left the map's views, per project: which view was open, the
 * side panel, and the Graph view's file, layers and place in the onion. A
 * per-viewer convenience like the theme, kept in localStorage; a refresh or a
 * switch between the views comes back to it. Storage that is missing, full or
 * blocked only costs the memory, never the page.
 */

export interface ViewMemory {
  layout?: "git" | "graph";
  panel?: "outline" | "files" | "tasks" | "none";
  graphFocus?: string | null;
  showFiles?: boolean;
  showCommits?: boolean;
  inPlace?: boolean;
  inside?: { session: string; branch?: string } | null;
  peeledSessions?: string[];
  peeledBranches?: string[];
}

const PREFIX = "cogit.view:";

function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** What was remembered for the project at `dir`; empty when nothing was, or it cannot be read. */
export function readViewMemory(dir: string): ViewMemory {
  try {
    const raw = storage()?.getItem(PREFIX + dir);
    if (raw === null || raw === undefined) return {};
    const value: unknown = JSON.parse(raw);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as ViewMemory)
      : {};
  } catch {
    return {};
  }
}

/** Remembers `patch` for the project at `dir` on top of what was there. */
export function rememberView(dir: string, patch: ViewMemory): void {
  try {
    storage()?.setItem(PREFIX + dir, JSON.stringify({ ...readViewMemory(dir), ...patch }));
  } catch {
    // Full or blocked storage: the page works, it only forgets.
  }
}
