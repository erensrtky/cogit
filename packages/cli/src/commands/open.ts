import { type SpawnOptions, spawn } from "node:child_process";
import { resolve } from "node:path";
import type { Io } from "../io.js";
import { projectPaths } from "../store/paths.js";
import { buildProject } from "./build.js";

export const PANEL_NOT_READY =
  "The global panel arrives with Epic 3. Run `codelineage open <dir>` to open a project's map.";

export interface OpenOptions {
  dir: string;
  io: Io;
  /** Tests inject a minimal page instead of the bundled template. */
  templateHtml?: string;
  /** Tests replace the OS opener; resolves false when none is available. */
  launch?: (file: string) => Promise<boolean>;
}

export interface OpenerCommand {
  command: string;
  args: string[];
}

/** The opener that ships with the platform; Windows `start` is a shell builtin. */
export function openerCommand(platform: NodeJS.Platform, file: string): OpenerCommand {
  if (platform === "darwin") return { command: "open", args: [file] };
  if (platform === "win32") return { command: "cmd", args: ["/c", "start", "", file] };
  return { command: "xdg-open", args: [file] };
}

type SpawnLike = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => { once: (event: "spawn" | "error", listener: () => void) => unknown; unref: () => void };

const systemSpawn: SpawnLike = (command, args, options) => spawn(command, args, options);

/**
 * Starts the OS opener detached. Resolves false when the binary is missing so
 * the caller can print the path instead of leaving the user without anything.
 */
export function launchFile(file: string, spawnFn: SpawnLike = systemSpawn): Promise<boolean> {
  const { command, args } = openerCommand(process.platform, file);
  return new Promise((done) => {
    const child = spawnFn(command, args, { detached: true, stdio: "ignore" });
    child.once("error", () => done(false));
    child.once("spawn", () => {
      child.unref();
      done(true);
    });
  });
}

/** Rebuilds the map, then hands `lineage.html` to the OS opener. */
export async function openProject(opts: OpenOptions): Promise<void> {
  const { io } = opts;
  const root = resolve(opts.dir);
  await buildProject({
    dir: root,
    io,
    ...(opts.templateHtml === undefined ? {} : { templateHtml: opts.templateHtml }),
  });
  const html = projectPaths(root).html;
  const opened = await (opts.launch ?? launchFile)(html);
  if (opened) {
    io.out(`Opened ${html}`);
    return;
  }
  io.out(html);
  io.warn("no application opener found; open the file manually");
}
