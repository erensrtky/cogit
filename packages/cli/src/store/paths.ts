import { homedir } from "node:os";
import { join } from "node:path";

export const DIR_NAME = ".cogit";
/** The name cogit used before Story 9.1; still read so a record is never lost. */
export const OLD_DIR_NAME = ".codelineage";
export const CONFIG_DIR_NAME = "cogit";
export const OLD_CONFIG_DIR_NAME = "codelineage";

/** `COGIT_HOME`, still accepting `CODELINEAGE_HOME` for one minor version. */
export function configuredHome(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.COGIT_HOME ?? env.CODELINEAGE_HOME;
}

/** Hooks are off when either the current or the legacy switch is set. */
export function captureDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.COGIT_DISABLE === "1" || env.CODELINEAGE_DISABLE === "1";
}

export function projectPaths(root: string) {
  const base = join(root, DIR_NAME);
  return {
    base,
    project: join(base, "project.json"),
    sessions: join(base, "sessions"),
    session: (id: string) => join(base, "sessions", `${id}.json`),
    /** Append-only structure events for a session (Story 8.5). */
    events: (id: string) => join(base, "sessions", `${id}.events.jsonl`),
    /** Pre-migration copies of the record files. */
    backup: (name: string) => join(base, name),
    /** The conversation store: what the drill-down needs, outliving the transcript. */
    conversations: join(base, "conversations"),
    conversation: (id: string) => join(base, "conversations", `${id}.jsonl.gz`),
    state: (id: string) => join(base, "state", `${id}.json`),
    locks: join(base, "locks"),
    /** Where the skill drops session JSON for `session write --file`. */
    inbox: (id: string) => join(base, "inbox", `${id}.json`),
    lock: (name: string) => join(base, "locks", `${name}.lock`),
    html: join(base, "map.html"),
  };
}

/** `$XDG_CONFIG_HOME/<name>` > `~/.config/<name>`. */
export function defaultConfigBase(name: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), name);
}

/** `COGIT_HOME` > `CODELINEAGE_HOME` > `$XDG_CONFIG_HOME/cogit` > `~/.config/cogit`. */
export function globalPaths(env: NodeJS.ProcessEnv = process.env) {
  const base = configuredHome(env) ?? defaultConfigBase(CONFIG_DIR_NAME, env);
  return {
    base,
    config: join(base, "config.json"),
    registry: join(base, "projects.json"),
    lock: join(base, "registry.lock"),
    panel: join(base, "panel.html"),
  };
}
