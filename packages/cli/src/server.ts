import { type SpawnOptions, spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { type FSWatcher, watch } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "../package.json" with { type: "json" };
import { defaultAgent } from "./agents/index.js";
import { buildProject } from "./commands/build.js";
import { diffTooLarge, isDiffSha, readCommitDiff } from "./diff.js";
import { defaultsPrompter, type Io } from "./io.js";
import { Config } from "./schema/config.js";
import { refreshShareConversations } from "./share.js";
import { dismissInboxSession } from "./store/inbox-state.js";
import { LockBusyError } from "./store/lock.js";
import { globalPaths, projectPaths } from "./store/paths.js";
import { setMessageRead } from "./store/read-state.js";
import { loadConfig, loadRegistry, updateConfig } from "./store/stores.js";
import { isPanelEditableKey, LIVE_META_NAME, TOKEN_META_NAME } from "./view/model.js";
import { buildPanel, panelSettings } from "./view/panel.js";
import { editableSettings } from "./view/settings.js";

/** The CLI's version: a server of another version is not reused (see `ensureServer`). */
const VERSION: string = pkg.version;

/** A page nobody is looking at is a dead server after this long. */
export const DEFAULT_IDLE_MS = 30 * 60 * 1000;

/** How long `open` waits for a freshly spawned server to answer. */
export const START_WAIT_MS = 1500;

const HOST = "127.0.0.1";
const LIVE_META = `<meta name="${LIVE_META_NAME}" content="1">`;

/** Header a settings write must carry, with the token from the panel page. */
export const CONFIG_TOKEN_HEADER = "x-cogit-token";

/** A settings write is a tiny JSON object; anything larger is not ours. */
export const CONFIG_BODY_LIMIT = 4096;

/**
 * Marks a page as served by the local server. The page only subscribes to
 * rebuild events when this tag is present, so `file://` pages (and the Vite dev
 * server) stay silent.
 */
export function injectLiveMeta(html: string): string {
  if (html.includes(LIVE_META)) return html;
  return html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${LIVE_META}`);
}

/**
 * Carries the per-server token into every page the server serves (Story 8.13):
 * both the panel and each project map open a settings modal that reads and
 * writes through `/api/config`.
 */
export function injectTokenMeta(html: string, token: string): string {
  const meta = `<meta name="${TOKEN_META_NAME}" content="${token}">`;
  if (html.includes(meta)) return html;
  return html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${meta}`);
}

export interface MapServerOptions {
  env?: NodeJS.ProcessEnv;
  /** 0 lets the OS pick a free port (tests). */
  port: number;
  hostname?: string;
  /** Exit after this long without a connected page (tests use a short one). */
  idleMs?: number;
  /** Quiet time after the last transcript write before a map rebuild (tests use a short one). */
  transcriptDebounceMs?: number;
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
  /** The registered project the map belongs to; absent for the panel. */
  root?: string;
}

interface WatchedPage {
  watcher?: FSWatcher;
  clients: Set<ServerResponse>;
  timer: NodeJS.Timeout | null;
  /** The project to rebuild while this page has a transcript write (Story 9.5). */
  root?: string;
}

function hostAllowed(host: string | undefined, port: number): boolean {
  return host === `${HOST}:${port}` || host === `localhost:${port}`;
}

