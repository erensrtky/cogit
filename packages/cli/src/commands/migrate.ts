import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Io } from "../io.js";
import { MESSAGE_HASH, readSessionMessages, upgradeSessionIds } from "../messages.js";
import { appendEvents, readEvents, seedEvents } from "../store/events.js";
import { projectPaths } from "../store/paths.js";
import { resolveProjectRoot } from "../store/root.js";
import { listSessionIds, loadSession, updateSession } from "../store/stores.js";

/** Where the pre-migration copy of every record is kept. */
export const BACKUP_DIR = "backup-pre-8.5";

export interface MigrateResult {
  /** Sessions whose records now carry stable ids and an events file. */
  migrated: number;
  /** Sessions an earlier run already migrated, or that have no messages to map. */
  skipped: number;
}

/**
 * Story 8.5 migration for records written before it: every message node's `m1`
 * label becomes its stable `h…` id and the record's structure moves into the
 * append-only events file. Runs once per project; a second run finds the events
 * and changes nothing. A session whose transcript and stored conversation are
 * both gone cannot be hashed and is left exactly as it is.
 */
export async function migrateIds(dir: string, io: Io): Promise<MigrateResult> {
  const { root } = await resolveProjectRoot(dir);
  const paths = projectPaths(root);
  const ids = await listSessionIds(paths.sessions);
  let backedUp = false;
  let migrated = 0;
  let skipped = 0;

  for (const id of ids) {
    const loaded = await loadSession(root, id);
    if (!loaded.found) continue;
    if (!loaded.ok) {
      io.warn(`session ${id}: skipped, ${loaded.error}`);
      skipped += 1;
      continue;
    }
    if (!loaded.data.nodes.some((node) => node.kind === "message")) continue;
    const events = await readEvents(root, id);
    if (events.length > 0) {
      skipped += 1;
      continue;
    }
    const messages = await readSessionMessages(root, id, io.env);
    if (!messages) {
      io.warn(`session ${id}: no transcript or stored conversation, ids left as they are`);
      skipped += 1;
      continue;
    }
    const upgraded = upgradeSessionIds(loaded.data, messages);
    const unmapped = upgraded.nodes.filter(
      (node) => node.kind === "message" && !MESSAGE_HASH.test(node.id),
    );
    if (unmapped.length > 0) {
      io.warn(
        `session ${id}: ${unmapped.length} message(s) have no transcript line, left as they are`,
      );
      skipped += 1;
      continue;
    }
    if (!backedUp) {
      await backupRecords(paths.sessions, paths.backup(BACKUP_DIR));
      backedUp = true;
    }
    await updateSession(root, id, async (cur) => {
      const next = upgradeSessionIds(cur ?? loaded.data, messages);
      // Re-checked under the session lock: a concurrent write may have seeded it.
      if ((await readEvents(root, id)).length === 0)
        await appendEvents(root, id, seedEvents(next.nodes, io.now()));
      return next;
    });
    migrated += 1;
  }
  return { migrated, skipped };
}

/** Copies every record (and any events file) once, before anything changes. */
async function backupRecords(sessions: string, backup: string): Promise<void> {
  await mkdir(backup, { recursive: true });
  for (const entry of await readdir(sessions)) {
    if (!entry.endsWith(".json") && !entry.endsWith(".events.jsonl")) continue;
    await copyFile(join(sessions, entry), join(backup, entry));
  }
}
