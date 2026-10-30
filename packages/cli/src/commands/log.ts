import { findGitRoot, projectFiles, readCommitFiles, readCommitSubjects } from "../git.js";
import { CliError, type Io } from "../io.js";
import { readSessionMessages, type SessionMessage, upgradeSessionIds } from "../messages.js";
import type { LineageNode, Session } from "../schema/session.js";
import { readProjectChanges } from "../store/changes.js";
import { applyEvents, readEvents } from "../store/events.js";
import { readReadState } from "../store/read-state.js";
import { resolveProjectRoot } from "../store/root.js";
import { loadAllSessions, loadProject } from "../store/stores.js";
import {
  attachThoughtTrailers,
  earliestSessionStart,
  readCommitThought,
  readThoughtTrailers,
} from "../thought.js";
import { formatChange, messageChange, type UnreadMessage, unreadMessages } from "../view/change.js";
import { buildFileHistory, type FileSourceSession } from "../view/files.js";
import { buildMessages } from "../view/lineage.js";
import type { ViewFile, ViewNode } from "../view/model.js";

/**
 * `cogit log` and `cogit show` (Story 8.10): the CLI's read verbs,
 * modelled on `git log` and `git show`. The agent is the main reader, so the
 * output is plain text by default and JSON on request; neither command writes.
 *
 * A message is addressed by its stable id (`h` plus 12 hex) or any unique prefix
 * of at least six hex characters after the `h`, or by `<sessionId-prefix>:mN`.
 */

/** One session as the map sees it: stable ids, replayed structure, message order. */
export interface EffectiveSession {
  session: Session;
  /** buildMessages output: labels, parents and links already normalised. */
  messages: ViewNode[];
  /**
   * The user messages with their stable ids and conversation text, or null when
   * neither the transcript nor the conversation store is readable. Search reads
   * this (Story 8.14); the read verbs do not need it.
   */
  turns: SessionMessage[] | null;
}

/** Every valid session of the project, with the ids and structure the map draws. */
export async function loadEffectiveSessions(root: string, io: Io): Promise<EffectiveSession[]> {
  const sessions = await loadAllSessions(root, io.warn);
  // The `Thought:` trailers git already holds (Story 9.4): a commit whose message
  // names a message belongs to it even when the agent's record left it out.
  const trailers = await readThoughtTrailers(root, {
    env: io.env,
    since: earliestSessionStart(sessions),
  });
  const loaded: EffectiveSession[] = [];
  for (const session of sessions) {
    // The transcript (or the conversation store) names old `m1` nodes and holds
    // the hash of each message; a session without either keeps its stored ids.
    const turns = await readSessionMessages(root, session.sessionId, io.env);
    const upgraded = turns ? upgradeSessionIds(session, turns) : session;
    const events = await readEvents(root, session.sessionId);
    const effective: Session = { ...upgraded, nodes: applyEvents(upgraded.nodes, events) };
    loaded.push({ session: effective, messages: buildMessages(effective.nodes), turns });
  }
  const withThoughts = attachThoughtTrailers(
    loaded.map((entry) => entry.session),
    trailers,
  );
  const out = loaded.map((entry, index) => {
    const session = withThoughts[index] as Session;
    return session === entry.session
      ? entry
      : { ...entry, session, messages: buildMessages(session.nodes) };
  });
  return out.sort(
    (a, b) =>
      a.session.startedAt.localeCompare(b.session.startedAt) ||
      a.session.sessionId.localeCompare(b.session.sessionId),
  );
}

/** Loads the project record, refusing an uninitialized or broken project. */
export async function openProject(dir: string): Promise<string> {
  const { root } = await resolveProjectRoot(dir);
  const project = await loadProject(root);
  if (!project.found) throw new CliError(`${root} is not initialized; run \`cogit init\` first`);
  if (!project.ok) throw new CliError(project.error);
  return root;
}

const pad = (value: number): string => String(value).padStart(2, "0");

