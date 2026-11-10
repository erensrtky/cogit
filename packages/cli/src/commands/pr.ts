import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { cogitIgnored, findGitRoot, gitUserEmail, readCommitFiles } from "../git.js";
import { CliError, type Io } from "../io.js";
import type { Session } from "../schema/session.js";
import { earliestSessionStart, readThoughtTrailers } from "../thought.js";
import { buildMessages } from "../view/lineage.js";
import type { ViewNode, ViewPullRequest, ViewShapeTool } from "../view/model.js";
import { shapeMarkdown } from "../view/shape.js";
import {
  type EffectiveSession,
  loadEffectiveSessions,
  openProject,
  shortHash,
  stamp,
} from "./log.js";

const exec = promisify(execFile);

/**
 * `cogit pr` (Story 10.1): a review-ready description of a branch, built from
 * the thoughts the `Thought:` trailers point at. A reviewer sees the goal, the
 * decisions and the rejected options instead of asking for them in comments.
 * Only the record's own fields are read — never the conversation text or the
 * user's raw prompt, because the PR may be public.
 */

/** GitHub's body limit is 65 536 characters; leave a little room. */
export const PR_CHAR_CAP = 60_000;

export interface PrBase {
  /** The ref the user asked for, or `@{upstream}` / `main` / `master`. */
  ref: string;
  /** The full hash of the merge base `base..HEAD` starts from. */
  commit: string;
}

/** One commit of the branch, with the record's thought and the files it changed. */
export interface PrCommit {
  full: string;
  short: string;
  at: string;
  subject: string;
  /** The author's email, so a missing thought can be told apart: one's own, or someone else's. */
  authorEmail?: string;
  /** The messages the commit names; a squash can name several. */
  thoughts?: string[];
  /** Repository-relative paths; empty when git no longer has the commit. */
  files: string[];
}

/** A commit no recorded thought explains. */
export interface PrUnlinkedCommit {
  full: string;
  short: string;
  subject: string;
  /** Set when the trailer names a thought the record does not hold yet. */
  thought?: string;
  /**
   * True when someone else wrote the commit: their thought reaches this clone only
   * once they push it, and never from a fork, whose record stays in the fork.
   */
  others?: boolean;
}

export interface PrGoal {
  text: string;
  sessionId: string;
  sessionTitle: string;
}

/** One session the branch's thoughts come from, with the label range it covers. */
export interface PrSessionLine {
  sessionId: string;
  shortId: string;
  title: string;
  startedAt: string;
  updatedAt: string;
  /** Message labels of the thoughts from this session in the branch. */
  from: string;
  to: string;
  thoughtCount: number;
  commitCount: number;
}

/** One thought with everything the description says about it. */
export interface PrThought {
  id: string;
  shortId: string;
  label: string;
  sessionId: string;
  shortSessionId: string;
  sessionTitle: string;
  title: string;
  summary?: string;
  why?: string;
  decidedBy?: "user" | "agent" | "agreed";
  alternatives: { option: string; why: string }[];
  agentDecisions: {
    title: string;
    why: string;
    alternatives: { option: string; why: string }[];
  }[];
  /**
   * Earlier messages of the same thread that decided something before this one
   * landed the commit, oldest first: the thought behind a commit is often a
   * plain "commit it", and the reason sits a few messages up.
   */
  ledHere: PrLedHere[];
  /** The message's Shape, when one was written: what the change does. */
  shape?: ViewShapeTool[];
  commits: PrCommit[];
}

/** A decision or correction on the way to a thought; no conversation text. */
export interface PrLedHere {
  id: string;
  shortId: string;
  label: string;
  title: string;
  why?: string;
  alternatives: { option: string; why: string }[];
}

/** How far up the thread `ledHere` looks. */
const LED_HERE_DEPTH = 5;

export interface PrModel {
  base: PrBase;
  head: string;
  /** What the project does with its record: it travels, or it stays local. */
  policy: "share" | "ignore";
  goals: PrGoal[];
  sessions: PrSessionLine[];
  thoughts: PrThought[];
  unlinked: PrUnlinkedCommit[];
}

