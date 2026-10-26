import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { blameCommitHashes, findGitRoot } from "../git.js";
import { CliError, type Io } from "../io.js";
import { projectPaths } from "../store/paths.js";
import { resolveProjectRoot } from "../store/root.js";
import { loadAllSessions, loadProject } from "../store/stores.js";
import { buildMessages } from "../view/lineage.js";

/**
 * `cogit blame` (Story 8.8): git knows which commit wrote a line, the
 * records know which user message that commit carried out, so the command walks
 * commits → messages and points back at the map.
 */

export interface BlameOptions {
  dir: string;
  /** `file` or `file:line`. */
  target: string;
  io: Io;
}

export interface BlameHit {
  /** The blamed commit, short. */
  commit: string;
  sessionId: string;
  sessionTitle: string;
  messageId: string;
  /** The `m12` label the map shows. */
  label: string;
  title: string;
  summary?: string;
  /** The map page at that message. */
  url: string;
}

/** `src/app.ts:42` → file and line; a path without `:line` keeps no line. */
export function parseBlameTarget(target: string): { file: string; line?: number } {
  // Greedy, so a Windows drive letter or a colon in a directory stays in the file.
  const match = /^(.*):([1-9][0-9]*)$/.exec(target);
  if (match === null) return { file: target };
  return { file: match[1] as string, line: Number(match[2]) };
}

/** A short hash from the record may name a full hash from git, or the reverse. */
function sameCommit(recorded: string, blamed: string): boolean {
  return blamed.startsWith(recorded) || recorded.startsWith(blamed);
}

/** One readable line from git's failure; the first line carries the reason. */
function gitMessage(err: unknown): string {
  const stderr = (err as { stderr?: unknown }).stderr;
  const text = typeof stderr === "string" && stderr.trim() !== "" ? stderr : String(err);
  return text.trim().split("\n")[0] ?? "unknown git error";
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Prints every recorded message that lists a commit git blames for the target,
 * with the map URL that opens that message. A plain "no hit" line when the
 * records do not know the code yet.
 */
export async function blame(opts: BlameOptions): Promise<BlameHit[]> {
  const { io } = opts;
  const { root } = await resolveProjectRoot(opts.dir);
  const project = await loadProject(root);
  if (!project.found) throw new CliError(`${root} is not initialized; run \`cogit init\` first`);
  if (!project.ok) throw new CliError(project.error);

  const gitRoot = await findGitRoot(root);
  if (gitRoot === undefined)
    throw new CliError(`${root} is not inside a git repository; blame needs one`);

  const { file, line } = parseBlameTarget(opts.target);
  const absolute = resolve(root, file);
  const path = relative(gitRoot, absolute);
  if (path === "" || path.startsWith("..") || isAbsolute(path))
    throw new CliError(`${file} is outside ${gitRoot}`);
  // `git log -- <missing file>` quietly finds no commits; the user mistyped a path.
  const exists = await stat(absolute).then(
    (info) => info.isFile(),
    () => false,
  );
  if (!exists) throw new CliError(`${file} does not exist`);
  const repoPath = path.split(sep).join("/");

  let commits: string[];
  try {
    commits = await blameCommitHashes(gitRoot, repoPath, line);
  } catch (err) {
    throw new CliError(`git could not read ${opts.target}: ${gitMessage(err)}`);
  }

  const sessions = [...(await loadAllSessions(root, io.warn))].sort(
    (a, b) => a.startedAt.localeCompare(b.startedAt) || a.sessionId.localeCompare(b.sessionId),
  );
  const mapUrl = pathToFileURL(projectPaths(root).html).href;
  const hits: BlameHit[] = [];
  const seen = new Set<string>();

  for (const commit of commits) {
    for (const session of sessions) {
      for (const message of buildMessages(session.nodes)) {
        const recorded = (message.commits ?? []).find((hash) => sameCommit(hash, commit));
        if (recorded === undefined) continue;
        const key = `${commit}:${message.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({
          commit: commit.slice(0, 7),
          sessionId: session.sessionId,
          sessionTitle: session.title || session.sessionId,
          messageId: message.id,
          label: message.label ?? message.id,
          title: message.title,
          ...(message.summary === undefined ? {} : { summary: message.summary }),
          url: `${mapUrl}#s=${encodeURIComponent(session.sessionId)}&m=${encodeURIComponent(
            message.id,
          )}`,
        });
      }
    }
  }

  for (const hit of hits) {
    io.out(`${hit.commit}  ${hit.sessionTitle} · ${hit.label} ${hit.title}`);
    if (hit.summary !== undefined && hit.summary.trim() !== "") io.out(`  ${oneLine(hit.summary)}`);
    io.out(`  ${hit.url}`);
  }
  if (hits.length === 0) {
    const what = line === undefined ? file : `${file}:${line}`;
    io.out(`No recorded message lists a commit that touched ${what}.`);
  }
  return hits;
}
