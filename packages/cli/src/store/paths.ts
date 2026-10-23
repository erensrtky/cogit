import { homedir } from "node:os";
import { join } from "node:path";

export const DIR_NAME = ".codelineage";

export function projectPaths(root: string) {
  const base = join(root, DIR_NAME);
  return {
    base,
    project: join(base, "project.json"),
    sessions: join(base, "sessions"),
    session: (id: string) => join(base, "sessions", `${id}.json`),
    state: (id: string) => join(base, "state", `${id}.json`),
    locks: join(base, "locks"),
    /** Where the skill drops session JSON for `session write --file`. */
    inbox: (id: string) => join(base, "inbox", `${id}.json`),
    lock: (name: string) => join(base, "locks", `${name}.lock`),
    html: join(base, "lineage.html"),
  };
}

/** `CODELINEAGE_HOME` > `$XDG_CONFIG_HOME/codelineage` > `~/.config/codelineage`. */
export function globalPaths(env: NodeJS.ProcessEnv = process.env) {
  const base =
    env.CODELINEAGE_HOME ?? join(env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "codelineage");
  return {
    base,
    config: join(base, "config.json"),
    registry: join(base, "projects.json"),
    lock: join(base, "registry.lock"),
    panel: join(base, "panel.html"),
  };
}
