import { type SpawnOptions, spawn } from "node:child_process";
import { type FSWatcher, watch } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { globalPaths, projectPaths } from "./store/paths.js";
import { loadConfig, loadRegistry } from "./store/stores.js";
import { LIVE_META_NAME } from "./view/model.js";

/** A page nobody is looking at is a dead server after this long. */
export const DEFAULT_IDLE_MS = 30 * 60 * 1000;

/** How long `open` waits for a freshly spawned server to answer. */
export const START_WAIT_MS = 1500;

const HOST = "127.0.0.1";
const LIVE_META = `<meta name="${LIVE_META_NAME}" content="1">`;

/**
 * Marks a page as served by the local server. The page only subscribes to
 * rebuild events when this tag is present, so `file://` pages (and the Vite dev
 * server) stay silent.
 */
export function injectLiveMeta(html: string): string {
  if (html.includes(LIVE_META)) return html;
  return html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${LIVE_META}`);
}

export interface MapServerOptions {
  env?: NodeJS.ProcessEnv;
  /** 0 lets the OS pick a free port (tests). */
  port: number;
  hostname?: string;
  /** Exit after this long without a connected page (tests use a short one). */
  idleMs?: number;
}

export interface MapServer {
  port: number;
  host: string;
  /** `http://127.0.0.1:<port>`; pages live under `/map` and `/panel`. */
  url: string;
  close: () => Promise<void>;
  /** Resolves once the server has closed (including the idle exit). */
  closed: Promise<void>;
}

interface PageTarget {
  /** The HTML file served for the page and watched for rebuilds. */
  file: string;
  /** Directory to watch: atomic writes replace the file, the directory keeps its name. */
  dir: string;
}

interface WatchedPage {
  watcher?: FSWatcher;
  clients: Set<ServerResponse>;
  timer: NodeJS.Timeout | null;
}

function hostAllowed(host: string | undefined, port: number): boolean {
  return host === `${HOST}:${port}` || host === `localhost:${port}`;
}

function respond(res: ServerResponse, status: number, body: string): void {
  // A stream that already started (the event endpoint) can only be ended.
  if (!res.headersSent) res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

/** The root of a registered project, or null when the request names another path. */
async function registeredRoot(env: NodeJS.ProcessEnv, dir: string): Promise<string | null> {
  const requested = resolve(dir);
  const registry = await loadRegistry(env);
  if (!registry.found || !registry.ok) return null;
  return registry.data.projects.some((entry) => resolve(entry.path) === requested)
    ? requested
    : null;
}

/**
 * What a request may see: the panel, or the map of a project in the registry.
 * Nothing else in the filesystem is reachable, which is what keeps this server
 * a viewer and not a file server.
 */
async function pageTarget(env: NodeJS.ProcessEnv, url: URL): Promise<PageTarget | null> {
  const panel = (): PageTarget => {
    const paths = globalPaths(env);
    return { file: paths.panel, dir: paths.base };
  };
  if (url.pathname === "/") return panel();
  if (url.pathname === "/map" || url.pathname === "/events") {
    const raw = url.searchParams.get("dir");
    // The panel's event stream lives at /events without a directory.
    if (!raw) return url.pathname === "/events" ? panel() : null;
    const root = await registeredRoot(env, raw);
    if (!root) return null;
    const paths = projectPaths(root);
    return { file: paths.html, dir: paths.base };
  }
  return null;
}

/** URL of a project's map on a running server. */
export function mapPageUrl(base: string, root: string): string {
  return `${base}/map?dir=${encodeURIComponent(root)}`;
}

/**
 * Starts the local map server. It serves the panel and the maps of registered
 * projects, tells connected pages when one is rebuilt and exits after `idleMs`
 * without a connected page. It binds `127.0.0.1` only and rejects a `Host`
 * header that names any other host (DNS rebinding).
 */
export async function startMapServer(opts: MapServerOptions): Promise<MapServer> {
  const env = opts.env ?? process.env;
  const hostname = opts.hostname ?? HOST;
  const idleMs = opts.idleMs ?? DEFAULT_IDLE_MS;
  const pages = new Map<string, WatchedPage>();
  let openPages = 0;
  let idleTimer: NodeJS.Timeout | null = null;
  let closing: Promise<void> | null = null;
  let resolveClosed: () => void = () => {};
  const closed = new Promise<void>((done) => {
    resolveClosed = done;
  });

  function clearIdle(): void {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = null;
  }

  function scheduleIdle(ms: number): void {
    clearIdle();
    idleTimer = setTimeout(() => {
      idleTimer = null;
      void close();
    }, ms);
  }

  function broadcast(page: WatchedPage): void {
    for (const client of page.clients) {
      if (client.writableEnded) continue;
      client.write("event: change\ndata: rebuilt\n\n");
    }
  }

  function watched(file: string, dir: string): WatchedPage {
    const existing = pages.get(file);
    if (existing) return existing;
    const page: WatchedPage = { clients: new Set(), timer: null };
    try {
      page.watcher = watch(dir, { persistent: false }, (_event, name) => {
        // A null name means "something in here changed" on some platforms.
        if (name !== null && name.toString() !== basename(file)) return;
        if (page.timer !== null) clearTimeout(page.timer);
        // One rebuild emits several events; tell the page once.
        page.timer = setTimeout(() => {
          page.timer = null;
          broadcast(page);
        }, 50);
      });
    } catch {
      // The page can still be viewed; it just will not refresh by itself.
    }
    pages.set(file, page);
    return page;
  }

  function release(file: string, page: WatchedPage): void {
    if (page.clients.size > 0) return;
    page.watcher?.close();
    if (page.timer !== null) clearTimeout(page.timer);
    pages.delete(file);
  }

  const server = createHttpServer((req, res) => {
    // A broken registry or an unexpected error must not take the server down.
    void handle(req, res).catch(() => respond(res, 500, "internal error"));
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const port = (server.address() as AddressInfo | null)?.port ?? opts.port;
    if (req.method !== "GET" && req.method !== "HEAD") {
      respond(res, 405, "method not allowed");
      return;
    }
    if (!hostAllowed(req.headers.host, port)) {
      respond(res, 403, "forbidden");
      return;
    }
    const url = new URL(req.url ?? "/", `http://${HOST}:${port}`);
    if (url.pathname === "/health") {
      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify({ ok: true, name: "codelineage", home: globalPaths(env).base }));
      return;
    }
    const target = await pageTarget(env, url);
    if (!target) {
      respond(res, 404, "not found");
      return;
    }

    if (url.pathname === "/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write("retry: 1000\n\n");
      const page = watched(target.file, target.dir);
      page.clients.add(res);
      res.on("error", () => page.clients.delete(res));
      openPages += 1;
      clearIdle();
      req.on("close", () => {
        page.clients.delete(res);
        release(target.file, page);
        openPages = Math.max(0, openPages - 1);
        if (openPages === 0) scheduleIdle(idleMs);
      });
      return;
    }

    let html: string;
    try {
      html = await readFile(target.file, "utf8");
    } catch {
      respond(res, 404, "not found");
      return;
    }
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(req.method === "HEAD" ? undefined : injectLiveMeta(html));
  }

  await new Promise<void>((done, fail) => {
    const onError = (err: Error): void => fail(err);
    server.once("error", onError);
    server.listen(opts.port, hostname, () => {
      server.off("error", onError);
      done();
    });
  });

  const port = (server.address() as AddressInfo).port;
  const url = `http://${hostname}:${port}`;

  function close(): Promise<void> {
    if (closing) return closing;
    closing = (async () => {
      clearIdle();
      for (const page of pages.values()) {
        page.watcher?.close();
        if (page.timer !== null) clearTimeout(page.timer);
        for (const client of page.clients) client.end();
        page.clients.clear();
      }
      pages.clear();
      await new Promise<void>((done) => server.close(() => done()));
      resolveClosed();
    })();
    return closing;
  }

  // Nothing may look at the page in the first moments after `open` spawns the
  // server; the same idle rule covers that start.
  scheduleIdle(idleMs);

  return { port, host: hostname, url, close, closed };
}

interface HealthBody {
  name?: unknown;
  home?: unknown;
}

/**
 * True when a codelineage server for this user's home answers on the port. The
 * home check keeps two users (or two `CODELINEAGE_HOME`s) apart on one port.
 */
export async function checkHealth(url: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(500) });
    if (!response.ok) return false;
    const body = (await response.json()) as HealthBody;
    return body.name === "codelineage" && body.home === globalPaths(env).base;
  } catch {
    return false;
  }
}

