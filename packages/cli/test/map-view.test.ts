import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_OPEN, readMapView, setOpenSessions, setRowWidth } from "../src/store/map-view.js";
import { projectPaths } from "../src/store/paths.js";

describe("map view state", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "cogit-map-view-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("stores, replaces and forgets a session's width", async () => {
    expect((await readMapView(root)).rowWidths).toEqual({});
    await setRowWidth(root, "b", 700);
    await setRowWidth(root, "a", 900);
    await setRowWidth(root, "b", 640);
    expect((await readMapView(root)).rowWidths).toEqual({ a: 900, b: 640 });
    await setRowWidth(root, "a", null);
    expect((await readMapView(root)).rowWidths).toEqual({ b: 640 });
  });

  it("stores the open sessions next to the widths without touching them", async () => {
    await setRowWidth(root, "a", 700);
    await setOpenSessions(root, ["b", "a", "b"]);
    expect(await readMapView(root)).toEqual({ schema: 1, rowWidths: { a: 700 }, open: ["b", "a"] });
    await setOpenSessions(root, []);
    expect((await readMapView(root)).open).toEqual([]);
    expect((await readMapView(root)).rowWidths).toEqual({ a: 700 });
  });

  it("refuses a bad session id, width or list", async () => {
    await expect(setRowWidth(root, "bad id!", 700)).rejects.toThrow("not a session id");
    await expect(setRowWidth(root, "a", 0)).rejects.toThrow("not a row width");
    await expect(setRowWidth(root, "a", 1.5)).rejects.toThrow("not a row width");
    await expect(setRowWidth(root, "a", 20_000)).rejects.toThrow("not a row width");
    await expect(setOpenSessions(root, ["bad id!"])).rejects.toThrow("not a session id");
    const many = Array.from({ length: MAX_OPEN + 1 }, (_, at) => `s${at}`);
    await expect(setOpenSessions(root, many)).rejects.toThrow("too many open sessions");
  });

  it("reads a damaged file as nothing stored, and replaces it on the next write", async () => {
    const file = projectPaths(root).mapView;
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, '{"schema":1,"rowWidths":{"a":"wide"}}');
    expect(await readMapView(root)).toEqual({ schema: 1, rowWidths: {}, open: [] });
    await setRowWidth(root, "a", 700);
    expect((await readMapView(root)).rowWidths).toEqual({ a: 700 });
  });
});
