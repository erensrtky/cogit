import { EventEmitter } from "node:events";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { init } from "../src/commands/init.js";
import { launchFile, openerCommand, openPanel, openProject } from "../src/commands/open.js";
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
    expect(openerCommand("darwin", "/p/lineage.html")).toEqual({
      command: "open",
      args: ["/p/lineage.html"],
    });
    expect(openerCommand("win32", "/p/lineage.html")).toEqual({
      command: "cmd",
      args: ["/c", "start", "", "/p/lineage.html"],
    });
    expect(openerCommand("linux", "/p/lineage.html")).toEqual({
      command: "xdg-open",
      args: ["/p/lineage.html"],
    });
  });
});

describe("launchFile", () => {
  it("resolves true once the opener starts", async () => {
    const calls: string[][] = [];
    expect(await launchFile("/p/lineage.html", fakeSpawn("spawn", calls))).toBe(true);
    const { command } = openerCommand(process.platform, "/p/lineage.html");
    expect(calls).toEqual([[command, "/p/lineage.html"]]);
  });

  it("resolves false when the opener binary is missing", async () => {
    expect(await launchFile("/p/lineage.html", fakeSpawn("error", []))).toBe(false);
  });
});

describe("openProject", () => {
  it("builds the map and opens it with the OS opener", async () => {
    const launched: string[] = [];
    await openProject({
      dir: root,
      io,
      templateHtml: TEMPLATE,
      launch: async (file) => {
        launched.push(file);
        return true;
      },
    });
    expect(launched).toEqual([projectPaths(root).html]);
    expect(io.lines).toEqual([
      `Wrote ${projectPaths(root).html}`,
      `Opened ${projectPaths(root).html}`,
    ]);
  });

  it("prints the path when no opener is available", async () => {
    await openProject({ dir: root, io, templateHtml: TEMPLATE, launch: async () => false });
    expect(io.lines.at(-1)).toBe(projectPaths(root).html);
    expect(io.warnings).toEqual(["no application opener found; open the file manually"]);
  });
});

describe("openPanel", () => {
  it("builds the panel and opens it with the OS opener", async () => {
    const launched: string[] = [];
    await openPanel({
      io,
      templateHtml: TEMPLATE,
      launch: async (file) => {
        launched.push(file);
        return true;
      },
    });
    expect(launched).toEqual([globalPaths(io.env).panel]);
    expect(io.lines).toEqual([`Opened ${globalPaths(io.env).panel}`]);
  });

  it("prints the panel path when no opener is available", async () => {
    await openPanel({ io, templateHtml: TEMPLATE, launch: async () => false });
    expect(io.lines.at(-1)).toBe(globalPaths(io.env).panel);
    expect(io.warnings).toEqual(["no application opener found; open the file manually"]);
  });
});