function respond(res: ServerResponse, status: number, body: string): void {
  // A stream that already started (the event endpoint) can only be ended.
  if (!res.headersSent) res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

/** An API answer as JSON; the diff endpoint's body is text, so it needs this. */
function respondJson(res: ServerResponse, status: number, body: unknown): void {
  if (!res.headersSent)
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
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
    return { file: paths.html, dir: paths.base, root };
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
  const transcriptDebounceMs = opts.transcriptDebounceMs ?? 1000;
  const pages = new Map<string, WatchedPage>();
  /** A quiet build IO: rebuilds a page without printing to a terminal nobody watches. */
  const buildIo: Io = {
    prompt: defaultsPrompter,
    out: () => {},
    warn: () => {},
    env,
    now: () => new Date().toISOString(),
  };
  /** Watches Claude Code's transcripts while somebody has a map open (9.5). */
  let transcriptWatcher: FSWatcher | undefined;
  let transcriptTimer: NodeJS.Timeout | null = null;
  /** Rebuilds run one after another, so a write during a build is never dropped. */
  let rebuildQueue: Promise<void> = Promise.resolve();
  /** One random token per server start; the panel page carries it into a write. */
  const token = randomBytes(24).toString("hex");
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

  function watched(file: string, dir: string, root?: string): WatchedPage {
    const existing = pages.get(file);
    if (existing) return existing;
    const page: WatchedPage = {
      clients: new Set(),
      timer: null,
      ...(root === undefined ? {} : { root }),
    };
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

  /**
   * Rebuilds every map somebody is looking at, from the records and the
   * transcripts. The write itself reaches the page through the page watcher; a
   * failing project is skipped so one broken record never stops the others.
   */
  async function rebuildOpenMaps(): Promise<void> {
    const roots = new Set<string>();
    for (const page of pages.values()) {
      if (page.root !== undefined && page.clients.size > 0) roots.add(page.root);
    }
    for (const root of roots) {
      try {
        await buildProject({ dir: root, io: buildIo, quiet: true });
      } catch {
        // Already a warning where the project is read; keep the page up.
      }
    }
  }

  /** Queues a rebuild behind any running one; the debounce already collapsed the burst. */
  function queueRebuild(): void {
    rebuildQueue = rebuildQueue.then(() => rebuildOpenMaps());
  }

  /**
   * Follows Claude Code's transcripts while a map page is open (Story 9.5), so
   * the map is live without the plugin's Stop hook. One recursive watcher over
   * the Claude projects directory covers every registered project, and a turn's
   * many writes collapse into one debounced rebuild. No page, no watch.
   */
  function startTranscriptWatch(): void {
    if (transcriptWatcher !== undefined) return;
    const dir = join(defaultAgent().configDir(env), "projects");
    try {
      transcriptWatcher = watch(dir, { persistent: false, recursive: true }, (_event, name) => {
        if (name === null || !name.toString().endsWith(".jsonl")) return;
        if (transcriptTimer !== null) clearTimeout(transcriptTimer);
        transcriptTimer = setTimeout(() => {
          transcriptTimer = null;
          queueRebuild();
        }, transcriptDebounceMs);
      });
    } catch {
      // No Claude home (or no recursive watch here): the Stop hook still rebuilds.
      transcriptWatcher = undefined;
    }
  }

  function stopTranscriptWatch(): void {
    transcriptWatcher?.close();
    transcriptWatcher = undefined;
    if (transcriptTimer !== null) clearTimeout(transcriptTimer);
    transcriptTimer = null;
  }

  /** Whether any project map (not just the panel) still has a viewer. */
  function mapPagesOpen(): boolean {
    return [...pages.values()].some((page) => page.root !== undefined && page.clients.size > 0);
  }

  const server = createHttpServer((req, res) => {
    // A broken registry or an unexpected error must not take the server down.
    void handle(req, res).catch(() => respond(res, 500, "internal error"));
  });

  function tokenMatches(given: string | string[] | undefined): boolean {
    const value = Array.isArray(given) ? given[0] : given;
    if (typeof value !== "string") return false;
    const a = Buffer.from(value);
    const b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Same origin only: a page from another site cannot post even with its own Host. */
  function originAllowed(origin: string | undefined, port: number): boolean {
    return origin === `http://${HOST}:${port}` || origin === `http://localhost:${port}`;
  }

  /**
   * A same-origin GET carries no Origin header, so absence is fine; a present
   * Origin must still be this server (Story 8.13).
   */
  function readOriginAllowed(origin: string | undefined, port: number): boolean {
    return origin === undefined || originAllowed(origin, port);
  }

  async function readLimitedBody(req: IncomingMessage): Promise<string | null> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      size += buf.length;
      if (size > CONFIG_BODY_LIMIT) {
        req.resume();
        return null;
      }
      chunks.push(buf);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  /**
   * Rebuilds the data of the pages somebody is looking at, as `build` does, so
   * the open pages get a change event with the new settings. Best effort: the
   * write already landed, so a failed rebuild must not fail the request.
   */
  async function refreshOpenPages(): Promise<void> {
    let rebuiltMap = false;
    const registry = await loadRegistry(env);
    if (registry.found && registry.ok) {
      for (const entry of registry.data.projects) {
        const page = pages.get(projectPaths(entry.path).html);
        if (!page || page.clients.size === 0) continue;
        try {
          await buildProject({ dir: entry.path, io: buildIo, quiet: true });
          rebuiltMap = true;
        } catch {
          // A broken project is already a warning elsewhere; keep serving.
        }
      }
    }
    if (rebuiltMap) return;
    try {
      // `buildProject` rebuilds the panel too; without an open map, do it here.
      await buildPanel({ env, io: buildIo });
    } catch {
      // An unwritable global directory leaves the old page in place.
    }
  }

  /**
   * `GET /api/config`: the values the settings modal opens with (Story 8.13).
   * Same Host, Origin and token checks as the write, and only the keys the modal
   * may change; the setup-time keys never leave the config file.
   */
  async function readConfig(
    req: IncomingMessage,
    res: ServerResponse,
    port: number,
  ): Promise<void> {
    if (
      !readOriginAllowed(req.headers.origin, port) ||
      !tokenMatches(req.headers[CONFIG_TOKEN_HEADER])
    ) {
      respond(res, 403, "forbidden");
      return;
    }
    const config = await loadConfig(env);
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify({ ok: true, settings: editableSettings(panelSettings(config)) }));
  }

  /**
   * `GET /api/diff?dir&commit[&file]` (Story 10.5): one commit's patch for the
   * message details. Read-only, a registered project only, and the same Origin
   * and token checks as the settings read. A bad or unknown hash is a 4xx, and
   * an oversized patch comes back as a one-line notice instead of the bytes.
   */
  async function readDiff(
    req: IncomingMessage,
    res: ServerResponse,
    port: number,
    url: URL,
  ): Promise<void> {
    if (
      !readOriginAllowed(req.headers.origin, port) ||
      !tokenMatches(req.headers[CONFIG_TOKEN_HEADER])
    ) {
      respond(res, 403, "forbidden");
      return;
    }
    const dir = url.searchParams.get("dir");
    const commit = url.searchParams.get("commit");
    const file = url.searchParams.get("file") || undefined;
    if (!dir) {
      respond(res, 400, "dir is required");
      return;
    }
    if (commit === null || !isDiffSha(commit)) {
      respond(res, 400, "commit must be 7–40 hex characters");
      return;
    }
    const root = await registeredRoot(env, dir);
    if (root === null) {
      respond(res, 403, "not a registered project");
      return;
    }
    const result = await readCommitDiff(root, commit, file);
    if (!result.ok) {
      if (result.reason === "file-not-in-commit") {
        respond(res, 400, "file is not part of this commit");
        return;
      }
      if (result.reason === "unknown-commit") {
        respond(res, 404, "commit not found");
        return;
      }
      if (result.reason === "no-git") {
        respond(res, 404, "not a git repository");
        return;
      }
      respondJson(res, 200, { ok: true, text: diffTooLarge(commit) });
      return;
    }
    respondJson(res, 200, { ok: true, text: result.text });
  }

  /**
   * `POST /api/config` { key, value }: the modal's only write. Host, Origin,
   * content type and token all have to match, the key must be one the modal may
   * change and the value has to pass the config schema. Anything else is a 4xx
   * and the file stays untouched.
   */
  async function writeConfig(
    req: IncomingMessage,
    res: ServerResponse,
    port: number,
  ): Promise<void> {
    if (
      !originAllowed(req.headers.origin, port) ||
      !tokenMatches(req.headers[CONFIG_TOKEN_HEADER])
    ) {
      respond(res, 403, "forbidden");
      return;
    }
    const type = req.headers["content-type"];
    if (
      typeof type !== "string" ||
      type.split(";")[0]?.trim().toLowerCase() !== "application/json"
    ) {
      respond(res, 415, "content-type must be application/json");
      return;
    }
    const body = await readLimitedBody(req);
    if (body === null) {
      respond(res, 413, "request body too large");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      respond(res, 400, "invalid JSON");
      return;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      respond(res, 400, "expected a JSON object");
      return;
    }
    const { key, value } = parsed as Record<string, unknown>;
    if (typeof key !== "string" || !isPanelEditableKey(key)) {
      respond(res, 400, `unknown or read-only key: ${String(key)}`);
      return;
    }
    const next = Config.safeParse({ ...(await loadConfig(env)), [key]: value });
    if (!next.success) {
      respond(res, 400, `invalid value for ${key}: ${next.error.issues[0]?.message ?? "rejected"}`);
      return;
    }
    try {
      // A page is waiting: give the lock a moment, not the CLI's usual 10 s.
      await updateConfig((c) => ({ ...c, [key]: next.data[key] }), env, { timeoutMs: 500 });
    } catch (err) {
      respond(res, err instanceof LockBusyError ? 409 : 500, "could not write the config");
      return;
    }
    // Story 9.3: un-ignore (or hide) the conversation store in every project.
    if (key === "shareConversations")
      await refreshShareConversations(env, next.data.shareConversations);
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify({ ok: true, key, value: next.data[key] }));
    void refreshOpenPages();
  }

  /**
   * `POST /api/read` { dir, id, read } (Story 10.3): the map's read toggle. It
   * writes only the project's local state file; the page updates itself, and
   * the next rebuild embeds the new list. Same Host, Origin, content-type and
   * token checks as a settings write, and `dir` must be a registered project.
   */
  async function writeRead(req: IncomingMessage, res: ServerResponse, port: number): Promise<void> {
    if (
      !originAllowed(req.headers.origin, port) ||
      !tokenMatches(req.headers[CONFIG_TOKEN_HEADER])
    ) {
      respond(res, 403, "forbidden");
      return;
    }
    const type = req.headers["content-type"];
    if (
      typeof type !== "string" ||
      type.split(";")[0]?.trim().toLowerCase() !== "application/json"
    ) {
      respond(res, 415, "content-type must be application/json");
      return;
    }
    const body = await readLimitedBody(req);
    if (body === null) {
      respond(res, 413, "request body too large");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      respond(res, 400, "invalid JSON");
      return;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      respond(res, 400, "expected a JSON object");
      return;
    }
    const { dir, id, read } = parsed as Record<string, unknown>;
    if (typeof dir !== "string" || typeof id !== "string" || typeof read !== "boolean") {
      respond(res, 400, "expected { dir, id, read }");
      return;
    }
    if (!/^h[0-9a-f]{12}$/.test(id)) {
      respond(res, 400, "id must be a message id (h plus 12 hex)");
      return;
    }
    const root = await registeredRoot(env, dir);
    if (root === null) {
      respond(res, 403, "not a registered project");
      return;
    }
    try {
      await setMessageRead(root, id, read);
    } catch {
      respond(res, 500, "could not write the read state");
      return;
    }
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify({ ok: true, id, read }));
  }

  /**
   * `POST /api/inbox/dismiss` { dir, sessionId, at } (Story 11.1): the inbox's
   * dismiss button. It writes the project's local state file, and the turn time
   * is stored so a newer agent turn brings the row back. Same Host, Origin,
   * content-type and token checks as a read mark, and `dir` must be registered.
   */
  async function writeInboxDismiss(
    req: IncomingMessage,
    res: ServerResponse,
    port: number,
  ): Promise<void> {
    if (
      !originAllowed(req.headers.origin, port) ||
      !tokenMatches(req.headers[CONFIG_TOKEN_HEADER])
    ) {
      respond(res, 403, "forbidden");
      return;
    }
    const type = req.headers["content-type"];
    if (
      typeof type !== "string" ||
      type.split(";")[0]?.trim().toLowerCase() !== "application/json"
    ) {
      respond(res, 415, "content-type must be application/json");
      return;
    }
    const body = await readLimitedBody(req);
    if (body === null) {
      respond(res, 413, "request body too large");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      respond(res, 400, "invalid JSON");
      return;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      respond(res, 400, "expected a JSON object");
      return;
    }
    const { dir, sessionId, at } = parsed as Record<string, unknown>;
    if (typeof dir !== "string" || typeof sessionId !== "string" || typeof at !== "string") {
      respond(res, 400, "expected { dir, sessionId, at }");
      return;
    }
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(sessionId) || Number.isNaN(Date.parse(at))) {
      respond(res, 400, "sessionId or at is not valid");
      return;
    }
    const root = await registeredRoot(env, dir);
    if (root === null) {
      respond(res, 403, "not a registered project");
      return;
    }
    try {
      await dismissInboxSession(root, sessionId, at);
    } catch {
      respond(res, 500, "could not write the inbox state");
      return;
    }
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify({ ok: true, sessionId, at }));
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const port = (server.address() as AddressInfo | null)?.port ?? opts.port;
    if (req.method === "POST") {
      if (!hostAllowed(req.headers.host, port)) {
        respond(res, 403, "forbidden");
        return;
      }
      const url = new URL(req.url ?? "/", `http://${HOST}:${port}`);
      // `open` of a newer cogit retires a server of another version. Browsers
      // always send Origin on a POST, so no web page can stop it.
      if (url.pathname === "/api/stop") {
        if (req.headers.origin !== undefined) {
          respond(res, 403, "forbidden");
          return;
        }
        respond(res, 200, "stopping");
        void close();
        return;
      }
      if (url.pathname === "/api/read") {
        await writeRead(req, res, port);
        return;
      }
      if (url.pathname === "/api/inbox/dismiss") {
        await writeInboxDismiss(req, res, port);
        return;
      }
      if (url.pathname !== "/api/config") {
        respond(res, 405, "method not allowed");
        return;
      }
      await writeConfig(req, res, port);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      respond(res, 405, "method not allowed");
      return;
    }
    if (!hostAllowed(req.headers.host, port)) {
      respond(res, 403, "forbidden");
      return;
    }
    const url = new URL(req.url ?? "/", `http://${HOST}:${port}`);
    if (url.pathname === "/api/diff") {
      if (req.method !== "GET") {
        respond(res, 405, "method not allowed");
        return;
      }
      await readDiff(req, res, port, url);
      return;
    }
    if (url.pathname === "/api/config") {
      if (req.method !== "GET") {
        respond(res, 405, "method not allowed");
        return;
      }
      await readConfig(req, res, port);
      return;
    }
    if (url.pathname === "/health") {
      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(
        JSON.stringify({ ok: true, name: "cogit", home: globalPaths(env).base, version: VERSION }),
      );
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
      const page = watched(target.file, target.dir, target.root);
      page.clients.add(res);
      res.on("error", () => page.clients.delete(res));
      openPages += 1;
      clearIdle();
      // The panel does not need the transcripts; a map page does (Story 9.5).
      if (target.root !== undefined) startTranscriptWatch();
      req.on("close", () => {
        page.clients.delete(res);
        release(target.file, page);
        openPages = Math.max(0, openPages - 1);
        if (!mapPagesOpen()) stopTranscriptWatch();
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
    res.end(req.method === "HEAD" ? undefined : injectTokenMeta(injectLiveMeta(html), token));
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
      stopTranscriptWatch();
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
  version?: unknown;
}

/** This user's cogit server on the port, with its version; undefined otherwise. */
async function serverVersion(url: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(500) });
    if (!response.ok) return undefined;
    const body = (await response.json()) as HealthBody;
    if (body.name !== "cogit" || body.home !== globalPaths(env).base) return undefined;
    return typeof body.version === "string" ? body.version : "";
  } catch {
    return undefined;
  }
}

