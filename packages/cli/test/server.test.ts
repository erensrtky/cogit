import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import {
  type ClientRequest,
  createServer as createHttpServer,
  get as httpGet,
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
} from "node:http";
import { type AddressInfo, createServer as createNetServer } from "node:net";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { buildProject } from "../src/commands/build.js";
import { init } from "../src/commands/init.js";
import {
  CONFIG_TOKEN_HEADER,
  checkHealth,
  ensureServer,
  injectLiveMeta,
  injectTokenMeta,
  type MapServer,
  mapPageUrl,
  spawnServerProcess,
  startMapServer,
  stopStaleServer,
} from "../src/server.js";
import { atomicWrite } from "../src/store/fs.js";
import { readInboxDismissed } from "../src/store/inbox-state.js";
import { globalPaths, projectPaths } from "../src/store/paths.js";
import { readReadState } from "../src/store/read-state.js";
import { loadConfig, updateConfig } from "../src/store/stores.js";
import { DATA_ELEMENT_ID, LIVE_META_NAME, TOKEN_META_NAME } from "../src/view/model.js";
import { envFor, fakeIo, noGitProject, tempDir } from "./helpers.js";

const TEMPLATE = `<!doctype html><html><head><title>cogit</title></head><body><div id="root"></div>
<script id="${DATA_ELEMENT_ID}" type="application/json"></script></body></html>`;

const servers: MapServer[] = [];
let dir: string;
let root: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  dir = await tempDir();
  root = join(dir, "proj");
  await mkdir(root);
  env = envFor(dir);
  await init(root, { name: "proj", retention: "keep", language: "auto" }, fakeIo(env));
  await buildProject({ dir: root, io: fakeIo(env), templateHtml: TEMPLATE });
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function start(idleMs = 5000, transcriptDebounceMs?: number): Promise<MapServer> {
  const server = await startMapServer({
    env,
    port: 0,
    idleMs,
    ...(transcriptDebounceMs === undefined ? {} : { transcriptDebounceMs }),
  });
  servers.push(server);
  return server;
}

interface Reply {
  status: number;
  body: string;
  headers: IncomingHttpHeaders;
}

function request(
  url: string,
  headers: Record<string, string> = {},
  method = "GET",
): Promise<Reply> {
  return new Promise((done, fail) => {
    const req = httpGet(url, { headers, method }, (res: IncomingMessage) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () =>
        done({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
          headers: res.headers,
        }),
      );
    });
    req.on("error", fail);
  });
}

function postConfig(
  url: string,
  body: string,
  headers: Record<string, string> = {},
): Promise<Reply> {
  const target = new URL(url);
  return new Promise((done, fail) => {
    const req = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          ...headers,
        },
      },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          done({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: res.headers,
          }),
        );
      },
    );
    req.on("error", fail);
    req.end(body);
  });
}

/** The token the panel page carries; every settings write needs it. */
async function panelToken(server: MapServer): Promise<string> {
  const page = await request(`${server.url}/`);
  const match = /<meta name="cogit-token" content="([^"]+)">/.exec(page.body);
  if (!match?.[1]) throw new Error("panel page has no token");
  return match[1];
}

function configWrite(
  server: MapServer,
  token: string,
  payload: unknown,
  overrides: Record<string, string> = {},
): Promise<Reply> {
  return postConfig(`${server.url}/api/config`, JSON.stringify(payload), {
    origin: `http://127.0.0.1:${server.port}`,
    [CONFIG_TOKEN_HEADER]: token,
    ...overrides,
  });
}

function configRead(
  server: MapServer,
  token: string,
  overrides: Record<string, string> = {},
): Promise<Reply> {
  return request(`${server.url}/api/config`, {
    origin: `http://127.0.0.1:${server.port}`,
    [CONFIG_TOKEN_HEADER]: token,
    ...overrides,
  });
}

