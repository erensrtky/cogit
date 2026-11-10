import type { ViewSwitcherProject } from "./model.js";

/*
 * The switcher's browser half: the template imports this file, so it stays free
 * of Node modules. Building the entries from the registry is in
 * `switcher-entries.ts`.
 */

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
