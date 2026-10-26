import { readFile, rm } from "node:fs/promises";
import { userInfo } from "node:os";
import { resolve } from "node:path";
import { defaultAgent } from "../agents/index.js";
import { commitBetween, findGitRoot, gitUserName } from "../git.js";
import { CliError, type Io } from "../io.js";
import {
  hashesToLabels,
  isRecorded,
  labelsToHashes,
  messageOrder,
  readSessionMessages,
  type SessionMessage,
  upgradeSessionIds,
} from "../messages.js";
import { redactDeep } from "../redact.js";
import { parseMessageRef, Slug } from "../schema/common.js";
import type { SessionEvent } from "../schema/events.js";
import { mergeSession } from "../schema/merge.js";
import { MESSAGE_ID, type Session, SessionInput } from "../schema/session.js";
import { appendEvents, applyEvents, readEvents, seedEvents } from "../store/events.js";
import { projectPaths } from "../store/paths.js";
import { resolveProjectRoot } from "../store/root.js";
import {
  type Loaded,
  listSessionIds,
  loadConfig,
  loadProject,
  loadSession,
  updateSession,
} from "../store/stores.js";
import { buildProject } from "./build.js";

const agent = defaultAgent();

export async function readStdin(stream: NodeJS.ReadableStream = process.stdin): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Who gets credited for a session (Story 9.3): the git name this repository
 * commits with, else the OS user. Recorded once, on the first write; a record
 * made on another machine keeps its own author.
 */
export async function sessionAuthor(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  const gitRoot = await findGitRoot(root);
  const fromGit = gitRoot === undefined ? undefined : await gitUserName(gitRoot, env);
  if (fromGit !== undefined) return fromGit;
  try {
    return userInfo().username || undefined;
  } catch {
    return env.USER ?? env.USERNAME ?? undefined;
  }
}

export interface SessionWriteOptions {
  dir: string;
  /** Read JSON from this file instead of stdin. */
  file?: string;
  /** Delete `file` once the record is saved; a failed write keeps it for a retry. */
  consume?: boolean;
}

/**
 * Validates agent JSON, redacts secrets and merges it into the session file under
 * the session lock.
 */
