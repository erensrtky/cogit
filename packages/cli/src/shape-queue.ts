import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnDetachedProcess } from "./hooks/run.js";
import type { Session } from "./schema/session.js";
import { projectPaths } from "./store/paths.js";

/**
 * Commits whose message had no record yet when they landed (Story 13.6). A
 * commit usually lands before the Stop hook writes the message it belongs to,
 * so the post-commit Shape run leaves the commit here and the next
 * `session write` that holds the message starts the Shape. Local state: one
 * file per commit, named by its full hash, holding the `Thought:` message id.
 */

const FULL_HASH = /^[0-9a-f]{40}$/;

/** A commit whose message never got a record (a deleted session) stops waiting. */
const QUEUE_MAX_AGE_MS = 7 * 24 * 3_600_000;

export interface QueuedShape {
  commit: string;
  thought: string;
}

export async function enqueueShape(root: string, commit: string, thought: string): Promise<void> {
  const dir = projectPaths(root).shapeQueue;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, commit), `${thought}\n`);
}

export async function dequeueShape(root: string, commit: string): Promise<void> {
  await rm(join(projectPaths(root).shapeQueue, commit), { force: true });
}

/** The waiting commits; stale entries are dropped on the way. */
export async function queuedShapes(root: string, now: Date = new Date()): Promise<QueuedShape[]> {
  const dir = projectPaths(root).shapeQueue;
  const names = await readdir(dir).catch(() => [] as string[]);
  const out: QueuedShape[] = [];
  for (const name of names) {
    if (!FULL_HASH.test(name)) continue;
    const file = join(dir, name);
    const info = await stat(file).catch(() => undefined);
    if (info === undefined) continue;
    if (now.getTime() - info.mtimeMs > QUEUE_MAX_AGE_MS) {
      await rm(file, { force: true });
      continue;
    }
    const thought = (await readFile(file, "utf8").catch(() => "")).trim();
    if (thought !== "") out.push({ commit: name, thought });
  }
  return out;
}

/** The queued commits whose message the session now holds. */
export function readyShapes(queue: readonly QueuedShape[], session: Session): QueuedShape[] {
  const ids = new Set(session.nodes.filter((n) => n.kind === "message").map((n) => n.id));
  return queue.filter((entry) => ids.has(entry.thought));
}

/**
 * Starts a detached `cogit shape --commit` for each queued commit the session
 * now explains. The shape run takes the commit off the queue; a second start
 * while one runs stops at the shape lock.
 */
export async function drainShapeQueue(
  root: string,
  session: Session,
  env: NodeJS.ProcessEnv,
  cli: string | undefined,
  spawn: typeof spawnDetachedProcess = spawnDetachedProcess,
): Promise<number> {
  if (cli === undefined) return 0;
  const ready = readyShapes(await queuedShapes(root), session);
  for (const entry of ready) {
    spawn(
      cli,
      ["shape", "--commit", entry.commit, "-C", root],
      env,
      projectPaths(root).detachedLog,
    );
  }
  return ready.length;
}
