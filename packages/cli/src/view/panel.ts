import { stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { Io } from "../io.js";
import { redactDeep } from "../redact.js";
import type { RegistryEntry } from "../schema/config.js";
import { atomicWrite } from "../store/fs.js";
import { globalPaths, projectPaths } from "../store/paths.js";
import { loadAllSessions, loadConfig, loadRegistry } from "../store/stores.js";
import { embedViewModel, statusCard } from "./lineage.js";
import { type PanelProject, type PanelViewModel, VIEW_SCHEMA } from "./model.js";
import { TEMPLATE_HTML } from "./template.js";

export interface PanelOptions {
  env: NodeJS.ProcessEnv;
  io: Io;
  /** Replaces the bundled template; tests inject a minimal page. */
  templateHtml?: string;
}

const PANEL_TITLE = "<title>codelineage — panel</title>";

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * One card per registry entry. A directory that is gone is marked missing
 * instead of failing the panel; one unreadable project is a warning.
 */
export async function collectPanelProjects(
  entries: RegistryEntry[],
  generatedAt: string,
  warn: (line: string) => void,
): Promise<PanelProject[]> {
  const projects: PanelProject[] = [];
  for (const entry of entries) {
    if (!(await isDirectory(entry.path))) {
      projects.push({
        name: entry.name,
        path: entry.path,
        missing: true,
        lastActivity: null,
        needsUserCount: 0,
        lineageUrl: null,
      });
      continue;
    }
    try {
      const card = statusCard(await loadAllSessions(entry.path, warn), generatedAt);
      projects.push({
        name: entry.name,
        path: entry.path,
        missing: false,
        lastActivity: card.lastActivity,
        needsUserCount: card.pending.filter((item) => item.needsUser).length,
        lineageUrl: pathToFileURL(projectPaths(entry.path).html).href,
      });
    } catch (err) {
      warn(`skipping project ${entry.path}: ${(err as Error).message}`);
      projects.push({
        name: entry.name,
        path: entry.path,
        missing: false,
        lastActivity: null,
        needsUserCount: 0,
        lineageUrl: pathToFileURL(projectPaths(entry.path).html).href,
      });
    }
  }
  return projects;
}

/**
 * Builds the global panel from `projects.json` and `config.json` and writes it
 * next to them. The caller decides whether an unwritable global directory is a
 * warning (`build`) or an error (`open` without a directory).
 */
export async function buildPanel(opts: PanelOptions): Promise<PanelViewModel> {
  const { io } = opts;
  const generatedAt = io.now();
  const [config, registry] = await Promise.all([loadConfig(opts.env), loadRegistry(opts.env)]);
  if (registry.found && !registry.ok) {
    io.warn(`registry: ${registry.error}; showing no projects`);
  } else if (registry.found) {
    for (const warning of registry.warnings) io.warn(warning);
  }
  const entries = registry.found && registry.ok ? registry.data.projects : [];

  const model: PanelViewModel = {
    kind: "panel",
    schema: VIEW_SCHEMA,
    generatedAt,
    settings: {
      language: config.language,
      updateEveryTurns: config.updateEveryTurns,
      sessionEndCatchUp: config.sessionEndCatchUp,
      gitPolicy: config.gitPolicy,
      agents: config.agents,
    },
    projects: await collectPanelProjects(entries, generatedAt, io.warn),
  };

  // Same safety net as the map: nothing leaves this process unredacted.
  const redacted = redactDeep(model);
  if (redacted.count > 0)
    io.warn(`redacted ${redacted.count} secret-looking value(s) in the panel`);

  const template = (opts.templateHtml ?? TEMPLATE_HTML).replace(
    /<title>[^<]*<\/title>/,
    PANEL_TITLE,
  );
  await atomicWrite(globalPaths(opts.env).panel, embedViewModel(template, redacted.value));
  return redacted.value;
}
