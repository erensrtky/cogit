import { type SpawnOptions, spawn } from "node:child_process";
import type { Io } from "../io.js";
import { ensureServer, mapPageUrl } from "../server.js";
import { globalPaths, projectPaths } from "../store/paths.js";
import { resolveProjectRoot } from "../store/root.js";
import { buildPanel } from "../view/panel.js";
import { buildProject } from "./build.js";

export interface OpenOptions {
  io: Io;
  /** Tests inject a minimal page instead of the bundled template. */
  templateHtml?: string;
  /** Tests replace the OS opener; resolves false when none is available. */
  launch?: (target: string) => Promise<boolean>;
  /** Tests replace the local map server; resolves the URL base or null. */
  server?: (env: NodeJS.ProcessEnv) => Promise<string | null>;
}

/** Any failure here means "no server", never a failed `open`. */
export async function defaultServer(env: NodeJS.ProcessEnv): Promise<string | null> {
  try {
    return await ensureServer(env);
  } catch {
    return null;
  }
}

export interface OpenProjectOptions extends OpenOptions {
  dir: string;
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

/** Hands a page URL or file to the OS opener, or prints it when none exists. */
async function openTarget(target: string, opts: OpenOptions): Promise<void> {
  const { io } = opts;
  const opened = await (opts.launch ?? launchFile)(target);
  if (opened) {
    io.out(`Opened ${target}`);
    return;
  }
  io.out(target);
  io.warn("no application opener found; open it manually");
}

/**
 * Rebuilds the map, then opens it through the local map server so the page can
 * refresh itself. The file remains the fallback: when no server can run (port
 * taken, spawn failed) `open` still shows the map, just without live updates.
 */
export async function openProject(opts: OpenProjectOptions): Promise<void> {
  const { io } = opts;
  const { root } = await resolveProjectRoot(opts.dir);
  await buildProject({
    dir: root,
    io,
    ...(opts.templateHtml === undefined ? {} : { templateHtml: opts.templateHtml }),
  });
  const base = await (opts.server ?? defaultServer)(io.env);
  if (base) {
    await openTarget(mapPageUrl(base, root), opts);
    return;
  }
  io.warn("could not start the local map server; opened the file instead");
  await openTarget(projectPaths(root).html, opts);
}

/** Rebuilds the global panel, then opens it through the local map server. */
export async function openPanel(opts: OpenOptions): Promise<void> {
  await buildPanel({
    env: opts.io.env,
    io: opts.io,
    ...(opts.templateHtml === undefined ? {} : { templateHtml: opts.templateHtml }),
  });
  const base = await (opts.server ?? defaultServer)(opts.io.env);
  if (base) {
    await openTarget(`${base}/`, opts);
    return;
  }
  opts.io.warn("could not start the local map server; opened the file instead");
  await openTarget(globalPaths(opts.io.env).panel, opts);
}
