import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/** True only for an existing directory; any error (missing, file, permissions) is false. */
export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** Writes via a temp file in the same directory and renames it into place. */
export async function atomicWrite(file: string, data: string): Promise<void> {
  const dir = dirname(file);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.${basename(file)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  const fh = await open(tmp, "w");
  try {
    await fh.writeFile(data);
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await rename(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

export async function atomicWriteJson(file: string, value: unknown): Promise<void> {
  await atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`);
}

export type JsonRead =
  | { found: false }
  | { found: true; value: unknown }
  | { found: true; error: string };

/** Reads a JSON file; a missing file is not an error, invalid JSON is reported. */
export async function readJson(file: string): Promise<JsonRead> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (err) {
    // ENOTDIR: a path component is a file, so this file cannot exist either
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return { found: false };
    throw err;
  }
  try {
    return { found: true, value: JSON.parse(text) };
  } catch (err) {
    return { found: true, error: `invalid JSON: ${(err as Error).message}` };
  }
}