function openEvents(url: string): {
  waitFor: (needle: string, ms?: number) => Promise<boolean>;
  close: () => void;
} {
  let text = "";
  const req: ClientRequest = httpGet(url, (res) => {
    res.setEncoding("utf8");
    res.on("data", (chunk: string) => {
      text += chunk;
    });
  });
  req.on("error", () => {});
  const delay = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));
  return {
    waitFor: async (needle, ms = 3000) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        if (text.includes(needle)) return true;
        await delay(20);
      }
      return false;
    },
    close: () => req.destroy(),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

async function listen(server: ReturnType<typeof createHttpServer>): Promise<number> {
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return (server.address() as AddressInfo).port;
}

async function freePort(): Promise<number> {
  const probe = createNetServer();
  await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((done) => probe.close(() => done()));
  return port;
}

describe("injectLiveMeta", () => {
  it("marks the page once, after <head>", () => {
    const once = injectLiveMeta(TEMPLATE);
    expect(once).toContain(`<meta name="${LIVE_META_NAME}" content="1">`);
    expect(injectLiveMeta(once)).toBe(once);
  });

  it("leaves a page without a head tag alone", () => {
    expect(injectLiveMeta("<p>x</p>")).toBe("<p>x</p>");
  });
});

describe("injectTokenMeta", () => {
  it("adds the token meta to the head once", () => {
    const once = injectTokenMeta(TEMPLATE, "abc123");
    expect(once).toContain(`<meta name="${TOKEN_META_NAME}" content="abc123">`);
    expect(injectTokenMeta(once, "abc123")).toBe(once);
  });
});

describe("map server", () => {
  it("serves the map of a registered project", async () => {
    const server = await start();
    const reply = await request(mapPageUrl(server.url, root));
    expect(reply.status).toBe(200);
    expect(reply.headers["content-type"]).toContain("text/html");
    expect(reply.body).toContain(LIVE_META_NAME);
    expect(reply.body).toContain("proj");
  });

  it("serves the panel at the root", async () => {
    const server = await start();
    const reply = await request(`${server.url}/`);
    expect(reply.status).toBe(200);
    expect(reply.body).toContain(LIVE_META_NAME);
    expect(reply.body).toContain("proj");
  });

  it("serves nothing else", async () => {
    const server = await start();
    expect((await request(`${server.url}/map`)).status).toBe(404);
    expect((await request(`${server.url}/map?dir=${encodeURIComponent(dir)}`)).status).toBe(404);
    expect((await request(`${server.url}/etc/passwd`)).status).toBe(404);
  });

  it("answers HEAD without a body and refuses other methods", async () => {
    const server = await start();
    const head = await request(mapPageUrl(server.url, root), {}, "HEAD");
    expect(head.status).toBe(200);
    expect(head.body).toBe("");
    expect((await request(server.url, {}, "POST")).status).toBe(405);
  });

  it("404s a registered project whose map was never built", async () => {
    const server = await start();
    await rm(projectPaths(root).html, { force: true });
    expect((await request(mapPageUrl(server.url, root))).status).toBe(404);
  });

  it("answers 500 instead of crashing when the registry cannot be read", async () => {
    const server = await start();
    const registry = globalPaths(env).registry;
    await rm(registry, { force: true });
    await mkdir(registry, { recursive: true });
    expect((await request(mapPageUrl(server.url, root))).status).toBe(500);
  });

  it("answers its health with this home and version", async () => {
    const server = await start();
    const reply = await request(`${server.url}/health`);
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body)).toEqual({
      ok: true,
      name: "cogit",
      home: globalPaths(env).base,
      version: pkg.version,
    });
    expect(await checkHealth(server.url, env)).toBe(true);
  });

  it("stops on /api/stop from the CLI, never from a page", async () => {
    const server = await start();
    const fromPage = await fetch(`${server.url}/api/stop`, {
      method: "POST",
      headers: { origin: server.url },
    });
    expect(fromPage.status).toBe(403);
    const fromCli = await fetch(`${server.url}/api/stop`, { method: "POST" });
    expect(fromCli.status).toBe(200);
    await server.closed;
  });

  it("rejects a foreign Host header", async () => {
    const server = await start();
    const reply = await request(`${server.url}/health`, { host: "evil.example:4747" });
    expect(reply.status).toBe(403);
  });

  it("tells a connected page when the map is rebuilt", async () => {
    const server = await start();
    const events = openEvents(`${server.url}/events?dir=${encodeURIComponent(root)}`);
    try {
      expect(await events.waitFor("retry: 1000")).toBe(true);
      await atomicWrite(projectPaths(root).html, "replaced");
      expect(await events.waitFor("event: change")).toBe(true);
    } finally {
      events.close();
    }
  });

  it("rebuilds an open map when Claude Code writes a transcript (9.5)", async () => {
    const folder = join(env.CLAUDE_CONFIG_DIR as string, "projects", "-proj");
    await mkdir(folder, { recursive: true });
    const server = await start(5000, 20);
    const events = openEvents(`${server.url}/events?dir=${encodeURIComponent(root)}`);
    try {
      expect(await events.waitFor("retry: 1000")).toBe(true);
      // The write is in the Claude home, not in `.cogit/`, so only the new
      // transcript watch can produce the rebuild that reaches the page.
      await writeFile(
        join(folder, "s1.jsonl"),
        `${JSON.stringify({
          type: "user",
          timestamp: "2026-10-24T10:00:00.000Z",
          message: { role: "user", content: "hello" },
        })}\n`,
      );
      expect(await events.waitFor("event: change")).toBe(true);
    } finally {
      events.close();
    }
  });

  it("exits by itself when no page is connected", async () => {
    const server = await start(120);
    await server.closed;
    await expect(request(server.url)).rejects.toThrow();
  });

  it("stays up while a page is connected and exits after it leaves", async () => {
    // Generous idle: the connection must be registered before it can fire, and
    // coverage instrumentation can delay the first request.
    const server = await start(1000);
    const events = openEvents(`${server.url}/events?dir=${encodeURIComponent(root)}`);
    try {
      expect(await events.waitFor("retry: 1000")).toBe(true);
      await delay(1300);
      const state = await Promise.race([
        server.closed.then(() => "closed"),
        delay(50).then(() => "open"),
      ]);
      expect(state).toBe("open");
    } finally {
      events.close();
    }
    await server.closed;
  });
});

