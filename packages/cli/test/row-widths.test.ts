import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projectPaths } from "../src/store/paths.js";
import { readRowWidths, setRowWidth } from "../src/store/row-widths.js";

describe("row widths state", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "cogit-row-widths-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("stores, replaces and forgets a session's width", async () => {
    expect(await readRowWidths(root)).toEqual({});
    await setRowWidth(root, "b", 700);
    await setRowWidth(root, "a", 900);
    await setRowWidth(root, "b", 640);
    expect(await readRowWidths(root)).toEqual({ a: 900, b: 640 });
    await setRowWidth(root, "a", null);
    expect(await readRowWidths(root)).toEqual({ b: 640 });
  });

  it("refuses a bad session id or width", async () => {
    await expect(setRowWidth(root, "bad id!", 700)).rejects.toThrow("not a session id");
    await expect(setRowWidth(root, "a", 0)).rejects.toThrow("not a row width");
    await expect(setRowWidth(root, "a", 1.5)).rejects.toThrow("not a row width");
    await expect(setRowWidth(root, "a", 20_000)).rejects.toThrow("not a row width");
  });

  it("reads a damaged file as nothing stored, and replaces it on the next write", async () => {
    const file = projectPaths(root).rowWidths;
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, '{"schema":1,"widths":{"a":"wide"}}');
    expect(await readRowWidths(root)).toEqual({});
    await setRowWidth(root, "a", 700);
    expect(await readRowWidths(root)).toEqual({ a: 700 });
  });
});