/**
 * Asks a server of another cogit version (an upgrade left it running) to stop,
 * so `open` does not serve pages with old code. A server too old to know the
 * request keeps running; `open` then falls back to the file.
 */
export async function stopStaleServer(url: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  const version = await serverVersion(url, env);
  if (version === undefined || version === VERSION) return false;
  try {
    const response = await fetch(`${url}/api/stop`, {
      method: "POST",
      signal: AbortSignal.timeout(500),
    });
    if (!response.ok) return false;
  } catch {
    return false;
  }
  for (let i = 0; i < 20; i++) {
    await delay(50);
    if ((await serverVersion(url, env)) === undefined) return true;
  }
  return false;
}

/**
 * True when a cogit server for this user's home answers on the port. The
 * home check keeps two users (or two `COGIT_HOME`s) apart on one port.
 */
export async function checkHealth(url: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(500) });
    if (!response.ok) return false;
    const body = (await response.json()) as HealthBody;
    return body.name === "cogit" && body.home === globalPaths(env).base && body.version === VERSION;
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
    env: { ...env, COGIT_DISABLE: "1" },
  }).unref();
}

export interface EnsureServerDeps {
  /** The CLI file the detached server runs; defaults to the running script. */
  cli?: string;
  /** Starts the detached server; tests observe instead of spawning. */
  spawn?: (cli: string, port: number, env: NodeJS.ProcessEnv) => void;
  /** Health probe; tests replace the network with a function. */
  health?: (url: string, env: NodeJS.ProcessEnv) => Promise<boolean>;
  /** Retires a server of another version before a new one starts. */
  stopStale?: (url: string, env: NodeJS.ProcessEnv) => Promise<boolean>;
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
  await (deps.stopStale ?? stopStaleServer)(base, env);

  const cli = deps.cli ?? process.argv[1] ?? fileURLToPath(import.meta.url);
  (deps.spawn ?? spawnServerProcess)(cli, serverPort, env);

  const deadline = Date.now() + (deps.waitMs ?? START_WAIT_MS);
  while (Date.now() < deadline) {
    await delay(50);
    if (await health(base, env)) return base;
  }
  return null;
}