describe("settings write", () => {
  it("gives every served page a token", async () => {
    const server = await start();
    const panel = await request(`${server.url}/`);
    expect(panel.body).toContain(`name="${TOKEN_META_NAME}"`);
    const map = await request(mapPageUrl(server.url, root));
    expect(map.body).toContain(`name="${TOKEN_META_NAME}"`);
  });

  it("accepts a valid write, stores it and refreshes the panel", async () => {
    const server = await start();
    const token = await panelToken(server);
    const reply = await configWrite(server, token, { key: "messageSummaries", value: true });
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body)).toEqual({ ok: true, key: "messageSummaries", value: true });
    expect((await loadConfig(env)).messageSummaries).toBe(true);

    const handoff = await configWrite(server, token, { key: "startupContext", value: false });
    expect(handoff.status).toBe(200);
    expect((await loadConfig(env)).startupContext).toBe(false);

    const panel = globalPaths(env).panel;
    const deadline = Date.now() + 3000;
    let html = "";
    while (Date.now() < deadline) {
      html = await readFile(panel, "utf8");
      if (html.includes('"messageSummaries":true')) break;
      await delay(25);
    }
    expect(html).toContain('"messageSummaries":true');
  });

  it("accepts the Story 9.3 settings and validates their values", async () => {
    const server = await start();
    const token = await panelToken(server);
    expect(
      (await configWrite(server, token, { key: "shareConversations", value: true })).status,
    ).toBe(200);
    expect((await configWrite(server, token, { key: "recordCommit", value: "auto" })).status).toBe(
      200,
    );
    expect((await loadConfig(env)).shareConversations).toBe(true);
    expect((await loadConfig(env)).recordCommit).toBe("auto");
    expect(
      (await configWrite(server, token, { key: "recordCommit", value: "sometimes" })).status,
    ).toBe(400);
  });

  it("rebuilds an open map so the page picks the new setting up", async () => {
    const server = await start();
    const events = openEvents(`${server.url}/events?dir=${encodeURIComponent(root)}`);
    try {
      expect(await events.waitFor("retry: 1000")).toBe(true);
      const token = await panelToken(server);
      const reply = await configWrite(server, token, { key: "messageSummaries", value: true });
      expect(reply.status).toBe(200);
      expect(await events.waitFor("event: change")).toBe(true);
    } finally {
      events.close();
    }
  });

  it("rejects a wrong or missing token and writes nothing", async () => {
    const server = await start();
    const token = await panelToken(server);
    expect((await configWrite(server, "nope", { key: "language", value: "tr" })).status).toBe(403);
    expect(
      (
        await configWrite(
          server,
          token,
          { key: "language", value: "tr" },
          {
            [CONFIG_TOKEN_HEADER]: "",
          },
        )
      ).status,
    ).toBe(403);
    expect((await loadConfig(env)).language).toBe("auto");
  });

  it("rejects another origin and a foreign Host", async () => {
    const server = await start();
    const token = await panelToken(server);
    const foreign = await configWrite(
      server,
      token,
      { key: "language", value: "tr" },
      {
        origin: "http://evil.example",
      },
    );
    expect(foreign.status).toBe(403);
    const host = await configWrite(
      server,
      token,
      { key: "language", value: "tr" },
      {
        host: "evil.example:4747",
      },
    );
    expect(host.status).toBe(403);
    expect((await loadConfig(env)).language).toBe("auto");
  });

  it("rejects a read-only key, an unknown key and a bad value type", async () => {
    const server = await start();
    const token = await panelToken(server);
    expect((await configWrite(server, token, { key: "gitPolicy", value: "commit" })).status).toBe(
      400,
    );
    expect((await configWrite(server, token, { key: "nope", value: 1 })).status).toBe(400);
    expect(
      (await configWrite(server, token, { key: "updateEveryTurns", value: "many" })).status,
    ).toBe(400);
    expect(
      (await configWrite(server, token, { key: "messageSummaries", value: "true" })).status,
    ).toBe(400);
    expect((await loadConfig(env)).gitPolicy).toBe("commit");
    expect((await loadConfig(env)).messageSummaries).toBe(false);
  });

  it("rejects a body that is valid JSON but not an object", async () => {
    const server = await start();
    const token = await panelToken(server);
    const reply = await postConfig(`${server.url}/api/config`, "null", {
      origin: `http://127.0.0.1:${server.port}`,
      [CONFIG_TOKEN_HEADER]: token,
    });
    expect(reply.status).toBe(400);
  });

  it("answers 409 instead of waiting when the config lock is held", async () => {
    const server = await start();
    const token = await panelToken(server);
    const lock = `${globalPaths(env).config}.lock`;
    await mkdir(lock, { recursive: true });
    await writeFile(join(lock, "owner"), String(process.pid));
    try {
      const reply = await configWrite(server, token, { key: "language", value: "tr" });
      expect(reply.status).toBe(409);
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
    expect((await loadConfig(env)).language).toBe("auto");
  });

  it("rejects a non-JSON body, an oversized body and a wrong method", async () => {
    const server = await start();
    const token = await panelToken(server);
    const wrongType = await configWrite(
      server,
      token,
      { key: "language", value: "tr" },
      {
        "content-type": "text/plain",
      },
    );
    expect(wrongType.status).toBe(415);
    const huge = await configWrite(server, token, { key: "language", value: "x".repeat(5000) });
    expect(huge.status).toBe(413);
    const notJson = await postConfig(`${server.url}/api/config`, "not json", {
      origin: `http://127.0.0.1:${server.port}`,
      [CONFIG_TOKEN_HEADER]: token,
    });
    expect(notJson.status).toBe(400);
    // A bare GET is not a settings read: it carries no token.
    expect((await request(`${server.url}/api/config`)).status).toBe(403);
    expect((await loadConfig(env)).language).toBe("auto");
  });
});

