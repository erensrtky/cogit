import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export interface LockOptions {
  /** Give up after this long. 0 = try once. */
  timeoutMs?: number;
  /** A lock older than this is considered abandoned. */
  staleMs?: number;
}

export class LockBusyError extends Error {
  constructor(readonly lockPath: string) {
    super(`lock is held: ${lockPath}`);
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function isStale(lockPath: string, staleMs: number): Promise<boolean> {
  try {
    const owner = Number.parseInt(await readFile(join(lockPath, "owner"), "utf8"), 10);
    if (Number.isInteger(owner) && owner > 0 && !alive(owner)) return true;
  } catch {
    // owner not written yet (or already gone): fall back to age
  }
  // the lock may vanish between mkdir and stat; then it is not stale, just retry
  const info = await stat(lockPath).catch(() => undefined);
  return info !== undefined && Date.now() - info.mtimeMs > staleMs;
}

async function acquire(lockPath: string, opts: LockOptions): Promise<void> {
  const { timeoutMs = 10_000, staleMs = 60_000 } = opts;
  const deadline = Date.now() + timeoutMs;
  await mkdir(dirname(lockPath), { recursive: true });
  for (let delay = 20; ; delay = Math.min(delay * 2, 250)) {
    try {
      await mkdir(lockPath);
      await writeFile(join(lockPath, "owner"), String(process.pid));
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
    if (await isStale(lockPath, staleMs)) {
      await rm(lockPath, { recursive: true, force: true });
      continue;
    }
    if (Date.now() >= deadline) throw new LockBusyError(lockPath);
    await sleep(delay);
  }
}

/** Runs `fn` while holding a directory lock (mkdir is atomic on every platform). */
export async function withLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
  opts: LockOptions = {},
): Promise<T> {
  await acquire(lockPath, opts);
  try {
    return await fn();
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}