export async function sessionWrite(
  opts: SessionWriteOptions,
  io: Io,
  stdin: () => Promise<string> = readStdin,
): Promise<void> {
  const { root, worktree } = await resolveProjectRoot(opts.dir);
  const project = await loadProject(root);
  if (!project.found) throw new CliError(`${root} is not initialized; run \`cogit init\` first`);
  if (!project.ok) throw new CliError(project.error);

  const text = opts.file ? await readFile(opts.file, "utf8") : await stdin();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new CliError(`input is not valid JSON: ${(err as Error).message}`);
  }
  const parsed = SessionInput.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new CliError(`input does not match the session schema: ${issues.join("; ")}`);
  }

  const { value: redacted, count } = redactDeep(parsed.data);
  // Both ids work: the agent may send the stable `h…` id, or the `m1` label it
  // reads in `session show`; the CLI maps the label to the stable id.
  const messages = await readSessionMessages(root, redacted.sessionId, io.env);
  const input = nameMessages(redacted, messages, io);
  if (count > 0) io.warn(`redacted ${count} secret-looking value(s)`);
  if (input.epoch && !project.data.epochs.some((e) => e.id === input.epoch)) {
    io.warn(
      `epoch "${input.epoch}" is not in project.json; the session shows as unassigned until you run \`cogit epoch add ${input.epoch} <title>\``,
    );
  }

  // Cross-session parents (8.6) are checked against the other records before the
  // merge; `startedAt` is the current session's own start.
  const current = await loadSession(root, input.sessionId);
  const startedAt = current.found && current.ok ? current.data.startedAt : io.now();
  const author =
    current.found && current.ok && current.data.author
      ? current.data.author
      : await sessionAuthor(root, io.env);
  const crossTargets = await crossSessionTargets(root, input.sessionId, startedAt, input, io.env);
  let warnings: string[] = [];
  const saved = await updateSession(root, input.sessionId, async (cur) => {
    // A record written before 8.5 still names messages `m1`, `m2`, …; the file is
    // rewritten with stable ids and the structure seeds the events file below.
    const upgraded = cur && messages ? upgradeSessionIds(cur, messages) : cur;
    const events = await readEvents(root, input.sessionId);
    const base = upgraded ? { ...upgraded, nodes: applyEvents(upgraded.nodes, events) } : undefined;
    const merged = mergeSession(base, input, io.now(), {
      ...(messages ? { order: messageOrder(messages) } : {}),
      labels: hashesToLabels(messages),
      crossTargets,
    });
    warnings = merged.warnings;
    const changes = structureChanges(merged.session, base, io.now());
    // The first structural change on an old record seeds the facts it already
    // holds, so replaying the file from then on gives the same graph.
    const seed =
      events.length === 0 && changes.length > 0 && base?.nodes.some((n) => n.kind === "message")
        ? seedEvents(base.nodes, io.now())
        : [];
    await appendEvents(root, input.sessionId, [...seed, ...changes]);
    // A write from the main checkout (e.g. after a resume) keeps the stored worktree.
    const stored = worktree ? { ...merged.session, worktree } : merged.session;
    // Story 9.3: the first write stamps who recorded the session.
    return stored.author === undefined && author !== undefined ? { ...stored, author } : stored;
  });
  for (const w of warnings) io.warn(w);
  if (opts.file && opts.consume) await rm(opts.file, { force: true });
  io.out(`Saved session ${saved.sessionId} (${saved.nodes.length} nodes)`);

  // Keep the map fresh without making a failed render fail the write.
  try {
    await buildProject({ dir: root, io, quiet: true });
  } catch (err) {
    io.warn(`could not build map.html: ${(err as Error).message}`);
  }
}

/**
 * Turns the agent's message ids into stable ids and takes each message's time
 * from the transcript, so the map's order is the order the user wrote them,
 * whatever the agent sent. A label (`m3`) and a stable id (`h…`) are both
 * accepted; a node the session does not know keeps its id with a warning.
 * Without a transcript (or a stored conversation) the agent's fields stay.
 */
function nameMessages(
  input: SessionInput,
  messages: SessionMessage[] | null,
  io: Io,
): SessionInput {
  const nodes = input.nodes ?? [];
  if (!nodes.some((n) => n.kind === "message")) return input;
  const byLabel = labelsToHashes(messages);
  const byHash = new Map((messages ?? []).map((message) => [message.hash, message]));
  const rename = (id: string): string => byLabel.get(id) ?? id;
  /** `thisSession:h…` names this session's own message; store it as a bare id. */
  const ref = (id: string): string => {
    const own = parseMessageRef(id);
    return rename(own.sessionId === input.sessionId ? own.id : id);
  };
  return {
    ...input,
    nodes: nodes.map((node) => {
      if (node.kind !== "message") return node;
      const at = byHash.get(rename(node.id))?.at;
      if (!messages) {
        if (!MESSAGE_ID.test(node.id))
          io.warn(`message node ${node.id}: expected an id like m1 from \`session show\``);
      } else if (at === undefined) {
        io.warn(`message node ${node.id}: no such message in the transcript`);
      }
      return {
        ...node,
        id: rename(node.id),
        ...(at === undefined ? {} : { at }),
        ...(node.parent === undefined || node.parent === null ? {} : { parent: ref(node.parent) }),
        ...(node.links === undefined ? {} : { links: node.links.map(ref) }),
      };
    }),
  };
}

/**
 * The `<sessionId>:<id>` parents and links the input sends, kept only when the
 * other session belongs to this project, started no later than this one and holds
 * that message (Story 8.6). The rest reach the merge as unknown references and
 * are warned about there; nothing is dropped silently.
 */
