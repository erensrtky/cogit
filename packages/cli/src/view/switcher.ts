import { resolve } from "node:path";
import type { PanelProject, ViewSwitcherProject } from "./model.js";

/**
 * What the collection gives the switcher: a panel card plus the line saying
 * where the project left off. Structural on purpose — this module is imported
 * by the template too, so it must not pull in the panel builder (and with it
 * the Node-only store code).
 */
export interface SwitcherSource extends PanelProject {
  leftOff: string;
}

/**
 * The map's project switcher (Story 8.12). Pure: it takes the registry projects
 * the same way the panel collects them and returns what the page's tab strip
 * and Ctrl/Cmd+K search draw. No disk, no model calls.
 *
 * Order is the story's order: most recently active first, a project with no
 * session after those with one. A project whose directory is gone is left out —
 * offering a map that cannot be opened is worse than not offering it.
 */
export function switcherEntries(
  projects: SwitcherSource[],
  currentPath: string,
): ViewSwitcherProject[] {
  const current = resolve(currentPath);
  return projects
    .filter((project) => !project.missing && project.lineageUrl !== null)
    .map((project) => ({
      name: project.name,
      path: project.path,
      lastActivity: project.lastActivity,
      leftOff: project.leftOff,
      lineageUrl: project.lineageUrl as string,
      current: resolve(project.path) === current,
    }))
    .sort((a, b) => {
      const byTime = time(b.lastActivity) - time(a.lastActivity);
      // Two projects with no session have no times to subtract (Infinity - Infinity
      // is NaN), so they fall through to the name/path order.
      if (byTime > 0) return 1;
      if (byTime < 0) return -1;
      return a.name.localeCompare(b.name) || a.path.localeCompare(b.path);
    });
}

/** Tabs drawn in the strip; every other project stays behind the search. */
export const SWITCHER_RECENT_LIMIT = 6;

/** The tab strip's projects: the list is already most-recently-active first. */
export function recentSwitcherProjects(projects: ViewSwitcherProject[]): ViewSwitcherProject[] {
  return projects.slice(0, SWITCHER_RECENT_LIMIT);
}

/** Case-insensitive search over a project's name, path and "where I left off". */
export function filterSwitcherProjects(
  projects: ViewSwitcherProject[],
  query: string,
): ViewSwitcherProject[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return projects;
  return projects.filter((project) =>
    `${project.name} ${project.path} ${project.leftOff}`.toLowerCase().includes(needle),
  );
}

function time(value: string | null): number {
  if (value === null) return Number.NEGATIVE_INFINITY;
  const at = Date.parse(value);
  return Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at;
}