/** `git log` for a branch, oldest first: `%H%x00%h%x00%cI%x00%ae%x00%s` per line. */
export function parsePrCommits(stdout: string): Omit<PrCommit, "files" | "thought">[] {
  const out: Omit<PrCommit, "files" | "thought">[] = [];
  for (const line of stdout.split("\n")) {
    const [full, short, at, authorEmail, subject] = line.split("\0");
    if (full === undefined || !/^[0-9a-f]{40}$/.test(full)) continue;
    if (short === undefined || short === "") continue;
    out.push({
      full,
      short,
      at: at ?? "",
      subject: subject ?? "",
      ...(authorEmail ? { authorEmail } : {}),
    });
  }
  return out;
}

/** Git with `-C`, or undefined when the command fails (an unknown ref, no git). */
async function git(
  root: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  try {
    const { stdout } = await exec("git", ["-C", root, ...args], { env });
    return String(stdout).trim();
  } catch {
    return undefined;
  }
}

/** The full hash a ref names, or undefined when it does not resolve. */
async function revParse(
  root: string,
  ref: string,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const out = await git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], env);
  return out !== undefined && /^[0-9a-f]{40}$/.test(out) ? out : undefined;
}

/**
 * The base of the review (Story 10.1): where the branch will merge. An explicit
 * base wins; then the upstream's merge base when the branch tracks another
 * branch (`main`, or the branch it is stacked on); then the remote's default
 * branch, `main` and `master`, remote copy first since a local one may lag.
 * A branch pushed with `git push -u` tracks its own remote copy, which only
 * says what is unpushed: taken as the base, it emptied the description right
 * when the pull request is opened. None of these is a user error naming the
 * command that fixes it.
 */
export async function resolvePrBase(
  root: string,
  requested: string | undefined,
  env: NodeJS.ProcessEnv,
): Promise<PrBase> {
  if (requested !== undefined) {
    const commit = await revParse(root, requested, env);
    if (commit === undefined) throw new CliError(`unknown base "${requested}"`);
    return { ref: requested, commit };
  }
  const branch = await git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], env);
  const tracked =
    branch === undefined
      ? undefined
      : await git(root, ["config", "--get", `branch.${branch}.merge`], env);
  const remote =
    (branch === undefined
      ? undefined
      : await git(root, ["config", "--get", `branch.${branch}.remote`], env)) || "origin";
  const upstream = await revParse(root, "@{upstream}", env);
  if (upstream !== undefined && tracked !== `refs/heads/${branch}`) {
    const mergeBase = await git(root, ["merge-base", "HEAD", upstream], env);
    if (mergeBase !== undefined && /^[0-9a-f]{40}$/.test(mergeBase))
      return { ref: "@{upstream}", commit: mergeBase };
  }
  const remoteHead = await git(root, ["rev-parse", "--abbrev-ref", `${remote}/HEAD`], env);
  const candidates = [
    ...(remoteHead !== undefined && remoteHead !== `${remote}/HEAD` ? [remoteHead] : []),
    `${remote}/main`,
    `${remote}/master`,
    "main",
    "master",
  ];
  for (const ref of candidates) {
    const full = ref.startsWith(`${remote}/`) ? `refs/remotes/${ref}` : `refs/heads/${ref}`;
    // The branch's own remote copy again, under a default-branch name.
    if (full === `refs/remotes/${remote}/${branch}`) continue;
    const commit = await revParse(root, full, env);
    if (commit !== undefined) return { ref, commit };
  }
  throw new CliError(
    "cannot find a base: no upstream and neither main nor master; pass one, e.g. `cogit pr main`",
  );
}