describe("settings read", () => {
  it("returns only the editable keys and their current values", async () => {
    const server = await start();
    const token = await panelToken(server);
    const reply = await configRead(server, token);
    expect(reply.status).toBe(200);
    expect(reply.headers["cache-control"]).toBe("no-store");
    expect(JSON.parse(reply.body)).toEqual({
      ok: true,
      settings: {
        recorder: "side",
        messageSummaries: false,
        startupContext: true,
        recordHeadless: false,
        tryBeforeNotes: true,
        language: "auto",
        shareConversations: false,
        recordCommit: "ask",
      },
    });
  });

  it("accepts a same-origin GET without an Origin header", async () => {
    const server = await start();
    const token = await panelToken(server);
    const reply = await request(`${server.url}/api/config`, {
      [CONFIG_TOKEN_HEADER]: token,
    });
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body).settings.recorder).toBe("side");
  });

  it("shows a value changed after the page was built", async () => {
    const server = await start();
    const token = await panelToken(server);
    const write = await configWrite(server, token, { key: "recorder", value: "mixed" });
    expect(write.status).toBe(200);
    const reply = await configRead(server, token);
    expect(JSON.parse(reply.body).settings.recorder).toBe("mixed");
    // The advanced recording keys stay on `cogit config set` (0.21).
    expect((await configWrite(server, token, { key: "updateEveryTurns", value: 8 })).status).toBe(
      400,
    );
  });

  it("rejects a wrong token, a foreign origin and a foreign Host", async () => {
    const server = await start();
    const token = await panelToken(server);
    expect((await configRead(server, "nope")).status).toBe(403);
    expect((await configRead(server, token, { origin: "http://evil.example" })).status).toBe(403);
    expect((await configRead(server, token, { host: "evil.example:4747" })).status).toBe(403);
  });

  it("refuses a method other than GET", async () => {
    const server = await start();
    expect((await request(`${server.url}/api/config`, {}, "HEAD")).status).toBe(405);
  });
});

