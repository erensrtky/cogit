import type { LineageViewModel, ViewFile, ViewFileHit, ViewNode } from "./model.js";

/**
 * File history (Story 8.15): which recorded messages touched a file, built from
 * the `files` the agent listed on a message plus the files of the message's
 * commits read from git at build time. `cogit log --file` and the map's
 * files view read the same model.
 */

/** The part of a session the file history needs; a `ViewSession` fits as is. */
export interface FileSourceSession {
  sessionId: string;
  /** The session's title; a session without one falls back to its id. */
  title: string;
  messages: readonly ViewNode[];
}

/** Parsed time, with `-Infinity` for an absent or rejected value. */
function timeOf(at: string | undefined): number {
  if (at === undefined) return Number.NEGATIVE_INFINITY;
  const time = Date.parse(at);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/** Newest first; the ids keep equal timestamps deterministic. */
function byNewest(a: ViewFileHit, b: ViewFileHit): number {
  return (
    timeOf(b.at) - timeOf(a.at) ||
    a.sessionId.localeCompare(b.sessionId) ||
    a.messageId.localeCompare(b.messageId)
  );
}

/**
 * `commitFiles` maps each recorded commit hash to the repository files it
 * changed. A commit hash git could not read keeps the message's own commits
 * listed (the record still knows them); a commit git does know contributes only
 * the paths it actually touched.
 */
export function buildFileHistory(
  sessions: readonly FileSourceSession[],
  commitFiles: ReadonlyMap<string, string[]> = new Map(),
): ViewFile[] {
  const byPath = new Map<string, ViewFileHit[]>();

  for (const session of sessions) {
    const sessionTitle = session.title.trim() === "" ? session.sessionId : session.title;
    // The branch a message sits in: the last branch summary that started at or
    // before it (same rule as `log` and the map's lanes).
    let branchTitle: string | undefined;
    for (const message of session.messages) {
      if (message.branch !== undefined) branchTitle = message.branch.title;
      const commits = message.commits ?? [];
      const fromCommits = new Map<string, string[]>();
      for (const hash of commits) {
        for (const path of commitFiles.get(hash) ?? []) {
          const list = fromCommits.get(path) ?? [];
          list.push(hash);
          fromCommits.set(path, list);
        }
      }
      const paths = new Set<string>([...(message.files ?? []), ...fromCommits.keys()]);
      // A commit git does not know cannot say which files it touched, so it stays
      // listed for every file of the message; a known commit only for its own.
      const unknown = commits.filter((hash) => !commitFiles.has(hash));
      for (const path of paths) {
        const touching = [...(fromCommits.get(path) ?? []), ...unknown];
        const hit: ViewFileHit = {
          sessionId: session.sessionId,
          sessionTitle,
          messageId: message.id,
          label: message.label ?? message.id,
          ...(message.at === undefined ? {} : { at: message.at }),
          title: message.title,
          ...(branchTitle === undefined ? {} : { branch: branchTitle }),
          commits: [...new Set(touching)],
        };
        const list = byPath.get(path) ?? [];
        list.push(hit);
        byPath.set(path, list);
      }
    }
  }

  const files: ViewFile[] = [...byPath].map(([path, hits]) => {
    hits.sort(byNewest);
    const newest = hits[0];
    return {
      path,
      hits,
      count: hits.length,
      ...(newest?.at === undefined ? {} : { lastAt: newest.at }),
    };
  });
  return files.sort((a, b) => timeOf(b.lastAt) - timeOf(a.lastAt) || a.path.localeCompare(b.path));
}

/** Every session of a built page, epoch order and then the unassigned ones. */
export function modelSessions(model: LineageViewModel): FileSourceSession[] {
  return [...model.epochs.flatMap((epoch) => epoch.sessions), ...model.unassigned];
}
