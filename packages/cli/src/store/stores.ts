import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import type { z } from "zod";
import { CONFIG_SCHEMA, Config, Registry } from "../schema/config.js";
import { PROJECT_SCHEMA, Project } from "../schema/project.js";
import { SESSION_SCHEMA, Session } from "../schema/session.js";
import { type Parsed, parseVersioned } from "../schema/versioned.js";
import { atomicWriteJson, readJson } from "./fs.js";
import { type LockOptions, withLock } from "./lock.js";
import { globalPaths, projectPaths } from "./paths.js";

export type Loaded<T> = { found: false } | ({ found: true } & Parsed<T>);

async function load<S extends z.ZodType>(
  file: string,
  schema: S,
  version: number,
): Promise<Loaded<z.infer<S>>> {
  const read = await readJson(file);
  if (!read.found) return { found: false };
  if ("error" in read) return { found: true, ok: false, error: read.error, warnings: [] };
  return { found: true, ...parseVersioned(read.value, schema, version) };
}

/**
 * Locked read → update → atomic write. `fn` gets the current value (undefined if
 * the file is missing) and returns the new one. An unreadable file is an error,
 * never silently overwritten.
 */
async function update<S extends z.ZodType, R extends z.infer<S>>(
  file: string,
  lockPath: string,
  schema: S,
  version: number,
  fn: (current: z.infer<S> | undefined) => R | Promise<R>,
  opts?: LockOptions,
): Promise<R> {
  return withLock(
    lockPath,
    async () => {
      const cur = await load(file, schema, version);
      if (cur.found && !cur.ok) throw new Error(`${file}: ${cur.error}`);
      const next = await fn(cur.found && cur.ok ? cur.data : undefined);
      await atomicWriteJson(file, schema.parse(next));
      return next;
    },
    opts,
  );
}

export const loadProject = (root: string) =>
  load(projectPaths(root).project, Project, PROJECT_SCHEMA);

export const updateProject = (
  root: string,
  fn: (cur: Project | undefined) => Project | Promise<Project>,
) => {
  const p = projectPaths(root);
  return update(p.project, p.lock("project"), Project, PROJECT_SCHEMA, fn);
};

export const loadSession = (root: string, id: string) =>
  load(projectPaths(root).session(id), Session, SESSION_SCHEMA);

/** Ids of the `.json` files in the project's sessions directory, sorted. */
export async function listSessionIds(dir: string): Promise<string[]> {
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

/**
 * Loads every valid session of a project. One unreadable or newer file is a
 * warning, never a failure for the whole map or panel.
 */
export async function loadAllSessions(
  root: string,
  warn: (line: string) => void,
): Promise<Session[]> {
  const sessions: Session[] = [];
  for (const id of await listSessionIds(projectPaths(root).sessions)) {
    const loaded = await loadSession(root, id);
    if (!loaded.found) continue;
    if (!loaded.ok) {
      warn(`skipping session ${id}: ${loaded.error}`);
      continue;
    }
    for (const warning of loaded.warnings) warn(`session ${id}: ${warning}`);
    sessions.push(loaded.data);
  }
  return sessions;
}

export const updateSession = (
  root: string,
  id: string,
  fn: (cur: Session | undefined) => Session | Promise<Session>,
  opts?: LockOptions,
) => {
  const p = projectPaths(root);
  return update(p.session(id), p.lock(`session-${id}`), Session, SESSION_SCHEMA, fn, opts);
};

export const loadConfig = async (env?: NodeJS.ProcessEnv): Promise<Config> => {
  const cur = await load(globalPaths(env).config, Config, CONFIG_SCHEMA);
  return cur.found && cur.ok ? cur.data : Config.parse({ schema: CONFIG_SCHEMA });
};

export const updateConfig = (fn: (cur: Config) => Config, env?: NodeJS.ProcessEnv) => {
  const g = globalPaths(env);
  return update(g.config, `${g.config}.lock`, Config, CONFIG_SCHEMA, (cur) =>
    fn(cur ?? Config.parse({ schema: CONFIG_SCHEMA })),
  );
};

export const loadRegistry = (env?: NodeJS.ProcessEnv) =>
  load(globalPaths(env).registry, Registry, CONFIG_SCHEMA);

export const updateRegistry = (fn: (cur: Registry) => Registry, env?: NodeJS.ProcessEnv) => {
  const g = globalPaths(env);
  return update(g.registry, g.lock, Registry, CONFIG_SCHEMA, (cur) =>
    fn(cur ?? Registry.parse({ schema: CONFIG_SCHEMA })),
  );
};