describe("spawnServerProcess", () => {
  it("runs the CLI detached with hooks silenced", () => {
    const calls: unknown[][] = [];
    spawnServerProcess(
      "/cli.js",
      4747,
      { XDG_CONFIG_HOME: "/home/x" },
      (command, args, options) => {
        calls.push([command, args, options]);
        return { unref: () => {} };
      },
    );
    expect(calls[0]?.[0]).toBe(process.execPath);
    expect(calls[0]?.[1]).toEqual(["/cli.js", "serve", "--port", "4747"]);
    expect(calls[0]?.[2]).toMatchObject({
      detached: true,
      stdio: "ignore",
      env: { XDG_CONFIG_HOME: "/home/x", COGIT_DISABLE: "1" },
    });
  });
});

describe("ensureServer", () => {
  it("reuses a server already running for this home", async () => {
    const server = await start();
    await updateConfig((config) => ({ ...config, serverPort: server.port }), env);
    let spawned = 0;
    const base = await ensureServer(env, {
      spawn: () => {
        spawned += 1;
      },
      waitMs: 200,
    });
    expect(base).toBe(server.url);
    expect(spawned).toBe(0);
  });

  it("gives up when the port answers as something else", async () => {
    const other = createHttpServer((_req, res) => {
      res.writeHead(404);
      res.end("not cogit");
    });
    const port = await listen(other);
    await updateConfig((config) => ({ ...config, serverPort: port }), env);
    let spawned = 0;
    try {
      const base = await ensureServer(env, {
        spawn: () => {
          spawned += 1;
        },
        waitMs: 150,
      });
      expect(base).toBeNull();
      expect(spawned).toBe(1);
    } finally {
      await new Promise<void>((done) => other.close(() => done()));
    }
  });

  it("retires a server of another version and starts a current one", async () => {
    let stopped = false;
    const stale = createHttpServer((req, res) => {
      if (req.method === "POST" && req.url === "/api/stop") {
        stopped = true;
        res.end("stopping");
        stale.close();
        stale.closeAllConnections();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ ok: true, name: "cogit", home: globalPaths(env).base, version: "0.0.1" }),
      );
    });
    const port = await listen(stale);
    const base = `http://127.0.0.1:${port}`;
    await updateConfig((config) => ({ ...config, serverPort: port }), env);
    expect(await checkHealth(base, env)).toBe(false);
    const url = await ensureServer(env, {
      spawn: () => {
        void startMapServer({ env, port }).then((server) => servers.push(server));
      },
      waitMs: 2000,
    });
    expect(stopped).toBe(true);
    expect(url).toBe(base);
    expect(await checkHealth(base, env)).toBe(true);
    // A current server is left alone.
    expect(await stopStaleServer(base, env)).toBe(false);
  });

  it("leaves an old server that cannot be asked to stop", async () => {
    const reply = (status: number, destroy: boolean) =>
      createHttpServer((req, res) => {
        if (req.method === "POST") {
          if (destroy) {
            req.socket.destroy();
            return;
          }
          res.writeHead(status);
          res.end();
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, name: "cogit", home: globalPaths(env).base }));
      });
    // Refuses, drops the request, or says yes and keeps running.
    for (const old of [reply(405, false), reply(200, true), reply(200, false)]) {
      const port = await listen(old);
      try {
        expect(await stopStaleServer(`http://127.0.0.1:${port}`, env)).toBe(false);
      } finally {
        old.closeAllConnections();
        await new Promise<void>((done) => old.close(() => done()));
      }
    }
  });

  it("starts one when nothing is listening", async () => {
    const port = await freePort();
    await updateConfig((config) => ({ ...config, serverPort: port }), env);
    let started: MapServer | undefined;
    const base = await ensureServer(env, {
      spawn: () => {
        void startMapServer({ env, port }).then((server) => {
          started = server;
          servers.push(server);
        });
      },
      waitMs: 2000,
    });
    expect(base).toBe(`http://127.0.0.1:${port}`);
    expect(started?.port).toBe(port);
  });
});

