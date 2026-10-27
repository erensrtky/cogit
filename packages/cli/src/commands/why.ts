import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { blameCommitHashes, findGitRoot } from "../git.js";
import { CliError, type Io } from "../io.js";
import { resolveProjectRoot } from "../store/root.js";
import { loadAllSessions, loadProject } from "../store/stores.js";
import { attachThoughtTrailers, earliestSessionStart, readThoughtTrailers } from "../thought.js";
import { buildMessages } from "../view/lineage.js";
import type { ViewNode } from "../view/model.js";
import { shortHash, stamp } from "./log.js";

/**
 * `cogit why <file>` (Story 10.4): the decisions and rejected alternatives of
 * the thoughts behind a file. The chain is deterministic — file → commits that
 * touched it (the same index `blame` uses) → their `Thought:` messages → the
 * record's "considered and rejected" options — so the answer is exact, though
 * each summary is only as good as the record the agent wrote. No message text
 * is read or classified.
 */

/** An option the record says was considered and not taken, with the reason. */
export interface WhyAlternative {
  option: string;
  why: string;
}

/** One decision behind the file, as the record holds it. */
export interface WhyDecision {
  title: string;
  why: string;
  alternatives: WhyAlternative[];
}

/** One thought behind the file, with the decisions it recorded. */
export interface WhyHit {
  sessionId: string;
  sessionTitle: string;
  /** The message hash `cogit show` takes. */
  messageId: string;
  /** The `mN` label the map shows. */
  label: string;
  /** The message time (its session's start when the record has none). */
  at: string;
  title: string;
  decisions: WhyDecision[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `26 Oct`, the short date the note shows; an unparseable value stays as it is. */
export function dayStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** A repo-relative path, or undefined when the file sits outside the repository. */
function repositoryPath(gitRoot: string, root: string, file: string): string | undefined {
  const rel = relative(gitRoot, resolve(root, file));
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return undefined;
  return rel.split(sep).join("/");
}

/** A recorded short hash may name a full hash git printed, or the reverse. */
function sameCommit(recorded: string, blamed: string): boolean {
  return blamed.startsWith(recorded) || recorded.startsWith(blamed);
}

/**
 * The decisions a message recorded: its own (a user-level choice with a `why`,
 * or rejected options) and the agent's decisions along the way. A message with
 * neither is left out: the lookup is about what was considered, not every file
 * a thought touched.
 */
function decisionsOf(message: ViewNode): WhyDecision[] {
  const decisions: WhyDecision[] = [];
  const alternatives = message.alternatives ?? [];
  if (alternatives.length > 0 || (message.why ?? "").trim() !== "") {
    decisions.push({ title: message.title, why: message.why ?? "", alternatives });
  }
  for (const decision of message.agentDecisions ?? []) {
    decisions.push({
      title: decision.title,
      why: decision.why,
      alternatives: decision.alternatives ?? [],
    });
  }
  return decisions;
}

/**
 * The decisions of the thoughts behind `file`, newest first. `file` is relative
 * to the project root. Any unreadable part (no repository, no history, no
 * record) is "nothing known": a hook may call this on every edit.
 */
export async function collectWhy(
  root: string,
  file: string,
  env?: NodeJS.ProcessEnv,
): Promise<WhyHit[]> {
  const gitRoot = await findGitRoot(root);
  if (gitRoot === undefined) return [];
  const repoPath = repositoryPath(gitRoot, root, file);
  if (repoPath === undefined) return [];

  let commits: string[];
  try {
    commits = await blameCommitHashes(gitRoot, repoPath);
  } catch {
    return [];
  }
  if (commits.length === 0) return [];

  const sessions = await loadAllSessions(root, () => {});
  const trailers = await readThoughtTrailers(root, {
    ...(env === undefined ? {} : { env }),
    since: earliestSessionStart(sessions),
  });
  const attached = attachThoughtTrailers(sessions, trailers);
  const hits: WhyHit[] = [];

  for (const session of attached) {
    const sessionTitle = session.title.trim() === "" ? session.sessionId : session.title;
    for (const message of buildMessages(session.nodes)) {
      const linked = (message.commits ?? []).some((hash) =>
        commits.some((commit) => sameCommit(hash, commit)),
      );
      if (!linked) continue;
      const decisions = decisionsOf(message);
      if (decisions.length === 0) continue;
      hits.push({
        sessionId: session.sessionId,
        sessionTitle,
        messageId: message.id,
        label: message.label ?? message.id,
        at: message.at ?? session.startedAt,
        title: message.title,
        decisions,
      });
    }
  }

  const time = (hit: WhyHit): number => {
    const parsed = Date.parse(hit.at);
    return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
  };
  return hits.sort(
    (a, b) =>
      time(b) - time(a) ||
      a.sessionId.localeCompare(b.sessionId) ||
      a.messageId.localeCompare(b.messageId),
  );
}

/** The plain-text `why`: each thought with its decisions, newest first. */
export function formatWhy(hits: readonly WhyHit[]): string[] {
  const lines: string[] = [];
  for (const hit of hits) {
    if (lines.length > 0) lines.push("");
    lines.push(
      `${shortHash(hit.messageId)}  ${hit.label}  ${stamp(hit.at)} · ${oneLine(hit.title)}`,
    );
    lines.push(`  ${oneLine(hit.sessionTitle)} (${hit.sessionId})`);
    for (const decision of hit.decisions) {
      const why = oneLine(decision.why);
      lines.push(`  decision: ${oneLine(decision.title)}${why === "" ? "" : ` — ${why}`}`);
      for (const alt of decision.alternatives) {
        const reason = oneLine(alt.why);
        lines.push(`    not: ${oneLine(alt.option)}${reason === "" ? "" : ` — ${reason}`}`);
      }
    }
  }
  return lines;
}

export interface WhyOptions {
  dir: string;
  /** A file, relative to the project or absolute. */
  file: string;
  io: Io;
}

/**
 * Prints the decisions and rejected alternatives of the thoughts behind a file,
 * each with its message hash and date.
 */
export async function why(opts: WhyOptions): Promise<WhyHit[]> {
  const { io } = opts;
  const { root } = await resolveProjectRoot(opts.dir);
  const project = await loadProject(root);
  if (!project.found) throw new CliError(`${root} is not initialized; run \`cogit init\` first`);
  if (!project.ok) throw new CliError(project.error);
  if ((await findGitRoot(root)) === undefined)
    throw new CliError(`${root} is not inside a git repository; why needs one`);

  const exists = await stat(resolve(root, opts.file)).then(
    (info) => info.isFile(),
    () => false,
  );
  if (!exists) throw new CliError(`${opts.file} does not exist`);

  const hits = await collectWhy(root, opts.file, io.env);
  if (hits.length === 0) {
    io.out(`No decisions or rejected alternatives recorded for ${opts.file}.`);
    return hits;
  }
  for (const line of formatWhy(hits)) io.out(line);
  io.out("");
  io.out("`cogit show <hash>` opens the thought; the record is the agent's summary.");
  return hits;
}

/** How many rejected options one PreToolUse note carries. */
export const TRY_BEFORE_MAX_ITEMS = 5;

/** Roughly how long the note may be; the rest is left to `cogit why`. */
export const TRY_BEFORE_MAX_CHARS = 600;

interface RejectedItem extends WhyAlternative {
  messageId: string;
  at: string;
}

/** Every rejected option behind the file, in the hits' (newest-first) order. */
export function rejectedItems(hits: readonly WhyHit[]): RejectedItem[] {
  const items: RejectedItem[] = [];
  for (const hit of hits) {
    for (const decision of hit.decisions) {
      for (const alt of decision.alternatives) {
        items.push({ ...alt, messageId: hit.messageId, at: hit.at });
      }
    }
  }
  return items;
}

/**
 * The note a PreToolUse hook adds when the agent is about to edit a file whose
 * earlier thoughts rejected some options. A fact from the record, not a rule:
 * the agent and the user decide what to do with it. At most five options and
 * about {@link TRY_BEFORE_MAX_CHARS} characters; the rest points at
 * `cogit why <file>`. Undefined when there is nothing to say.
 */
export function tryBeforeNote(file: string, hits: readonly WhyHit[]): string | undefined {
  const items = rejectedItems(hits);
  if (items.length === 0) return undefined;

  const header = "Earlier, for this file:";
  const footer = "Decide knowingly.";
  const more = `See \`cogit why ${file}\` for more.`;
  const lines: string[] = [];
  for (const item of items.slice(0, TRY_BEFORE_MAX_ITEMS)) {
    const reason = oneLine(item.why) === "" ? "no reason recorded" : oneLine(item.why);
    const line =
      `- "${oneLine(item.option)}" was considered and rejected ` +
      `(${shortHash(item.messageId)}, ${dayStamp(item.at)}): ${reason}`;
    const truncated = lines.length + 1 < items.length;
    const total = [header, ...lines, line, footer, ...(truncated ? [more] : [])].join("\n");
    if (total.length <= TRY_BEFORE_MAX_CHARS) {
      lines.push(line);
      continue;
    }
    // No room left. Count and character caps both end in the same "more" line.
    break;
  }
  if (lines.length === 0) {
    // One option's own reason can be long (the schema allows 200 + 500 chars):
    // keep the header, footer and pointer, and clip only the option line.
    const first = items[0];
    if (first === undefined) return undefined;
    const reason = oneLine(first.why) === "" ? "no reason recorded" : oneLine(first.why);
    const full =
      `- "${oneLine(first.option)}" was considered and rejected ` +
      `(${shortHash(first.messageId)}, ${dayStamp(first.at)}): ${reason}`;
    const tail = [footer, ...(items.length > 1 ? [more] : [])].join("\n");
    const room = TRY_BEFORE_MAX_CHARS - header.length - tail.length - 3;
    if (room < 40) return undefined;
    lines.push(full.length <= room ? full : `${full.slice(0, room - 1).trimEnd()}…`);
  }

  const truncated = lines.length < items.length;
  return [header, ...lines, footer, ...(truncated ? [more] : [])].join("\n");
}
