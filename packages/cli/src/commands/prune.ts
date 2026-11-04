import { gitUserEmail } from "../git.js";
import { CliError, type Io } from "../io.js";
import { deleteRecords, isSharing } from "../record-sync.js";
import { resolveProjectRoot } from "../store/root.js";
import { loadAllSessions, loadProject } from "../store/stores.js";
import { buildProject } from "./build.js";

export interface PruneRecordOptions {
  dir: string;
  /** `30d`, `2w`, `6m`, `1y`. */
  olderThan: string;
  /** Teammates' sessions too; the default leaves them alone. */
  all?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  io: Io;
  /** Tests inject a minimal page instead of the bundled template. */
  templateHtml?: string;
}

const DAYS_PER_UNIT: Record<string, number> = { d: 1, w: 7, m: 30, y: 365 };

/** The moment before which a session counts as older than `age`. */
export function pruneCutoff(age: string, now: string): string {
  const match = /^(\d+)([dwmy])$/.exec(age.trim());
  if (match === null) throw new CliError(`invalid age "${age}"; use a number and d, w, m or y: 6m`);
  const days = Number(match[1]) * (DAYS_PER_UNIT[match[2] as string] as number);
  return new Date(Date.parse(now) - days * 86_400_000).toISOString();
}

/**
 * `cogit prune`: deletes old sessions for good, on this machine and, in a shared
 * project, in the repository. It only ever runs when asked, shows what it will
 * delete and needs a yes: unlike the rest of cogit, this cannot be undone.
 */
export async function pruneRecords(opts: PruneRecordOptions): Promise<void> {
  const { io } = opts;
  const { root } = await resolveProjectRoot(opts.dir);
  const project = await loadProject(root);
  if (!project.found) throw new CliError(`${root} is not initialized; run \`cogit init\` first`);
  if (!project.ok) throw new CliError(project.error);

  const cutoff = pruneCutoff(opts.olderThan, io.now());
  const me = await gitUserEmail(root, io.env);
  const sessions = (await loadAllSessions(root, io.warn)).filter(
    (session) =>
      session.updatedAt < cutoff &&
      (opts.all === true || session.authorEmail === undefined || session.authorEmail === me),
  );
  if (sessions.length === 0) {
    io.out(`No sessions older than ${opts.olderThan}.`);
    return;
  }

  const count = `${sessions.length} session${sessions.length === 1 ? "" : "s"}`;
  for (const session of sessions) {
    const author =
      session.authorEmail !== undefined && session.authorEmail !== me
        ? `  ${session.author ?? session.authorEmail}`
        : "";
    const title = session.title.trim() === "" ? session.sessionId : session.title.trim();
    io.out(`  ${session.updatedAt.slice(0, 10)}  ${title}${author}`);
  }
  const sharing = await isSharing(root);
  if (opts.dryRun === true) {
    io.out(`Would delete ${count}.`);
    return;
  }
  if (opts.yes !== true) {
    const where = sharing ? "from this machine and the repository" : "from this machine";
    const agreed = await io.prompt.confirm(
      `Delete ${count} ${where}? This cannot be undone.`,
      false,
    );
    if (!agreed) {
      io.out("Nothing deleted.");
      return;
    }
  }

  try {
    await deleteRecords(
      root,
      sessions.map((session) => session.sessionId),
      io.env,
    );
  } catch (err) {
    throw new CliError(
      `could not delete from the repository, so nothing was deleted: ${(err as Error).message}`,
    );
  }
  io.out(`Deleted ${count}.`);
  if (sharing)
    io.out("Copies already on teammates' machines stay until they delete them themselves.");
  await buildProject({
    dir: root,
    io,
    ...(opts.templateHtml === undefined ? {} : { templateHtml: opts.templateHtml }),
  });
}