describe("read marks (10.3)", () => {
  const ID = "h111111111111";

  function readWrite(
    server: MapServer,
    token: string,
    payload: unknown,
    overrides: Record<string, string> = {},
  ): Promise<Reply> {
    return postConfig(`${server.url}/api/read`, JSON.stringify(payload), {
      origin: `http://127.0.0.1:${server.port}`,
      [CONFIG_TOKEN_HEADER]: token,
      ...overrides,
    });
  }

  it("writes a read mark for a registered project and clears it", async () => {
    const server = await start();
    const token = await panelToken(server);
    const marked = await readWrite(server, token, { dir: root, id: ID, read: true });
    expect(marked.status).toBe(200);
    expect(JSON.parse(marked.body)).toEqual({ ok: true, id: ID, read: true });
    expect([...(await readReadState(root))]).toEqual([ID]);

    const cleared = await readWrite(server, token, { dir: root, id: ID, read: false });
    expect(cleared.status).toBe(200);
    expect([...(await readReadState(root))]).toEqual([]);
  });

  it("refuses a foreign project, a bad id, a bad body and a bad token", async () => {
    const server = await start();
    const token = await panelToken(server);
    expect(
      (await readWrite(server, token, { dir: join(dir, "elsewhere"), id: ID, read: true })).status,
    ).toBe(403);
    expect((await readWrite(server, token, { dir: root, id: "m1", read: true })).status).toBe(400);
    expect((await readWrite(server, token, { dir: root, id: ID })).status).toBe(400);
    expect((await readWrite(server, token, { id: ID, read: true })).status).toBe(400);
    expect((await readWrite(server, "nope", { dir: root, id: ID, read: true })).status).toBe(403);
    expect(
      (
        await readWrite(
          server,
          token,
          { dir: root, id: ID, read: true },
          {
            "content-type": "text/plain",
          },
        )
      ).status,
    ).toBe(415);
    expect((await readWrite(server, token, { dir: root, id: ID, read: true }, {})).status).toBe(
      200,
    );
    const raw = await postConfig(`${server.url}/api/read`, "{oops", {
      origin: `http://127.0.0.1:${server.port}`,
      [CONFIG_TOKEN_HEADER]: token,
    });
    expect(raw.status).toBe(400);
    const huge = await readWrite(server, token, {
      dir: root,
      id: ID,
      read: true,
      pad: "x".repeat(5000),
    });
    expect(huge.status).toBe(413);

    const array = await postConfig(`${server.url}/api/read`, "[]", {
      origin: `http://127.0.0.1:${server.port}`,
      [CONFIG_TOKEN_HEADER]: token,
    });
    expect(array.status).toBe(400);
  });

  it("answers 500 instead of crashing when the state cannot be written", async () => {
    const server = await start();
    const token = await panelToken(server);
    // A directory where the state file belongs makes the write fail.
    await mkdir(projectPaths(root).readState, { recursive: true });
    const reply = await readWrite(server, token, { dir: root, id: ID, read: true });
    expect(reply.status).toBe(500);
  });
});

