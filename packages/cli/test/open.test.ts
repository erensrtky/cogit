import { EventEmitter } from "node:events";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { init } from "../src/commands/init.js";
import {
  defaultServer,
  launchFile,
  openerCommand,
  openPanel,
  openProject,
} from "../src/commands/open.js";
import { globalPaths, projectPaths } from "../src/store/paths.js";
import { DATA_ELEMENT_ID } from "../src/view/model.js";
import { envFor, type FakeIo, fakeIo, tempDir } from "./helpers.js";

const TEMPLATE = `<!doctype html><html><body><div id="root"></div>
    <script id="${DATA_ELEMENT_ID}" type="application/json"></script></body></html>`;

let dir: string;
let root: string;
let io: FakeIo;

beforeEach(async () => {
  dir = await tempDir();
  root = join(dir, "proj");
  await mkdir(root);
  io = fakeIo(envFor(dir));
  await init(root, { name: "proj", retention: "keep", language: "auto" }, fakeIo(envFor(dir)));
});

class FakeChild extends EventEmitter {
  unref(): void {}
}

function fakeSpawn(
  event: "spawn" | "error",
  calls: string[][],
): (command: string, args: string[]) => FakeChild {
  return (command: string, args: string[]) => {
    calls.push([command, ...args]);
    const child = new FakeChild();
    queueMicrotask(() => child.emit(event));
    return child;
  };
}

describe("openerCommand", () => {
  it("picks the opener each platform ships with", () => {
    expect(openerCommand("darwin", "/p/map.html")).toEqual({
      command: "open",
      args: ["/p/map.html"],
    });
    expect(openerCommand("win32", "/p/map.html")).toEqual({
      command: "cmd",
      args: ["/c", "start", "", "/p/map.html"],
    });
    expect(openerCommand("linux", "/p/map.html")).toEqual({
      command: "xdg-open",
      args: ["/p/map.html"],
    });
  });
});

describe("launchFile", () => {
  it("resolves true once the opener starts", async () => {
    const calls: string[][] = [];
    expect(await launchFile("/p/map.html", fakeSpawn("spawn", calls))).toBe(true);
    const { command } = openerCommand(process.platform, "/p/map.html");
    expect(calls).toEqual([[command, "/p/map.html"]]);
  });

  it("resolves false when the opener binary is missing", async () => {
    expect(await launchFile("/p/map.html", fakeSpawn("error", []))).toBe(false);
  });
});

const NO_SERVER = async () => null;

describe("defaultServer", () => {
  it("turns a broken config into 'no server' instead of failing open", async () => {
    // A directory where config.json should be makes the config read throw.
    await rm(globalPaths(io.env).config, { force: true });
    await mkdir(globalPaths(io.env).config, { recursive: true });
    expect(await defaultServer(io.env)).toBeNull();
  });
});

describe("openProject", () => {
  it("builds the map and opens it through the local server", async () => {
    const launched: string[] = [];
    await openProject({
      dir: root,
      io,
      templateHtml: TEMPLATE,
      server: async () => "http://127.0.0.1:4747",
      launch: async (target) => {
        launched.push(target);
        return true;
      },
    });
    const url = `http://127.0.0.1:4747/map?dir=${encodeURIComponent(root)}`;
    expect(launched).toEqual([url]);
    expect(io.lines).toEqual([`Wrote ${projectPaths(root).html}`, `Opened ${url}`]);
    expect(io.warnings).toEqual([]);
  });

  it("adds an initialized project missing from the registry back before serving it", async () => {
    const registry = join(dir, "home", "projects.json");
    await writeFile(registry, JSON.stringify({ schema: 1, projects: [] }));
    const launched: string[] = [];
    await openProject({
      dir: root,
      io,
      templateHtml: TEMPLATE,
      server: async () => "http://127.0.0.1:4747",
      launch: async (target) => {
        launched.push(target);
        return true;
      },
    });
    expect(launched).toEqual([`http://127.0.0.1:4747/map?dir=${encodeURIComponent(root)}`]);
    expect(JSON.parse(await readFile(registry, "utf8")).projects).toEqual([
      expect.objectContaining({ path: root, name: "proj" }),
    ]);
  });

  it("opens the file when the project cannot be registered, without asking for a server", async () => {
    // A directory where the registry file should be: it can be neither read nor written.
    await rm(join(dir, "home", "projects.json"), { force: true });
    await mkdir(join(dir, "home", "projects.json"));
    let asked = false;
    const launched: string[] = [];
    await openProject({
      dir: root,
      io,
      templateHtml: TEMPLATE,
      server: async () => {
        asked = true;
        return "http://127.0.0.1:4747";
      },
      launch: async (target) => {
        launched.push(target);
        return true;
      },
    });
    expect(asked).toBe(false);
    expect(launched).toEqual([projectPaths(root).html]);
  });

  it("falls back to the file when no server can start", async () => {
    const launched: string[] = [];
    await openProject({
      dir: root,
      io,
      templateHtml: TEMPLATE,
      server: NO_SERVER,
      launch: async (target) => {
        launched.push(target);
        return true;
      },
    });
    expect(launched).toEqual([projectPaths(root).html]);
    expect(io.lines).toEqual([
      `Wrote ${projectPaths(root).html}`,
      `Opened ${projectPaths(root).html}`,
    ]);
    expect(io.warnings).toEqual(["could not start the local map server; opened the file instead"]);
  });

  it("prints the path when no opener is available", async () => {
    await openProject({
      dir: root,
      io,
      templateHtml: TEMPLATE,
      server: NO_SERVER,
      launch: async () => false,
    });
    expect(io.lines.at(-1)).toBe(projectPaths(root).html);
    expect(io.warnings).toEqual([
      "could not start the local map server; opened the file instead",
      "no application opener found; open it manually",
    ]);
  });
});

describe("openPanel", () => {
  it("builds the panel and opens it through the local server", async () => {
    const launched: string[] = [];
    await openPanel({
      io,
      templateHtml: TEMPLATE,
      server: async () => "http://127.0.0.1:4747",
      launch: async (target) => {
        launched.push(target);
        return true;
      },
    });
    expect(launched).toEqual(["http://127.0.0.1:4747/"]);
    expect(io.lines).toEqual(["Opened http://127.0.0.1:4747/"]);
  });

  it("falls back to the panel file when no server can start", async () => {
    const launched: string[] = [];
    await openPanel({
      io,
      templateHtml: TEMPLATE,
      server: NO_SERVER,
      launch: async (target) => {
        launched.push(target);
        return true;
      },
    });
    expect(launched).toEqual([globalPaths(io.env).panel]);
    expect(io.lines).toEqual([`Opened ${globalPaths(io.env).panel}`]);
    expect(io.warnings).toEqual(["could not start the local map server; opened the file instead"]);
  });

  it("prints the panel path when no opener is available", async () => {
    await openPanel({ io, templateHtml: TEMPLATE, server: NO_SERVER, launch: async () => false });
    expect(io.lines.at(-1)).toBe(globalPaths(io.env).panel);
    expect(io.warnings).toEqual([
      "could not start the local map server; opened the file instead",
      "no application opener found; open it manually",
    ]);
  });
});