/** The commits of `base..HEAD`, oldest first — the order a reviewer reads them. */
async function readPrCommits(
  root: string,
  base: string,
  head: string,
  env: NodeJS.ProcessEnv,
): Promise<Omit<PrCommit, "files" | "thought">[]> {
  const stdout = await git(
    root,
    ["log", "--reverse", "--format=%H%x00%h%x00%cI%x00%ae%x00%s", `${base}..${head}`],
    env,
  );
  return parsePrCommits(stdout ?? "");
}

/**
 * Walks up the thread from a thought and keeps the messages that decided
 * something. It stops at a message that landed an earlier commit (its reasons
 * belong to that commit), at one that is a thought of this description itself,
 * and before the thread's root, whose reason is the session's goal.
 */
function ledHereOf(
  id: string,
  entry: EffectiveSession,
  thoughts: ReadonlyMap<string, PrThought>,
): PrLedHere[] {
  const byId = new Map(entry.messages.map((message) => [message.id, message]));
  const found: PrLedHere[] = [];
  let parent = byId.get(id)?.parent;
  for (let step = 0; step < LED_HERE_DEPTH && parent != null; step++) {
    const message = byId.get(parent);
    if (message === undefined || thoughts.has(message.id) || message.parent == null) break;
    if ((message.commits ?? []).length > 0) break;
    const why = message.why?.trim() ?? "";
    const alternatives = message.alternatives ?? [];
    const decided = message.decidedBy === "user" || message.decidedBy === "agreed";
    if (why !== "" || alternatives.length > 0 || decided)
      found.unshift({
        id: message.id,
        shortId: shortHash(message.id),
        label: message.label ?? message.id,
        title: message.title,
        ...(why === "" ? {} : { why }),
        alternatives,
      });
    parent = message.parent;
  }
  return found;
}