describe("inbox dismiss endpoint (Story 11.1)", () => {
  const AT = "2026-10-21T10:00:00.000Z";
  const SESSION = "3f2b1c4d-0000-4000-8000-000000000001";

  function dismissWrite(
    server: MapServer,
    token: string,
    payload: unknown,
    overrides: Record<string, string> = {},
  ): Promise<Reply> {
    return postConfig(`${server.url}/api/inbox/dismiss`, JSON.stringify(payload), {
      origin: `http://127.0.0.1:${server.port}`,
      [CONFIG_TOKEN_HEADER]: token,
      ...overrides,
    });
  }

  it("stores the dismissed turn for a registered project", async () => {
    const server = await start();
    const token = await panelToken(server);
    const reply = await dismissWrite(server, token, { dir: root, sessionId: SESSION, at: AT });
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body)).toEqual({ ok: true, sessionId: SESSION, at: AT });
    expect([...(await readInboxDismissed(root))]).toEqual([[SESSION, AT]]);
  });

  it("refuses a foreign project, a bad payload, a bad token and a bad body", async () => {
    const server = await start();
    const token = await panelToken(server);
    const good = { dir: root, sessionId: SESSION, at: AT };
    expect(
      (await dismissWrite(server, token, { ...good, dir: join(dir, "elsewhere") })).status,
    ).toBe(403);
    expect((await dismissWrite(server, "nope", good)).status).toBe(403);
    expect((await dismissWrite(server, token, good, { "content-type": "text/plain" })).status).toBe(
      415,
    );
    expect(
      (await dismissWrite(server, token, { dir: root, sessionId: "bad id!", at: AT })).status,
    ).toBe(400);
    expect(
      (await dismissWrite(server, token, { dir: root, sessionId: SESSION, at: "x" })).status,
    ).toBe(400);
    expect((await dismissWrite(server, token, { dir: root, at: AT })).status).toBe(400);
    expect((await dismissWrite(server, token, [])).status).toBe(400);
    expect(
      (
        await postConfig(`${server.url}/api/inbox/dismiss`, "{oops", {
          origin: `http://127.0.0.1:${server.port}`,
          [CONFIG_TOKEN_HEADER]: token,
        })
      ).status,
    ).toBe(400);
    expect((await dismissWrite(server, token, { ...good, pad: "x".repeat(5000) })).status).toBe(
      413,
    );
    expect(
      (
        await dismissWrite(server, token, good, {
          origin: "http://evil.example",
        })
      ).status,
    ).toBe(403);
  });

  it("answers 500 instead of crashing when the state cannot be written", async () => {
    const server = await start();
    const token = await panelToken(server);
    await mkdir(projectPaths(root).inboxState, { recursive: true });
    const reply = await dismissWrite(server, token, { dir: root, sessionId: SESSION, at: AT });
    expect(reply.status).toBe(500);
  });
});