type SpawnFn = (command: string, args: string[], options: SpawnOptions) => { unref: () => void };

const systemSpawn: SpawnFn = (command, args, options) => spawn(command, args, options);

/** Starts `node <cli> serve --port <port>` detached, with hooks silenced in the child. */
export function spawnServerProcess(
  cli: string,
  port: number,
  env: NodeJS.ProcessEnv,
  spawnFn: SpawnFn = systemSpawn,
): void {
  spawnFn(process.execPath, [cli, "serve", "--port", String(port)], {
    detached: true,
    stdio: "ignore",
    env: { ...env, CODELINEAGE_DISABLE: "1" },
  }).unref();
}

export interface EnsureServerDeps {
  /** The CLI file the detached server runs; defaults to the running script. */
  cli?: string;
  /** Starts the detached server; tests observe instead of spawning. */
  spawn?: (cli: string, port: number, env: NodeJS.ProcessEnv) => void;
  /** Health probe; tests replace the network with a function. */
  health?: (url: string, env: NodeJS.ProcessEnv) => Promise<boolean>;
  /** How long to wait for a spawned server before giving up. */
  waitMs?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

/**
 * Returns the base URL of a running map server for this user, starting one
 * detached when needed. Null means "cannot have a server" (the port answers as
 * something else, or the child never came up): the caller opens the file.
 */
export async function ensureServer(
  env: NodeJS.ProcessEnv,
  deps: EnsureServerDeps = {},
): Promise<string | null> {
  const { serverPort } = await loadConfig(env);
  const base = `http://${HOST}:${serverPort}`;
  const health = deps.health ?? checkHealth;
  if (await health(base, env)) return base;

  const cli = deps.cli ?? process.argv[1] ?? fileURLToPath(import.meta.url);
  (deps.spawn ?? spawnServerProcess)(cli, serverPort, env);

  const deadline = Date.now() + (deps.waitMs ?? START_WAIT_MS);
  while (Date.now() < deadline) {
    await delay(50);
    if (await health(base, env)) return base;
  }
  return null;
}