export async function crossSessionTargets(
  root: string,
  sessionId: string,
  startedAt: string,
  input: SessionInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Set<string>> {
  const refs = new Set<string>();
  for (const node of input.nodes ?? []) {
    for (const value of [node.parent, ...(node.links ?? [])]) {
      if (typeof value === "string" && parseMessageRef(value).sessionId !== null) refs.add(value);
    }
  }
  const valid = new Set<string>();
  for (const value of refs) {
    const { sessionId: otherId, id } = parseMessageRef(value);
    if (otherId === null || otherId === sessionId) continue;
    const loaded = await loadSession(root, otherId);
    if (!loaded.found || !loaded.ok) continue;
    const otherStart = Date.parse(loaded.data.startedAt);
    if (Number.isNaN(otherStart) || otherStart > Date.parse(startedAt)) continue;
    const messages = await readSessionMessages(root, otherId, env);
    const record = await effectiveRecord(root, otherId, loaded, messages);
    if (record?.nodes.some((node) => node.kind === "message" && node.id === id)) valid.add(value);
  }
  return valid;
}

/**
 * The parent/link events a merged record needs on top of the structure it had:
 * a changed parent (including a correction back to root) and added or removed
 * links. Unchanged input writes no event.
 */
function structureChanges(
  merged: Session,
  before: Session | undefined,
  at: string,
): SessionEvent[] {
  const previous = new Map(
    (before?.nodes ?? [])
      .filter((node) => node.kind === "message")
      .map((node) => [node.id, { parent: node.parent ?? null, links: node.links ?? [] }]),
  );
  const events: SessionEvent[] = [];
  for (const node of merged.nodes) {
    if (node.kind !== "message") continue;
    const old = previous.get(node.id) ?? { parent: null, links: [] };
    const parent = node.parent ?? null;
    if (parent !== old.parent)
      events.push({ at, type: "parent", msg: node.id, target: parent, by: "agent" });
    const links = node.links ?? [];
    for (const link of links) {
      if (!old.links.includes(link))
        events.push({ at, type: "link", msg: node.id, target: link, by: "agent" });
    }
    for (const link of old.links) {
      if (!links.includes(link))
        events.push({ at, type: "unlink", msg: node.id, target: link, by: "agent" });
    }
  }
  return events;
}

/**
 * What the skill injects before the agent updates its record: the project's
 * epochs, the summary language, a compact view of this session (node ids,
 * parents, kinds and titles, without summaries, which merging keeps anyway) and
 * the user's messages from the transcript that have no node yet, so the agent
 * cannot skip or reorder one.
 * Always exits 0 for an uninitialized project or an unreadable record, because a
 * failing injected command aborts the whole skill; the JSON says what is wrong.
 *
 * `dir` is the directory the agent passes back to later commands; in a linked
 * worktree that is the worktree, so writes still learn which worktree they came
 * from, while `store` names the main checkout that holds the record. The inbox
 * stays under `dir`, where the skill's edit permission points.
 *
 * The output is compact by default, because the skill pays for it on every
 * update: `lastMessages` keeps the last five and `candidates` only appear while
 * the first message has no node. `--full` (Story 9.5) asks for every recorded
 * message and the candidates every time.
 */
export async function sessionShow(
  dir: string,
  sessionId: string,
  io: Io,
  opts: { full?: boolean } = {},
): Promise<void> {
  if (!Slug.safeParse(sessionId).success) throw new CliError(`invalid session id: ${sessionId}`);
  const given = resolve(dir);
  const { root } = await resolveProjectRoot(given);
  const store = root === given ? {} : { store: root };
  const project = await loadProject(root);
  if (!project.found || !project.ok) {
    const error = project.found && !project.ok ? project.error : undefined;
    io.out(
      JSON.stringify({ initialized: false, dir: given, ...store, ...(error ? { error } : {}) }),
    );
    return;
  }

  const config = await loadConfig(io.env);
  const loaded = await loadSession(root, sessionId);
  const view: Record<string, unknown> = {
    initialized: true,
    dir: given,
    ...store,
    project: project.data.name,
    language: config.language,
    messageSummaries: config.messageSummaries,
    epochs: project.data.epochs.map(({ id, title }) => ({ id, title })),
    session: null,
  };
  const messages = await readSessionMessages(root, sessionId, io.env);
  const labels = hashesToLabels(messages);
  const effective = await effectiveRecord(root, sessionId, loaded, messages);
  if (effective) {
    const { title, epoch, status, nodes } = effective;
    view.session = {
      sessionId,
      title,
      epoch,
      status,
      nodes: nodes.map(({ id, parent, kind, title }) => {
        const label = labels.get(id);
        return { id, ...(label === undefined ? {} : { label }), parent, kind, title };
      }),
    };
  } else if (loaded.found && !loaded.ok) {
    view.sessionError = loaded.error;
  }
  const recorded = recordedIdsOf(effective);
  if (messages) {
    view.messageCount = messages.length;
    view.newMessages = await newMessages(messages, recorded, labels, root, io.env);
    // Only the session's first message can continue an earlier session (8.6), so
    // the expensive other-session scan only runs while that message is unrecorded
    // (`--full` asks for it every time, for debugging and backfill).
    const first = messages[0];
    const candidates =
      first !== undefined && (opts.full === true || !isRecorded(recorded, first))
        ? await parentCandidates(root, sessionId, first, io)
        : null;
    if (candidates) view.candidates = candidates;
  } else {
    view.newMessages = null;
  }
  view.lastMessages = lastMessages(
    effective,
    labels,
    opts.full === true ? Number.POSITIVE_INFINITY : LAST_MESSAGES,
  );
  // A format change would otherwise look like "nothing written yet" forever.
  if (messages && messages.length === 0) {
    const file = await agent.findTranscript(sessionId, io.env);
    const userLines = file ? await agent.countUserLines(file).catch(() => 0) : 0;
    if (userLines > 0)
      view.transcriptWarning =
        `the transcript has ${userLines} user line(s) but none read as a message; ` +
        "Claude Code's transcript format may have changed";
  }
  view.inbox = projectPaths(given).inbox(sessionId);
  io.out(JSON.stringify(view, null, 2));
}

/**
 * The record as the map sees it: old `m1` ids renamed to stable ids when the
 * messages are known, then the structure from the events file (Story 8.5).
 */
async function effectiveRecord(
  root: string,
  sessionId: string,
  loaded: Loaded<Session>,
  messages: SessionMessage[] | null,
): Promise<Session | null> {
  if (!loaded.found || !loaded.ok) return null;
  const upgraded = messages ? upgradeSessionIds(loaded.data, messages) : loaded.data;
  const events = await readEvents(root, sessionId);
  return { ...upgraded, nodes: applyEvents(upgraded.nodes, events) };
}

function recordedIdsOf(session: Session | null): Set<string> {
  return new Set(session?.nodes.map((node) => node.id) ?? []);
}

/** How many recorded messages `session show` repeats for picking a parent. */
const LAST_MESSAGES = 5;

/**
 * The user's messages with no node yet, with the cheap hints the agent uses to
 * decide a parent: the gap since the previous message, a `/clear` or resume in
 * between, and a commit made in this repository between them. Hints, not rules.
 * `id` is the stable id the record keeps; `label` is the `m1` the user reads.
 *
 * `commitBetween` asks git, not the transcript: the transcript only shows that a
 * `git commit` command ran, which was true even when it failed or committed in
 * another repository (Story 9.5).
 */
async function newMessages(
  messages: SessionMessage[],
  recorded: ReadonlySet<string>,
  labels: ReadonlyMap<string, string>,
  root: string,
  env: NodeJS.ProcessEnv,
): Promise<Record<string, unknown>[]> {
  const gitRoot = await findGitRoot(root);
  const out: Record<string, unknown>[] = [];
  for (const [i, message] of messages.entries()) {
    if (isRecorded(recorded, message)) continue;
    const previous = i > 0 ? messages[i - 1] : undefined;
    const gapMinutes =
      previous === undefined
        ? undefined
        : Math.max(0, Math.round((Date.parse(message.at) - Date.parse(previous.at)) / 60_000));
    const committed =
      previous !== undefined &&
      gitRoot !== undefined &&
      (await commitBetween(gitRoot, previous.at, message.at, env));
    out.push({
      id: message.hash,
      label: labels.get(message.hash) ?? message.label,
      at: message.at,
      text: agent.excerpt(message.text),
      ...(gapMinutes === undefined ? {} : { gapMinutes }),
      ...(message.resumed ? { resumed: true } : {}),
      ...(committed ? { commitBetween: true } : {}),
    });
  }
  return out;
}

/** How many earlier sessions and messages `session show` offers for a parent. */
const CANDIDATE_SESSIONS = 3;
const CANDIDATE_MESSAGES = 3;

/** A first message that says, in the user's words, that it continues earlier work. */
const CONTINUES = /\b(devam|kaldığımız yerden|continue)\b/i;

/**
 * The candidates for hanging a session's first message from an earlier session
 * (8.6): the last messages of the most recently updated other sessions, with a
 * hint when the transcript shows a handoff file being read or the message itself
 * says it continues. Cheap hints from records and the transcript, no model call.
 */
async function parentCandidates(
  root: string,
  sessionId: string,
  first: SessionMessage,
  io: Io,
): Promise<Record<string, unknown>> {
  // Newest records first, and only the three that keep a message need their
  // transcript read (old ids become stable ones there).
  const recent: Session[] = [];
  for (const id of await listSessionIds(projectPaths(root).sessions)) {
    if (id === sessionId) continue;
    const loaded = await loadSession(root, id);
    if (loaded.found && loaded.ok) recent.push(loaded.data);
  }
  recent.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const others: {
    sessionId: string;
    title: string;
    updatedAt: string;
    messages: { id: string; title: string; at?: string }[];
  }[] = [];
  for (const candidate of recent) {
    const nodes = [...candidate.nodes]
      .filter((node) => node.kind === "message")
      .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
    if (nodes.length === 0) continue;
    // Only a legacy record needs its transcript (for stable ids); the rest are
    // already keyed by them, so most sessions cost one file read.
    const messages = await readSessionMessages(root, candidate.sessionId, io.env);
    const record = await effectiveRecord(
      root,
      candidate.sessionId,
      { found: true, ok: true, data: candidate, warnings: [] },
      messages,
    );
    const effective = (record?.nodes ?? nodes)
      .filter((node) => node.kind === "message")
      .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
    others.push({
      sessionId: candidate.sessionId,
      title: candidate.title,
      updatedAt: candidate.updatedAt,
      messages: effective.slice(-CANDIDATE_MESSAGES).map(({ id: messageId, title, at }) => ({
        id: messageId,
        title,
        ...(at === undefined ? {} : { at }),
      })),
    });
    if (others.length === CANDIDATE_SESSIONS) break;
  }
  const file = await agent.findTranscript(sessionId, io.env);
  const handoff = file ? await agent.readsHandoff(file).catch(() => false) : false;
  return {
    forMessage: { id: first.hash, label: first.label },
    ...(handoff || CONTINUES.test(first.text) ? { continuesHint: true } : {}),
    sessions: others,
  };
}

/** The last few recorded messages (stable id, label, title, parent) for a parent pick. */
function lastMessages(
  session: Session | null,
  labels: ReadonlyMap<string, string>,
  limit: number,
): { id: string; label?: string; title: string; parent: string | null }[] {
  if (!session) return [];
  /** Send-order position from the label; a node without one keeps its stored place. */
  const position = (id: string): number => {
    const match = /^m([1-9][0-9]*)$/.exec(labels.get(id) ?? "");
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  };
  const messages = session.nodes
    .filter((n) => n.kind === "message")
    .sort((a, b) => position(a.id) - position(b.id))
    .slice(-limit);
  return messages.map(({ id, title, parent }) => {
    const label = labels.get(id);
    return { id, ...(label === undefined ? {} : { label }), title, parent };
  });
}