/** `2026-10-24 10:44` in local time; an absent or broken time prints `—`. */
export function stamp(iso: string | undefined): string {
  if (iso === undefined) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** `10:44` in local time. */
function clock(iso: string | undefined): string {
  if (iso === undefined) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `h3f2a1b8` for a stable message id; anything else is already short enough. */
export function shortHash(id: string): string {
  return /^h[0-9a-f]{12}$/.test(id) ? id.slice(0, 8) : id;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** A branch summary with the message range it covers. */
export interface LogBranch {
  sessionId: string;
  title: string;
  asked: string;
  outcome: string;
  open: string;
  start: { id: string; label: string };
  end: { id: string; label: string };
  /** Messages in the branch, including the one that starts it. */
  count: number;
}

/** One message line in `log` (and the JSON shape). */
export interface LogMessage {
  id: string;
  label: string;
  at?: string;
  title: string;
  summary?: string;
  parent: string | null;
  /** The label of the parent when it lives in this session. */
  parentLabel?: string;
  links: string[];
  linkLabels: string[];
  /** Set on the message that starts a branch. */
  branch?: LineageNode["branch"];
  commits: string[];
}

export interface LogSession {
  sessionId: string;
  title: string;
  /** Who recorded the session (Story 9.3); absent on older records. */
  author?: string;
  startedAt: string;
  updatedAt: string;
  /** Newest first. */
  messages: LogMessage[];
  branches: LogBranch[];
}

export interface LogModel {
  sessions: LogSession[];
}

/**
 * The branch summaries of a session, in send order. A branch runs from the
 * message that carries it up to the message before the next branch starts (or
 * the end of the session), so the compressed view covers every message once a
 * summary exists.
 */
export function branchesOf(sessionId: string, messages: readonly ViewNode[]): LogBranch[] {
  const starts = messages.flatMap((message, index) =>
    message.branch === undefined ? [] : [{ index, branch: message.branch }],
  );
  return starts.map(({ index, branch }, position) => {
    const end = (starts[position + 1]?.index ?? messages.length) - 1;
    const first = messages[index] as ViewNode;
    const last = messages[end] as ViewNode;
    return {
      sessionId,
      title: branch.title,
      asked: branch.asked,
      outcome: branch.outcome,
      open: branch.open,
      start: { id: first.id, label: first.label ?? first.id },
      end: { id: last.id, label: last.label ?? last.id },
      count: end - index + 1,
    };
  });
}

function toLogSession(effective: EffectiveSession): LogSession {
  const { session, messages } = effective;
  const labels = new Map(messages.map((message) => [message.id, message.label ?? message.id]));
  const logMessages: LogMessage[] = [...messages].reverse().map((message) => {
    const parentLabel = typeof message.parent === "string" ? labels.get(message.parent) : undefined;
    return {
      id: message.id,
      label: message.label ?? message.id,
      ...(message.at === undefined ? {} : { at: message.at }),
      title: message.title,
      ...(message.summary === undefined ? {} : { summary: message.summary }),
      parent: message.parent ?? null,
      ...(parentLabel === undefined ? {} : { parentLabel }),
      links: message.links ?? [],
      linkLabels: (message.links ?? []).map((link) => labels.get(link) ?? link),
      ...(message.branch === undefined ? {} : { branch: message.branch }),
      commits: message.commits ?? [],
    };
  });
  return {
    sessionId: session.sessionId,
    title: session.title,
    ...(session.author === undefined ? {} : { author: session.author }),
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    messages: logMessages,
    branches: branchesOf(session.sessionId, messages),
  };
}

export interface LogOptions {
  /** Only messages recorded here; a session id or any prefix of one. */
  session?: string | undefined;
  /** Maximum messages (or branches with `branchesOnly`). */
  limit?: number | undefined;
  /** Only the branch summaries: the compressed view. */
  branchesOnly?: boolean;
}

/**
 * The sessions a `--session` selector names: an exact id wins, otherwise an
 * unambiguous prefix. An unknown or ambiguous selector is a user error.
 */
export function selectSessions(
  sessions: readonly EffectiveSession[],
  prefix: string,
): EffectiveSession[] {
  const exact = sessions.filter((entry) => entry.session.sessionId === prefix);
  const matches =
    exact.length > 0
      ? exact
      : sessions.filter((entry) => entry.session.sessionId.startsWith(prefix));
  if (matches.length === 0) throw new CliError(`no session matches ${prefix}`);
  if (matches.length > 1) {
    const ids = matches.map((entry) => entry.session.sessionId).join(", ");
    throw new CliError(`"${prefix}" matches ${matches.length} sessions: ${ids}`);
  }
  return matches;
}

/**
 * The log model: sessions newest first, their messages newest first. `--session`
 * takes an exact id or an unambiguous prefix.
 */
export function buildLog(sessions: EffectiveSession[], opts: LogOptions = {}): LogModel {
  const selected = opts.session === undefined ? sessions : selectSessions(sessions, opts.session);

  const ordered = [...selected].sort(
    (a, b) =>
      b.session.startedAt.localeCompare(a.session.startedAt) ||
      a.session.sessionId.localeCompare(b.session.sessionId),
  );
  const model: LogModel = { sessions: ordered.map(toLogSession) };

  if (opts.limit !== undefined && opts.limit > 0) {
    let left = opts.limit;
    model.sessions = model.sessions.flatMap((session) => {
      if (left === 0) return [];
      if (opts.branchesOnly === true) {
        const branches = session.branches.slice(0, left);
        left -= branches.length;
        return branches.length === 0 ? [] : [{ ...session, messages: [], branches }];
      }
      const messages = session.messages.slice(0, left);
      left -= messages.length;
      return messages.length === 0 ? [] : [{ ...session, messages }];
    });
  }
  if (opts.branchesOnly === true) {
    model.sessions = model.sessions.map((session) => ({ ...session, messages: [] }));
  }
  return model;
}

function sessionHeading(session: LogSession): string {
  const title = session.title.trim() === "" ? session.sessionId : oneLine(session.title);
  const author = session.author === undefined ? "" : ` · by ${session.author}`;
  return (
    `## ${title} (${session.sessionId})${author} · ` +
    `${stamp(session.startedAt)} → ${stamp(session.updatedAt)}`
  );
}

function branchLines(branch: LogBranch): string[] {
  const count = `${branch.count} message${branch.count === 1 ? "" : "s"}`;
  return [
    `  ╭ ${branch.title}  ${branch.start.label}–${branch.end.label}, ${count}`,
    `    asked: ${branch.asked}`,
    `    outcome: ${branch.outcome}`,
    `    open: ${branch.open === "" ? "—" : branch.open}`,
  ];
}

function messageLine(message: LogMessage): string {
  const parts = [
    `  ${shortHash(message.id)}  ${message.label}  ${clock(message.at)}  ` +
      `${message.branch === undefined ? "" : `╭ ${message.branch.title} · `}${oneLine(message.title)}`,
  ];
  if (message.linkLabels.length > 0) parts.push(`  ↩ ${message.linkLabels.join(", ")}`);
  if (message.commits.length > 0)
    parts.push(`  [${message.commits.map((hash) => hash.slice(0, 7)).join(" ")}]`);
  return parts.join("");
}

/** The plain-text `log`, one line per array entry, newest first. */
export function formatLog(model: LogModel, branchesOnly = false): string[] {
  if (model.sessions.length === 0) return ["No recorded sessions yet."];
  const lines: string[] = [];
  for (const session of model.sessions) {
    lines.push(sessionHeading(session));
    if (branchesOnly) {
      if (session.branches.length === 0) lines.push("  (no branch summaries)");
      for (const branch of session.branches) lines.push(...branchLines(branch));
    } else if (session.messages.length === 0) {
      lines.push("  (no recorded messages)");
    } else {
      for (const message of session.messages) lines.push(messageLine(message));
    }
    lines.push("");
  }
  lines.pop();
  return lines;
}

/** A message reference as `show` prints and serializes it. */
export interface ShowRef {
  sessionId: string;
  id: string;
  label?: string;
  title?: string;
}

export interface RefHit {
  session: Session;
  messages: ViewNode[];
  message: ViewNode;
}

export type RefResult =
  | { kind: "ok"; hit: RefHit }
  | { kind: "ambiguous"; candidates: ShowRef[] }
  | { kind: "unknown"; reason: string }
  | { kind: "invalid"; reason: string };

const HASH_REF = /^h[0-9a-f]{6,12}$/;
const SESSION_LABEL_REF = /^([A-Za-z0-9][A-Za-z0-9_.-]{0,127}):m([1-9][0-9]*)$/;
/** A raw git commit hash: 7–40 lowercase hex, no `h` prefix (`h…` is a message). */
const COMMIT_REF = /^[0-9a-f]{7,40}$/;

/** A record may hold seven characters of a hash and git forty; either direction matches. */
function sameCommit(recorded: string, commit: string): boolean {
  return commit.startsWith(recorded) || recorded.startsWith(commit);
}

/**
 * Resolves a `<ref>` against every session. Errors stay data, so the command can
 * print the candidates before it exits non-zero.
 */
export function resolveRef(sessions: readonly EffectiveSession[], ref: string): RefResult {
  if (HASH_REF.test(ref)) {
    const hits = sessions.flatMap((entry) =>
      entry.messages
        .filter((message) => message.id.startsWith(ref))
        .map((message) => ({ entry, message })),
    );
    if (hits.length === 0) return { kind: "unknown", reason: `no recorded message matches ${ref}` };
    if (hits.length > 1) {
      return {
        kind: "ambiguous",
        candidates: hits.map(({ entry, message }) => ({
          sessionId: entry.session.sessionId,
          id: message.id,
          label: message.label ?? message.id,
          title: message.title,
        })),
      };
    }
    const hit = hits[0] as { entry: EffectiveSession; message: ViewNode };
    return {
      kind: "ok",
      hit: { session: hit.entry.session, messages: hit.entry.messages, message: hit.message },
    };
  }

  // A commit the `Thought:` trailer (Story 9.4) attached to a message opens that
  // message: `cogit show <commit-sha>` is the way from code back to the why.
  if (COMMIT_REF.test(ref)) {
    const hits = sessions.flatMap((entry) =>
      entry.messages
        .filter((message) => (message.commits ?? []).some((hash) => sameCommit(hash, ref)))
        .map((message) => ({ entry, message })),
    );
    if (hits.length === 0)
      return { kind: "unknown", reason: `no recorded thought for commit ${ref}` };
    if (hits.length > 1) {
      return {
        kind: "ambiguous",
        candidates: hits.map(({ entry, message }) => ({
          sessionId: entry.session.sessionId,
          id: message.id,
          label: message.label ?? message.id,
          title: message.title,
        })),
      };
    }
    const hit = hits[0] as { entry: EffectiveSession; message: ViewNode };
    return {
      kind: "ok",
      hit: { session: hit.entry.session, messages: hit.entry.messages, message: hit.message },
    };
  }

  const sessionLabel = SESSION_LABEL_REF.exec(ref);
  if (sessionLabel === null)
    return {
      kind: "invalid",
      reason:
        "use a message hash (h + 6..12 hex), <session-id-prefix>:mN, or a commit hash (7..40 hex)",
    };

  const prefix = sessionLabel[1] as string;
  const label = `m${sessionLabel[2] as string}`;
  const exact = sessions.filter((entry) => entry.session.sessionId === prefix);
  const matches =
    exact.length > 0
      ? exact
      : sessions.filter((entry) => entry.session.sessionId.startsWith(prefix));
  if (matches.length === 0) return { kind: "unknown", reason: `no session matches ${prefix}` };
  if (matches.length > 1) {
    return {
      kind: "ambiguous",
      candidates: matches.map((entry) => ({
        sessionId: entry.session.sessionId,
        id: entry.session.sessionId,
        label: entry.session.sessionId,
        title: entry.session.title,
      })),
    };
  }
  const entry = matches[0] as EffectiveSession;
  const message = entry.messages.find((candidate) => candidate.label === label);
  if (message === undefined)
    return {
      kind: "unknown",
      reason: `session ${entry.session.sessionId} has no recorded message ${label}`,
    };
  return { kind: "ok", hit: { session: entry.session, messages: entry.messages, message } };
}

/** One message with everything `show` prints, ready for text or JSON. */
export interface ShowModel {
  id: string;
  label: string;
  title: string;
  summary?: string;
  sessionId: string;
  sessionTitle: string;
  at?: string;
  parent: ShowRef | null;
  children: ShowRef[];
  links: ShowRef[];
  branch: LogBranch | null;
  decidedBy?: "user" | "agent" | "agreed";
  why?: string;
  alternatives?: LineageNode["alternatives"];
  agentDecisions?: LineageNode["agentDecisions"];
  work?: string[];
  commits: { hash: string; subject?: string }[];
  files?: string[];
  /** Null when the transcript is gone; absent when `--no-chat` skipped it. */
  chat?: {
    text: string;
    replies: string[];
    tools: { commands: number; files: string[]; other: number };
  } | null;
}

function refOf(sessions: readonly EffectiveSession[], ref: string, self: string): ShowRef {
  const colon = ref.indexOf(":");
  const sessionId = colon === -1 ? self : ref.slice(0, colon);
  const id = colon === -1 ? ref : ref.slice(colon + 1);
  const entry = sessions.find((candidate) => candidate.session.sessionId === sessionId);
  const message = entry?.messages.find((candidate) => candidate.id === id);
  return {
    sessionId,
    id,
    ...(message?.label === undefined ? {} : { label: message.label }),
    ...(message?.title === undefined ? {} : { title: message.title }),
  };
}

/** The branch a message sits in: the last branch that started at or before it. */
function branchAround(
  sessionId: string,
  messages: readonly ViewNode[],
  id: string,
): LogBranch | null {
  let start: ViewNode | null = null;
  for (const message of messages) {
    if (message.branch !== undefined) start = message;
    if (message.id === id) break;
  }
  if (start === null) return null;
  const branches = branchesOf(sessionId, messages);
  return branches.find((branch) => branch.start.id === start?.id) ?? null;
}

function conversationTurn(
  messages: SessionMessage[] | null,
  message: ViewNode,
): NonNullable<ShowModel["chat"]> | null {
  const turn = messages?.find(
    (candidate) => candidate.hash === message.id || candidate.label === message.label,
  );
  if (turn === undefined) return null;
  return { text: turn.text, replies: turn.replies, tools: turn.tools };
}

export interface ShowOptions {
  dir: string;
  ref: string;
  io: Io;
  /** False with `--no-chat`: skip the conversation section. */
  chat?: boolean;
}

/**
 * Reads one message: its place in the graph, its notes, its commits and the
 * conversation turn. An ambiguous or unknown ref prints what it can and throws,
 * so the CLI exits non-zero.
 */
export async function show(opts: ShowOptions): Promise<ShowModel> {
  const root = await openProject(opts.dir);
  const sessions = await loadEffectiveSessions(root, opts.io);
  const result = resolveRef(sessions, opts.ref);
  if (result.kind === "invalid") throw new CliError(`invalid ref "${opts.ref}": ${result.reason}`);
  if (result.kind === "unknown") {
    // The commit names a thought the record has not caught up with yet.
    const thought = COMMIT_REF.test(opts.ref)
      ? await readCommitThought(root, opts.ref, opts.io.env)
      : undefined;
    if (thought !== undefined)
      throw new CliError(
        `commit ${opts.ref} comes from thought ${thought}, which is not recorded yet; it appears after the next record update`,
      );
    throw new CliError(result.reason);
  }
  if (result.kind === "ambiguous") {
    for (const candidate of result.candidates) {
      opts.io.out(
        `  ${candidate.sessionId} · ${candidate.label}${candidate.id === candidate.label ? "" : ` (${candidate.id})`}  ${candidate.title}`,
      );
    }
    throw new CliError(`"${opts.ref}" is ambiguous; use a longer prefix`);
  }

  const { session, messages, message } = result.hit;
  const sessionId = session.sessionId;

  const children: ShowRef[] = [];
  const seen = new Set<string>();
  for (const entry of sessions) {
    for (const candidate of entry.messages) {
      const parent = candidate.parent;
      const child =
        (entry.session.sessionId === sessionId && parent === message.id) ||
        parent === `${sessionId}:${message.id}`;
      if (!child) continue;
      const key = `${entry.session.sessionId}:${candidate.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ref = refOf(sessions, key, entry.session.sessionId);
      children.push(ref);
    }
  }

  const subjects =
    message.commits === undefined || message.commits.length === 0
      ? new Map<string, string>()
      : await readCommitSubjects(root, message.commits);

  const branch = branchAround(sessionId, messages, message.id);
  const turn = opts.chat === false ? null : await readSessionMessages(root, sessionId, opts.io.env);

  return {
    id: message.id,
    label: message.label ?? message.id,
    title: message.title,
    ...(message.summary === undefined ? {} : { summary: message.summary }),
    sessionId,
    sessionTitle: session.title,
    ...(message.at === undefined ? {} : { at: message.at }),
    parent:
      message.parent === null || message.parent === undefined
        ? null
        : refOf(sessions, message.parent, sessionId),
    children,
    links: (message.links ?? []).map((link) => refOf(sessions, link, sessionId)),
    branch: branch === null ? null : { ...branch, sessionId },
    ...(message.decidedBy === undefined ? {} : { decidedBy: message.decidedBy }),
    ...(message.why === undefined ? {} : { why: message.why }),
    ...(message.alternatives === undefined ? {} : { alternatives: message.alternatives }),
    ...(message.agentDecisions === undefined ? {} : { agentDecisions: message.agentDecisions }),
    ...(message.work === undefined ? {} : { work: message.work }),
    commits: (message.commits ?? []).map((hash) => {
      const subject = subjects.get(hash);
      return subject === undefined ? { hash } : { hash, subject };
    }),
    ...(message.files === undefined ? {} : { files: message.files }),
    ...(opts.chat === false ? {} : { chat: conversationTurn(turn, message) }),
  };
}

/** A ref as text: a bare label inside its own session, prefixed across sessions. */
function refText(ref: ShowRef, selfSessionId?: string): string {
  const label = ref.label === undefined ? ref.id : `${ref.label} ${shortHash(ref.id)}`;
  return selfSessionId !== undefined && ref.sessionId === selfSessionId
    ? label
    : `${ref.sessionId}:${label}`;
}

/** The plain-text `show`: the message, its graph neighbours, notes and turn. */
export function formatShow(model: ShowModel): string[] {
  const title = oneLine(model.sessionTitle) || model.sessionId;
  const lines: string[] = [
    `${model.id}  ${model.label}  ${model.title}`,
    `Session: ${title} (${model.sessionId}) · ${stamp(model.at)}`,
  ];
  if (model.parent !== null) lines.push(`Parent: ${refText(model.parent, model.sessionId)}`);
  if (model.children.length > 0)
    lines.push(
      `Children: ${model.children.map((ref) => refText(ref, model.sessionId)).join(", ")}`,
    );
  if (model.links.length > 0)
    lines.push(`Returns to: ${model.links.map((ref) => refText(ref, model.sessionId)).join(", ")}`);
  if (model.branch !== null) {
    const count = `${model.branch.count} message${model.branch.count === 1 ? "" : "s"}`;
    lines.push(
      `Branch: ${model.branch.title} (${model.branch.start.label}–${model.branch.end.label}, ${count})`,
    );
    lines.push(`  asked: ${model.branch.asked}`);
    lines.push(`  outcome: ${model.branch.outcome}`);
    lines.push(`  open: ${model.branch.open === "" ? "—" : model.branch.open}`);
  }
  if (model.decidedBy !== undefined) lines.push(`Decided by: ${model.decidedBy}`);
  if (model.why !== undefined) lines.push(`Why: ${model.why}`);
  if (model.alternatives !== undefined && model.alternatives.length > 0) {
    lines.push("Considered and rejected:");
    for (const alt of model.alternatives)
      lines.push(`  - ${alt.option}${alt.why === "" ? "" : ` — ${alt.why}`}`);
  }
  if (model.agentDecisions !== undefined && model.agentDecisions.length > 0) {
    lines.push("Agent decisions:");
    for (const decision of model.agentDecisions) {
      lines.push(`  - ${decision.title}${decision.why === "" ? "" : ` — ${decision.why}`}`);
      for (const alt of decision.alternatives ?? [])
        lines.push(`    not: ${alt.option}${alt.why === "" ? "" : ` — ${alt.why}`}`);
    }
  }
  if (model.work !== undefined && model.work.length > 0) {
    lines.push("What the agent did:");
    for (const item of model.work) lines.push(`  - ${item}`);
  }
  if (model.commits.length > 0) {
    lines.push("Commits:");
    for (const commit of model.commits)
      lines.push(
        `  ${commit.hash}${commit.subject === undefined ? " (not in this repository)" : ` ${commit.subject}`}`,
      );
  }
  if (model.files !== undefined && model.files.length > 0) {
    lines.push("Files:");
    for (const file of model.files) lines.push(`  ${file}`);
  }
  if (model.chat === null) {
    lines.push("Conversation: not available (the transcript is gone and nothing was stored)");
  } else if (model.chat !== undefined) {
    lines.push("Conversation:");
    lines.push(`  User: ${model.chat.text}`);
    for (const reply of model.chat.replies) lines.push(`  Agent: ${reply}`);
    const { commands, files, other } = model.chat.tools;
    const fileText =
      files.length === 0 ? "" : `, ${files.length} file${files.length === 1 ? "" : "s"}`;
    lines.push(
      `  Tools: ${commands} command${commands === 1 ? "" : "s"}${fileText}, ${other} other`,
    );
  }
  return lines;
}

export interface LogCommandOptions extends LogOptions {
  dir: string;
  io: Io;
  json?: boolean;
}

/** `cogit log [dir]`. */
export async function log(opts: LogCommandOptions): Promise<LogModel> {
  const root = await openProject(opts.dir);
  const sessions = await loadEffectiveSessions(root, opts.io);
  const model = buildLog(sessions, opts);
  if (opts.json === true) {
    opts.io.out(JSON.stringify(model, null, 2));
    return model;
  }
  for (const line of formatLog(model, opts.branchesOnly === true)) opts.io.out(line);
  return model;
}

export interface UnreadLogOptions {
  dir: string;
  io: Io;
  json?: boolean;
}

/**
 * `cogit log --unread` (Story 10.3): every unread message whose commits resolve
 * in git, most code first, with the same numstat numbers the map shows. The
 * mark is the user's own (`cogit open` toggles it); nothing here reads message
 * text to guess whether a message was "really" understood.
 */
export async function logUnread(opts: UnreadLogOptions): Promise<UnreadMessage[]> {
  const root = await openProject(opts.dir);
  const sessions = await loadEffectiveSessions(root, opts.io);
  const hashes = new Set(
    sessions.flatMap((entry) => entry.messages.flatMap((message) => message.commits ?? [])),
  );
  const changes = hashes.size === 0 ? new Map() : await readProjectChanges(root, hashes);
  const read = await readReadState(root);
  const unread = unreadMessages(
    sessions.map(({ session, messages }) => ({
      sessionId: session.sessionId,
      title: session.title,
      startedAt: session.startedAt,
      nodes: messages.map((message) => ({
        ...message,
        change: messageChange(message.commits, changes),
      })),
    })),
    read,
  );
  if (opts.json === true) {
    opts.io.out(JSON.stringify(unread, null, 2));
    return unread;
  }
  for (const line of formatUnread(unread)) opts.io.out(line);
  return unread;
}

/** The plain-text `--unread` list, one line per message, most code first. */
export function formatUnread(messages: readonly UnreadMessage[]): string[] {
  if (messages.length === 0) return ["No unread messages with linked commits."];
  return messages.map((message) => {
    const parts = [
      `  ${shortHash(message.messageId)}  ${message.label}  ${clock(message.at)}  ` +
        `${formatChange(message.change)}  ${oneLine(message.title)}`,
    ];
    parts.push(`  · ${oneLine(message.sessionTitle)}`);
    return parts.join("");
  });
}

/**
 * `./src\a.ts` and `src/a.ts` name the same file; the model stores forward-slash
 * paths without a leading `./` (Story 8.15).
 */
export function normalizeFilePath(file: string): string {
  return file
    .replace(/\\/g, "/")
    .replace(/^(\.\/)+/, "")
    .replace(/\/+$/, "");
}

/** The plain-text file history: one line per message, newest first. */
export function formatFileHistory(file: ViewFile): string[] {
  const count = `${file.count} message${file.count === 1 ? "" : "s"}`;
  const lines = [`${file.path}  ${count}  (newest first)`];
  for (const hit of file.hits) {
    const parts = [
      `  ${stamp(hit.at)}  ${shortHash(hit.messageId)}  ${hit.label}  ${oneLine(hit.title)}`,
    ];
    parts.push(`  · ${oneLine(hit.sessionTitle)}`);
    if (hit.branch !== undefined) parts.push(` ╭ ${oneLine(hit.branch)}`);
    if (hit.commits.length > 0)
      parts.push(`  [${hit.commits.map((hash) => hash.slice(0, 7)).join(" ")}]`);
    lines.push(parts.join(""));
  }
  return lines;
}

export interface FileLogOptions {
  dir: string;
  /** The file whose history to print, relative to the project. */
  file: string;
  io: Io;
  json?: boolean;
}

/**
 * `cogit log --file <path>`: the recorded messages that touched a file,
 * newest first — the CLI side of the map's files view (Story 8.15). Files come
 * from each message's own `files` plus the files of its commits read from git.
 */
export async function logFile(opts: FileLogOptions): Promise<ViewFile | null> {
  const root = await openProject(opts.dir);
  const sessions = await loadEffectiveSessions(root, opts.io);
  const hashes = new Set(
    sessions.flatMap((entry) => entry.messages.flatMap((message) => message.commits ?? [])),
  );
  let commitFiles: Map<string, string[]> = new Map();
  if (hashes.size > 0) {
    const gitRoot = await findGitRoot(root);
    if (gitRoot !== undefined)
      commitFiles = projectFiles(gitRoot, root, await readCommitFiles(gitRoot, hashes));
  }
  const sources: FileSourceSession[] = sessions.map(({ session, messages }) => ({
    sessionId: session.sessionId,
    title: session.title,
    messages,
  }));
  const wanted = normalizeFilePath(opts.file);
  const found = buildFileHistory(sources, commitFiles).find((file) => file.path === wanted);
  if (found === undefined) {
    opts.io.out(`No recorded message touched ${opts.file}.`);
    return null;
  }
  if (opts.json === true) {
    opts.io.out(JSON.stringify(found, null, 2));
    return found;
  }
  for (const line of formatFileHistory(found)) opts.io.out(line);
  return found;
}
