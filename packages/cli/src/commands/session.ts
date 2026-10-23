import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { CliError, type Io } from "../io.js";
import { redactDeep } from "../redact.js";
import { Slug } from "../schema/common.js";
import { mergeSession } from "../schema/merge.js";
import { MESSAGE_ID, type Session, SessionInput } from "../schema/session.js";
import { projectPaths } from "../store/paths.js";
import { resolveProjectRoot } from "../store/root.js";
import {
  type Loaded,
  loadConfig,
  loadProject,
  loadSession,
  updateSession,
} from "../store/stores.js";
import {
  countUserLines,
  excerpt,
  findTranscript,
  readUserMessages,
  type UserMessage,
} from "../transcript.js";
import { buildProject } from "./build.js";

export async function readStdin(stream: NodeJS.ReadableStream = process.stdin): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString("utf8");
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
  if (!project.found)
    throw new CliError(`${root} is not initialized; run \`codelineage init\` first`);
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
  const input = await stampMessageTimes(redacted, io);
  if (count > 0) io.warn(`redacted ${count} secret-looking value(s)`);
  if (input.epoch && !project.data.epochs.some((e) => e.id === input.epoch)) {
    io.warn(
      `epoch "${input.epoch}" is not in project.json; the session shows as unassigned until you run \`codelineage epoch add ${input.epoch} <title>\``,
    );
  }

  let warnings: string[] = [];
  const saved = await updateSession(root, input.sessionId, (cur) => {
    const merged = mergeSession(cur, input, io.now());
    warnings = merged.warnings;
    // A write from the main checkout (e.g. after a resume) keeps the stored worktree.
    return worktree ? { ...merged.session, worktree } : merged.session;
  });
  for (const w of warnings) io.warn(w);
  if (opts.file && opts.consume) await rm(opts.file, { force: true });
  io.out(`Saved session ${saved.sessionId} (${saved.nodes.length} nodes)`);

  // Keep the map fresh without making a failed render fail the write.
  try {
    await buildProject({ dir: root, io, quiet: true });
  } catch (err) {
    io.warn(`could not build lineage.html: ${(err as Error).message}`);
  }
}

/** The session's transcript file and user messages, or null when it cannot be read. */
async function transcriptMessages(
  sessionId: string,
  env: NodeJS.ProcessEnv,
): Promise<{ file: string; messages: UserMessage[] } | null> {
  const file = await findTranscript(sessionId, env);
  if (!file) return null;
  try {
    return { file, messages: await readUserMessages(file) };
  } catch {
    return null;
  }
}

/** The session's user messages, or null when its transcript cannot be read. */
async function userMessages(
  sessionId: string,
  env: NodeJS.ProcessEnv,
): Promise<UserMessage[] | null> {
  return (await transcriptMessages(sessionId, env))?.messages ?? null;
}

/**
 * Message nodes take their time from the transcript, so their order on the map
 * is the order the user wrote them, whatever the agent sent. Without a
 * transcript the agent's `at` stays.
 */
async function stampMessageTimes(input: SessionInput, io: Io): Promise<SessionInput> {
  const ids = (input.nodes ?? []).filter((n) => n.kind === "message").map((n) => n.id);
  if (ids.length === 0) return input;
  for (const id of ids) {
    if (!MESSAGE_ID.test(id))
      io.warn(`message node ${id}: expected an id like m1 from \`session show\``);
  }
  const messages = await userMessages(input.sessionId, io.env);
  if (!messages) return input;
  const times = new Map(messages.map((m) => [m.id, m.at]));
  for (const id of ids) {
    if (MESSAGE_ID.test(id) && !times.has(id))
      io.warn(`message node ${id}: no such message in the transcript`);
  }
  return {
    ...input,
    nodes: input.nodes?.map((n) => {
      const at = n.kind === "message" ? times.get(n.id) : undefined;
      return at ? { ...n, at } : n;
    }),
  };
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
 */
export async function sessionShow(dir: string, sessionId: string, io: Io): Promise<void> {
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
    epochs: project.data.epochs.map(({ id, title }) => ({ id, title })),
    session: null,
  };
  if (loaded.found && loaded.ok) {
    const { title, epoch, status, nodes } = loaded.data;
    view.session = {
      sessionId,
      title,
      epoch,
      status,
      nodes: nodes.map(({ id, parent, kind, title }) => ({ id, parent, kind, title })),
    };
  } else if (loaded.found) {
    view.sessionError = loaded.error;
  }
  const transcript = await transcriptMessages(sessionId, io.env);
  const messages = transcript?.messages ?? null;
  if (messages) {
    const recorded = new Set(loaded.found && loaded.ok ? loaded.data.nodes.map((n) => n.id) : []);
    view.messageCount = messages.length;
    view.newMessages = newMessages(messages, recorded);
  } else {
    view.newMessages = null;
  }
  view.lastMessages = lastMessages(loaded);
  // A format change would otherwise look like "nothing written yet" forever.
  if (transcript && transcript.messages.length === 0) {
    const userLines = await countUserLines(transcript.file).catch(() => 0);
    if (userLines > 0)
      view.transcriptWarning =
        `the transcript has ${userLines} user line(s) but none read as a message; ` +
        "Claude Code's transcript format may have changed";
  }
  view.inbox = projectPaths(given).inbox(sessionId);
  io.out(JSON.stringify(view, null, 2));
}

/** How many recorded messages `session show` repeats for picking a parent. */
const LAST_MESSAGES = 5;

/**
 * The user's messages with no node yet, with the cheap hints the agent uses to
 * decide a parent: the gap since the previous message, a `/clear` or resume in
 * between, and a commit this session made between them. Hints, not rules.
 */
function newMessages(messages: UserMessage[], recorded: Set<string>): Record<string, unknown>[] {
  return messages
    .map((message, i) => {
      const previous = i > 0 ? messages[i - 1] : undefined;
      const gapMinutes = previous
        ? Math.max(0, Math.round((Date.parse(message.at) - Date.parse(previous.at)) / 60_000))
        : undefined;
      return { message, gapMinutes };
    })
    .filter(({ message }) => !recorded.has(message.id))
    .map(({ message, gapMinutes }) => ({
      id: message.id,
      at: message.at,
      text: excerpt(message.text),
      ...(gapMinutes === undefined ? {} : { gapMinutes }),
      ...(message.resumed ? { resumed: true } : {}),
      ...(message.commitBetween ? { commitBetween: true } : {}),
    }));
}

/** The last few recorded messages (id, title, parent) so the agent can pick a parent. */
function lastMessages(
  loaded: Loaded<Session>,
): { id: string; title: string; parent: string | null }[] {
  if (!loaded.found || !loaded.ok) return [];
  return loaded.data.nodes
    .filter((n) => n.kind === "message" && MESSAGE_ID.test(n.id))
    .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
    .slice(-LAST_MESSAGES)
    .map(({ id, title, parent }) => ({ id, title, parent }));
}