function latestMessageAt(session: Session): string | undefined {
  let latest: string | undefined;
  for (const node of session.nodes) {
    if (node.at === undefined || Number.isNaN(Date.parse(node.at))) continue;
    if (latest === undefined || Date.parse(node.at) > Date.parse(latest)) latest = node.at;
  }
  return latest;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function titleOf(sessionId: string, title: string): string {
  return title.trim() === "" ? sessionId : oneLine(title);
}

function labelIndex(label: string): number | undefined {
  const match = /^m([1-9][0-9]*)$/.exec(label);
  return match === null ? undefined : Number(match[1]);
}

export interface BuildPrInput {
  base: PrBase;
  head: string;
  commits: readonly PrCommit[];
  sessions: readonly EffectiveSession[];
  policy: "share" | "ignore";
  /** The local git user's email; a commit by anyone else is someone else's. */
  userEmail?: string;
}

/**
 * Groups the branch's commits by the thought their trailer names, in commit
 * order (Story 10.1). A commit without a trailer, or whose thought the record
 * does not hold yet, goes to `unlinked` with the trailer value for the reader.
 */
export function buildPrModel(input: BuildPrInput): PrModel {
  const index = new Map<string, { entry: EffectiveSession; message: ViewNode }>();
  for (const entry of input.sessions)
    for (const message of entry.messages)
      if (!index.has(message.id)) index.set(message.id, { entry, message });

  const thoughts = new Map<string, PrThought>();
  const unlinked: PrUnlinkedCommit[] = [];
  const sessionOrder: string[] = [];
  const entries = new Map<string, EffectiveSession>();
  const labels = new Map<string, number[]>();
  const thoughtCounts = new Map<string, number>();
  const commitCounts = new Map<string, number>();

  for (const commit of input.commits) {
    const ids = commit.thoughts ?? [];
    const known = ids.filter((id) => index.has(id));
    if (known.length === 0) {
      const named = ids[0];
      const others =
        commit.authorEmail !== undefined &&
        input.userEmail !== undefined &&
        commit.authorEmail.toLowerCase() !== input.userEmail.toLowerCase();
      unlinked.push({
        full: commit.full,
        short: commit.short,
        subject: commit.subject,
        ...(named === undefined ? {} : { thought: named }),
        ...(named !== undefined && others ? { others: true } : {}),
      });
      continue;
    }
    // A squash names several messages, but it is still one commit in each session.
    const counted = new Set<string>();
    for (const id of known) {
      const hit = index.get(id) as { entry: EffectiveSession; message: ViewNode };
      const { session } = hit.entry;
      let thought = thoughts.get(id);
      if (thought === undefined) {
        const message = hit.message;
        thought = {
          id,
          shortId: shortHash(id),
          label: message.label ?? id,
          sessionId: session.sessionId,
          shortSessionId: session.sessionId.slice(0, 8),
          sessionTitle: titleOf(session.sessionId, session.title),
          title: message.title,
          ...(message.summary === undefined ? {} : { summary: message.summary }),
          ...(message.why === undefined ? {} : { why: message.why }),
          ...(message.decidedBy === undefined ? {} : { decidedBy: message.decidedBy }),
          alternatives: message.alternatives ?? [],
          agentDecisions: (message.agentDecisions ?? []).map((decision) => ({
            title: decision.title,
            why: decision.why,
            alternatives: decision.alternatives ?? [],
          })),
          ledHere: [],
          ...(message.shape?.tools.length ? { shape: message.shape.tools } : {}),
          commits: [],
        };
        thoughts.set(id, thought);
        if (!entries.has(session.sessionId)) {
          sessionOrder.push(session.sessionId);
          entries.set(session.sessionId, hit.entry);
          labels.set(session.sessionId, []);
          thoughtCounts.set(session.sessionId, 0);
          commitCounts.set(session.sessionId, 0);
        }
        thoughtCounts.set(session.sessionId, (thoughtCounts.get(session.sessionId) ?? 0) + 1);
      }
      thought.commits.push(commit);
      labels.get(session.sessionId)?.push(labelIndex(thought.label) ?? 0);
      if (!counted.has(session.sessionId)) {
        counted.add(session.sessionId);
        commitCounts.set(session.sessionId, (commitCounts.get(session.sessionId) ?? 0) + 1);
      }
    }
  }

  const goals: PrGoal[] = [];
  const seenGoals = new Set<string>();
  const sessions: PrSessionLine[] = [];
  for (const sessionId of sessionOrder) {
    const entry = entries.get(sessionId);
    if (entry === undefined) continue;
    const session = entry.session;
    const title = titleOf(sessionId, session.title);
    const goal = oneLine(session.status.goal);
    if (goal !== "" && !seenGoals.has(goal)) {
      seenGoals.add(goal);
      goals.push({ text: goal, sessionId, sessionTitle: title });
    }
    const numbers = labels.get(sessionId) ?? [];
    sessions.push({
      sessionId,
      shortId: sessionId.slice(0, 8),
      title,
      // The record can be written minutes after the talk; the messages date it.
      startedAt: earliestSessionStart([session]) ?? session.startedAt,
      updatedAt: latestMessageAt(session) ?? session.updatedAt,
      from: numbers.length === 0 ? "—" : `m${Math.min(...numbers)}`,
      to: numbers.length === 0 ? "—" : `m${Math.max(...numbers)}`,
      thoughtCount: thoughtCounts.get(sessionId) ?? 0,
      commitCount: commitCounts.get(sessionId) ?? 0,
    });
  }

  for (const thought of thoughts.values()) {
    const entry = entries.get(thought.sessionId);
    // A thought that weighed options itself already says why; the walk is for a
    // plain "commit it" whose reason sits further up.
    if (entry !== undefined && thought.alternatives.length === 0)
      thought.ledHere = ledHereOf(thought.id, entry, thoughts);
  }

  return {
    base: input.base,
    head: input.head,
    policy: input.policy,
    goals,
    sessions,
    thoughts: [...thoughts.values()],
    unlinked,
  };
}

/** What the size cap may leave out, in the order it does. */
export type PrDroppable = "files" | "summaries" | "shapes";

export interface PrFormatOptions {
  includeFiles: boolean;
  includeSummaries: boolean;
  includeShapes: boolean;
  /** What the size cap dropped, said at the end of the description. */
  dropped?: PrDroppable[];
}

function alternativeLine(alt: { option: string; why: string }, indent = ""): string {
  const why = alt.why.trim() === "" ? "" : ` — ${oneLine(alt.why)}`;
  return `${indent}- considered and rejected: ${oneLine(alt.option)}${why}`;
}

function decisionLines(thought: PrThought): string[] {
  const lines: string[] = [];
  if (thought.why !== undefined && thought.why.trim() !== "")
    lines.push(`- Why: ${oneLine(thought.why)}`);
  if (thought.decidedBy !== undefined) lines.push(`- Decided by: ${thought.decidedBy}`);
  for (const alt of thought.alternatives) lines.push(alternativeLine(alt));
  for (const decision of thought.agentDecisions) {
    const why = decision.why.trim() === "" ? "" : ` — ${oneLine(decision.why)}`;
    lines.push(`- agent decision: ${oneLine(decision.title)}${why}`);
    for (const alt of decision.alternatives) lines.push(alternativeLine(alt, "  "));
  }
  return lines;
}

/** The Markdown body of the PR, in the order Story 10.1 fixes. */
export function formatPr(model: PrModel, opts: PrFormatOptions): string {
  const lines: string[] = ["## Goal"];
  if (model.goals.length === 0) {
    lines.push("_No session goal was recorded._");
  } else {
    for (const goal of model.goals)
      lines.push(`- ${oneLine(goal.text)} — ${goal.sessionTitle} (${goal.sessionId.slice(0, 8)})`);
  }

  lines.push("", "## Sessions");
  if (model.sessions.length === 0) {
    lines.push("_No recorded session is behind these commits._");
  } else {
    lines.push("Open a whole session with `cogit log --session <id>` or the map.");
    for (const session of model.sessions) {
      const range = session.from === session.to ? session.from : `${session.from}–${session.to}`;
      lines.push(
        `- ${session.title} (${session.shortId}) · ${range} · ` +
          `${stamp(session.startedAt)} → ${stamp(session.updatedAt)}`,
      );
    }
  }

  lines.push("", "## Thoughts");
  if (model.thoughts.length === 0) {
    lines.push("_No recorded thought is behind these commits._");
  } else {
    for (const thought of model.thoughts) {
      lines.push(
        "",
        `### \`${thought.shortId}\` ${thought.shortSessionId}:${thought.label} — ` +
          `${oneLine(thought.title)}`,
      );
      if (opts.includeSummaries && thought.summary !== undefined && thought.summary.trim() !== "")
        lines.push("", oneLine(thought.summary));
      const decisions = decisionLines(thought);
      if (decisions.length > 0) lines.push("", ...decisions);
      if (thought.ledHere.length > 0) {
        lines.push("", "Led here:");
        for (const step of thought.ledHere) {
          const why = step.why === undefined ? "" : ` — ${oneLine(step.why)}`;
          lines.push(`- ${step.label} ${oneLine(step.title)}${why}`);
          for (const alt of step.alternatives) lines.push(alternativeLine(alt, "  "));
        }
      }
      const shape = opts.includeShapes ? shapeMarkdown(thought.shape ?? []) : [];
      if (shape.length > 0) lines.push("", "Shape:", "", ...shape);
      lines.push("", "Commits:");
      for (const commit of thought.commits) {
        lines.push(`- \`${commit.short}\` ${oneLine(commit.subject)}`);
        if (opts.includeFiles) for (const file of commit.files) lines.push(`  - \`${file}\``);
      }
    }
  }

  lines.push("", "## Commits without a recorded thought");
  if (model.unlinked.length === 0) {
    lines.push("_None: every commit carries a recorded thought._");
  } else {
    for (const commit of model.unlinked) {
      const thought =
        commit.thought === undefined
          ? ""
          : commit.others === true
            ? ` — thought \`${commit.thought}\` is not in this clone's record: its author has ` +
              "not pushed it yet, or it came from a fork, whose record stays in the fork"
            : ` — thought \`${commit.thought}\` not recorded yet`;
      lines.push(`- \`${commit.short}\` ${oneLine(commit.subject)}${thought}`);
    }
  }

  lines.push("", "## Dig deeper");
  lines.push(
    "- `cogit show <message-hash>` opens a thought: its decisions, the options it rejected, " +
      "and the conversation turn for whoever has it locally.",
    "- `cogit show <sha>` opens the thought behind a commit.",
    model.policy === "ignore"
      ? "- This project keeps its record out of git, so these hashes resolve only on the " +
          "author's machine; ask the author to run `cogit show`."
      : "- This project shares its record, so a reviewer with cogit in their clone gets the " +
          "same `cogit show` output once the author has pushed.",
  );

  const dropped = opts.dropped ?? [];
  if (dropped.length > 0) {
    const names = dropped.map((item) =>
      item === "files" ? "file lists" : item === "shapes" ? "Shape diagrams" : "summaries",
    );
    const text =
      names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
    lines.push("", `_Left out to stay under the size cap: ${text}._`);
  }
  return lines.join("\n");
}

export interface PrRendered {
  text: string;
  dropped: PrDroppable[];
  truncated: boolean;
}

/**
 * Fits the description under the cap by dropping the file lists first, then the
 * summaries (Story 10.1), then the Shape diagrams, and says what was left out. A description still over
 * the cap after both is cut, so GitHub never refuses the body.
 */
export function renderPr(model: PrModel, cap = PR_CHAR_CAP): PrRendered {
  const levels: (PrFormatOptions & { dropped: PrDroppable[] })[] = [
    { includeFiles: true, includeSummaries: true, includeShapes: true, dropped: [] },
    { includeFiles: false, includeSummaries: true, includeShapes: true, dropped: ["files"] },
    {
      includeFiles: false,
      includeSummaries: false,
      includeShapes: true,
      dropped: ["files", "summaries"],
    },
    {
      includeFiles: false,
      includeSummaries: false,
      includeShapes: false,
      dropped: ["files", "summaries", "shapes"],
    },
  ];
  for (const level of levels) {
    const text = formatPr(model, level);
    if (text.length <= cap) return { text, dropped: level.dropped, truncated: false };
  }
  const full = formatPr(model, levels[3] as (typeof levels)[number]);
  const note =
    "\n\n_Truncated to fit the size cap; file lists, summaries and Shape diagrams were left out. " +
    "Open a thought with `cogit show` for the rest._";
  if (note.length >= cap)
    return { text: note.slice(0, cap), dropped: ["files", "summaries", "shapes"], truncated: true };
  return {
    text: full.slice(0, cap - note.length) + note,
    dropped: ["files", "summaries", "shapes"],
    truncated: true,
  };
}

const CLIPBOARD_TOOLS: [string, string[]][] = [
  ["wl-copy", []],
  ["xclip", ["-selection", "clipboard"]],
  ["pbcopy", []],
  ["clip", []],
];

/** Pipes text into a process, resolving false when it is missing or fails. */
function pipe(
  command: string,
  args: string[],
  text: string,
  env: NodeJS.ProcessEnv,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const child = spawn(command, args, { env, stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", () => done(false));
    child.on("close", (code) => done(code === 0));
    child.stdin.on("error", () => done(false));
    child.stdin.end(text);
  });
}

/** Copies with the first clipboard tool that exists; false when there is none. */
export async function copyToClipboard(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  for (const [command, args] of CLIPBOARD_TOOLS) {
    if (await pipe(command, args, text, env)) return true;
  }
  return false;
}

export interface PrOptions {
  dir: string;
  /** Base ref; default: the upstream's merge base, else main, else master. */
  base?: string | undefined;
  io: Io;
  json?: boolean;
  copy?: boolean;
  /** Size cap for tests; defaults to `PR_CHAR_CAP`. */
  cap?: number;
}

/**
 * The pull request of `head` against `base` from the given record: the commits
 * between them, their trailers and files, and the thoughts behind them. Shared
 * by `cogit pr` and the map's Pull request view, so the two never disagree.
 */
async function collectPr(
  root: string,
  gitRoot: string,
  base: PrBase,
  head: string,
  sessions: EffectiveSession[],
  env: NodeJS.ProcessEnv,
): Promise<PrModel> {
  const commits = await readPrCommits(gitRoot, base.commit, head, env);
  const userEmail = await gitUserEmail(gitRoot, env);
  const trailers =
    commits.length === 0
      ? new Map<string, string[]>()
      : await readThoughtTrailers(gitRoot, {
          env,
          since: earliestSessionStart(sessions.map((entry) => entry.session)),
        });
  const files =
    commits.length === 0
      ? new Map<string, string[]>()
      : await readCommitFiles(
          gitRoot,
          commits.map((commit) => commit.full),
        );

  return buildPrModel({
    base,
    head,
    policy: (await cogitIgnored(root)) ? "ignore" : "share",
    ...(userEmail === undefined ? {} : { userEmail }),
    sessions,
    commits: commits.map((commit) => {
      const thoughts = trailers.get(commit.full);
      return {
        ...commit,
        files: files.get(commit.full) ?? [],
        ...(thoughts === undefined ? {} : { thoughts }),
      };
    }),
  });
}

/**
 * The map's Pull request view: the checked-out branch against where it will
 * merge, built from the record the map already loaded. Undefined outside git,
 * before the first commit, or when no merge target can be found.
 */
export async function branchPullRequest(
  root: string,
  sessions: readonly Session[],
  env: NodeJS.ProcessEnv,
): Promise<ViewPullRequest | undefined> {
  // The map is built on every recording; a git or a record that fails here
  // leaves the view out and never fails the map.
  try {
    const gitRoot = await findGitRoot(root);
    if (gitRoot === undefined) return undefined;
    const head = await revParse(gitRoot, "HEAD", env);
    if (head === undefined) return undefined;
    const base = await resolvePrBase(gitRoot, undefined, env).catch(() => undefined);
    if (base === undefined) return undefined;
    const branch = await git(gitRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"], env);
    const effective = sessions.map((session) => ({
      session,
      messages: buildMessages(session.nodes),
      turns: null,
    }));
    const model = await collectPr(root, gitRoot, base, head, effective, env);
    return {
      ...(branch === undefined ? {} : { branch }),
      base: base.ref,
      model,
      markdown: renderPr(model).text,
    };
  } catch {
    return undefined;
  }
}

/** `cogit pr [base]`: reads the record and the branch, prints the description. */
export async function pr(opts: PrOptions): Promise<PrModel> {
  const root = await openProject(opts.dir);
  const gitRoot = await findGitRoot(root);
  if (gitRoot === undefined) throw new CliError("not in a git repository");
  const env = opts.io.env;

  const head = await revParse(gitRoot, "HEAD", env);
  if (head === undefined) throw new CliError("HEAD has no commits yet");
  const base = await resolvePrBase(gitRoot, opts.base, env);
  const sessions = await loadEffectiveSessions(root, opts.io);
  const model = await collectPr(root, gitRoot, base, head, sessions, env);

  const rendered = renderPr(model, opts.cap ?? PR_CHAR_CAP);
  if (opts.copy === true && !(await copyToClipboard(rendered.text, env))) {
    opts.io.warn(
      "could not copy: no clipboard tool found (wl-copy, xclip, pbcopy or clip); the Markdown is on stdout",
    );
  }
  if (opts.json === true) {
    opts.io.out(
      JSON.stringify(
        {
          ...model,
          rendered: { dropped: rendered.dropped, truncated: rendered.truncated },
        },
        null,
        2,
      ),
    );
    return model;
  }
  for (const line of rendered.text.split("\n")) opts.io.out(line);
  return model;
}
