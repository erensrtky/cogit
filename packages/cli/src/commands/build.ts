import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { CliError, type Io } from "../io.js";
import { redactDeep } from "../redact.js";
import type { Session } from "../schema/session.js";
import { atomicWrite } from "../store/fs.js";
import { projectPaths } from "../store/paths.js";
import { loadProject, loadSession } from "../store/stores.js";
import { buildViewModel, embedViewModel } from "../view/lineage.js";
import type { LineageViewModel } from "../view/model.js";
import { TEMPLATE_HTML } from "../view/template.js";
import { collectTranscriptIds } from "../view/transcripts.js";

export interface BuildOptions {
  dir: string;
  io: Io;
  /** Replaces the bundled template; tests inject a minimal page. */
  templateHtml?: string;
  /** `session write` rebuilds without printing a success line. */
  quiet?: boolean;
}

async function listSessions(dir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.slice(0, -".json".length))
    .sort();
}

async function loadAllSessions(root: string, io: Io): Promise<Session[]> {
  const sessions: Session[] = [];
  for (const id of await listSessions(projectPaths(root).sessions)) {
    const loaded = await loadSession(root, id);
    if (!loaded.found) continue;
    if (!loaded.ok) {
      io.warn(`skipping session ${id}: ${loaded.error}`);
      continue;
    }
    for (const warning of loaded.warnings) io.warn(`session ${id}: ${warning}`);
    sessions.push(loaded.data);
  }
  return sessions;
}

/**
 * Rebuilds `.codelineage/lineage.html` from `project.json` and every session file.
 * One unreadable session is a warning, never a failed build.
 */
export async function buildProject(opts: BuildOptions): Promise<LineageViewModel> {
  const { io } = opts;
  const root = resolve(opts.dir);
  const project = await loadProject(root);
  if (!project.found)
    throw new CliError(`${root} is not initialized; run \`codelineage init\` first`);
  if (!project.ok) throw new CliError(project.error);
  for (const warning of project.warnings) io.warn(warning);

  const paths = projectPaths(root);
  const model = buildViewModel({
    project: project.data,
    sessions: await loadAllSessions(root, io),
    path: root,
    generatedAt: io.now(),
    transcripts: await collectTranscriptIds(io.env),
  });
  // The skill already avoids secrets; this is the safety net before rendering.
  const redacted = redactDeep(model);
  if (redacted.count > 0) io.warn(`redacted ${redacted.count} secret-looking value(s) in the map`);

  const template = opts.templateHtml ?? TEMPLATE_HTML;
  await atomicWrite(paths.html, embedViewModel(template, redacted.value));
  if (!opts.quiet) io.out(`Wrote ${paths.html}`);
  return redacted.value;
}