describe("commit diff endpoint (Story 10.5)", () => {
  const run = promisify(execFile);

  const git = async (...args: string[]): Promise<string> => {
    const { stdout } = await run("git", ["-C", root, ...args], {
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", HOME: dir },
    });
    return stdout;
  };

  const commit = async (message: string): Promise<string> => {
    await git("add", "-A");
    await git("commit", "-q", "-m", message);
    return (await git("rev-parse", "HEAD")).trim();
  };

  function diffRequest(
    server: MapServer,
    token: string,
    params: Record<string, string | undefined>,
    overrides: Record<string, string> = {},
  ): Promise<Reply> {
    const url = new URL(`${server.url}/api/diff`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
    return request(url.toString(), {
      origin: `http://127.0.0.1:${server.port}`,
      [CONFIG_TOKEN_HEADER]: token,
      ...overrides,
    });
  }

  beforeEach(async () => {
    await git("init", "-q");
    await git("config", "user.email", "t@example.com");
    await git("config", "user.name", "Tester");
    await writeFile(join(root, "a.txt"), "one\n");
    await commit("feat: base");
  });

  it("serves one commit's patch and limits it to a file", async () => {
    const server = await start();
    const token = await panelToken(server);
    await writeFile(join(root, "a.txt"), "two\n");
    const sha = await commit("fix: two");

    const full = await diffRequest(server, token, { dir: root, commit: sha });
    expect(full.status).toBe(200);
    expect(full.headers["content-type"]).toContain("application/json");
    const body = JSON.parse(full.body) as { ok: boolean; text: string };
    expect(body.ok).toBe(true);
    expect(body.text).toContain("diff --git a/a.txt b/a.txt");
    expect(body.text).toContain("+two");

    const only = await diffRequest(server, token, {
      dir: root,
      commit: sha.slice(0, 7),
      file: "a.txt",
    });
    expect(only.status).toBe(200);
    expect((JSON.parse(only.body) as { text: string }).text).toContain("+two");
  });

  it("rejects a bad hash, an unknown commit and a file outside the commit", async () => {
    const server = await start();
    const token = await panelToken(server);
    await writeFile(join(root, "a.txt"), "two\n");
    const sha = await commit("fix: two");

    expect((await diffRequest(server, token, { commit: "abcdef0" })).status).toBe(400);
    expect((await diffRequest(server, token, { dir: root })).status).toBe(400);
    expect((await diffRequest(server, token, { dir: root, commit: "abc" })).status).toBe(400);
    const head = await request(
      `${server.url}/api/diff?dir=${encodeURIComponent(root)}&commit=abcdef0`,
      { origin: `http://127.0.0.1:${server.port}`, [CONFIG_TOKEN_HEADER]: token },
      "HEAD",
    );
    expect(head.status).toBe(405);
    expect(
      (
        await diffRequest(server, token, {
          dir: root,
          commit: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        })
      ).status,
    ).toBe(404);
    const file = await diffRequest(server, token, { dir: root, commit: sha, file: "a.txt.bak" });
    expect(file.status).toBe(400);
    expect(file.body).toContain("file is not part of this commit");
  });

  it("requires a registered project, the token and this origin", async () => {
    const server = await start();
    const token = await panelToken(server);
    expect((await diffRequest(server, token, { dir, commit: "abcdef0" })).status).toBe(403);
    expect((await diffRequest(server, "", { dir: root, commit: "abcdef0" })).status).toBe(403);
    expect(
      (
        await diffRequest(
          server,
          token,
          { dir: root, commit: "abcdef0" },
          { origin: "http://evil.example" },
        )
      ).status,
    ).toBe(403);
  });

  it("answers not-a-git-repository for a registered project without git", async () => {
    const server = await start();
    const token = await panelToken(server);
    const plain = await noGitProject(env);
    const reply = await diffRequest(server, token, { dir: plain, commit: "abcdef0" });
    expect(reply.status).toBe(404);
    expect(reply.body).toContain("not a git repository");
  });

  it("answers a one-line notice past the size cap", async () => {
    const server = await start();
    const token = await panelToken(server);
    const line = "x".repeat(100);
    await writeFile(
      join(root, "big.txt"),
      `${Array.from({ length: 5000 }, () => line).join("\n")}\n`,
    );
    const sha = await commit("feat: big");
    const reply = await diffRequest(server, token, { dir: root, commit: sha });
    expect(reply.status).toBe(200);
    const body = JSON.parse(reply.body) as { text: string };
    expect(body.text).toContain("diff too large");
    expect(body.text).toContain(`git show ${sha}`);
  });
});
