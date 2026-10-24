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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildProject } from "../src/commands/build.js";
import { init } from "../src/commands/init.js";
import {
  CONFIG_TOKEN_HEADER,
  ensureServer,
  injectLiveMeta,
  injectTokenMeta,
  type MapServer,
  mapPageUrl,
  spawnServerProcess,
  startMapServer,
} from "../src/server.js";
import { atomicWrite } from "../src/store/fs.js";
import { globalPaths, projectPaths } from "../src/store/paths.js";
import { loadConfig, updateConfig } from "../src/store/stores.js";
import { DATA_ELEMENT_ID, LIVE_META_NAME, TOKEN_META_NAME } from "../src/view/model.js";
import { envFor, fakeIo, tempDir } from "./helpers.js";

const TEMPLATE = `<!doctype html><html><head><title>codelineage</title></head><body><div id="root"></div>
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

async function start(idleMs = 5000): Promise<MapServer> {
  const server = await startMapServer({ env, port: 0, idleMs });
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
  const match = /<meta name="codelineage-token" content="([^"]+)">/.exec(page.body);
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

  it("answers its health with this home", async () => {
    const server = await start();
    const reply = await request(`${server.url}/health`);
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body)).toEqual({
      ok: true,
      name: "codelineage",
      home: globalPaths(env).base,
    });
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
  it("gives the panel a token and leaves maps without one", async () => {
    const server = await start();
    const panel = await request(`${server.url}/`);
    expect(panel.body).toContain(`name="${TOKEN_META_NAME}"`);
    const map = await request(mapPageUrl(server.url, root));
    expect(map.body).not.toContain(`name="${TOKEN_META_NAME}"`);
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

  it("rebuilds an open map so the page picks the new setting up", async () => {
    const server = await start();
    const events = openEvents(`${server.url}/events?dir=${encodeURIComponent(root)}`);
    try {
      expect(await events.waitFor("retry: 1000")).toBe(true);
      const token = await panelToken(server);
      const reply = await configWrite(server, token, { key: "sessionEndCatchUp", value: false });
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
    expect((await loadConfig(env)).gitPolicy).toBe("ignore");
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
    expect((await request(`${server.url}/api/config`)).status).toBe(404);
    expect((await loadConfig(env)).language).toBe("auto");
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
      env: { XDG_CONFIG_HOME: "/home/x", CODELINEAGE_DISABLE: "1" },
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
      res.end("not codelineage");
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
