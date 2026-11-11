import { createReadStream } from "node:fs";
import { open, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import * as zlib from "node:zlib";
import { mapTurn, oneLine, readRange } from "../text.js";
import type { ChatTurn, ForkOrigin, LastTurn } from "../types.js";

/**
 * Reading Codex CLI's transcripts ("rollouts"). A session is one JSONL file,
 * `sessions/YYYY/MM/DD/rollout-<time>-<id>.jsonl` in the Codex home (archived
 * ones under `archived_sessions/`); Codex compresses cold ones to
 * `.jsonl.zst`. Every line is `{timestamp, type, payload}`. What the user typed,
 * what the agent wrote and what its tools did are the `item_completed` events;
 * the `response_item` lines are the model's raw input and output, where Codex's
 * own context also counts as user text, so they are not read for messages.
 */

/** Where Codex keeps its state: `$CODEX_HOME` or `~/.codex`. */
export function codexHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.CODEX_HOME ?? join(homedir(), ".codex");
}

const ROLLOUT =
  /^rollout-.+-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl(\.zst)?$/;

/** Whether this Node can read `.jsonl.zst` (zstd came in Node 22.15; cogit runs on 22.13). */
export function hasZstd(): boolean {
  return typeof (zlib as { createZstdDecompress?: unknown }).createZstdDecompress === "function";
}

/** Every rollout file below `dir`, depth first. An unreadable folder counts as empty. */
async function rollouts(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await rollouts(path)));
    else if (ROLLOUT.test(entry.name)) files.push(path);
  }
  return files;
}

/** Rollouts on this machine, by session id, and the compressed ones this Node cannot read. */
async function scan(
  env: NodeJS.ProcessEnv,
  zstd: boolean,
): Promise<{ found: Map<string, string>; unreadable: string[] }> {
  const home = codexHome(env);
  const found = new Map<string, string>();
  const unreadable: string[] = [];
  const files = [
    ...(await rollouts(join(home, "sessions"))),
    ...(await rollouts(join(home, "archived_sessions"))),
  ];
  for (const file of files) {
    const [, id, compressed] = ROLLOUT.exec(basename(file)) as RegExpExecArray;
    if (compressed && !zstd) unreadable.push(file);
    // While Codex compresses a rollout both copies exist for a moment; the plain one wins.
    else if (!compressed || !found.has(id as string)) found.set(id as string, file);
  }
  return { found, unreadable };
}

/** Every rollout this Node can read, by session id. Best effort: a missing Codex home is none. */
export async function collectTranscripts(
  env: NodeJS.ProcessEnv = process.env,
  zstd = hasZstd(),
): Promise<Map<string, string>> {
  return (await scan(env, zstd)).found;
}

/** Session ids that still have a readable rollout. */
export async function collectTranscriptIds(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Set<string>> {
  return new Set((await collectTranscripts(env)).keys());
}

/** One session's rollout; null when there is none (or only a compressed one this Node cannot read). */
export async function findTranscript(
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  return (await collectTranscripts(env)).get(sessionId) ?? null;
}

/** Compressed rollouts left unread because this Node has no zstd; for `cogit doctor`. */
export async function unreadableTranscripts(
  env: NodeJS.ProcessEnv = process.env,
  zstd = hasZstd(),
): Promise<string[]> {
  return (await scan(env, zstd)).unreadable;
}

/**
 * The text of a rollout, line by line. A plain rollout that Codex compressed
 * since it was found is read from its `.zst`.
 */
async function* lines(file: string): AsyncGenerator<string> {
  let path = file;
  let input: Readable;
  try {
    input = await opened(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" || path.endsWith(".zst")) throw error;
    path = `${file}.zst`;
    input = await opened(path);
  }
  if (path.endsWith(".zst")) input = input.pipe(zlib.createZstdDecompress());
  const reader = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
  try {
    yield* reader;
  } finally {
    reader.close();
    input.destroy();
  }
}

/** A read stream that has opened its file, so a missing file throws here. */
function opened(path: string): Promise<Readable> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(path);
    stream.once("open", () => resolve(stream));
    stream.once("error", reject);
  });
}

interface Line {
  timestamp?: unknown;
  type?: unknown;
  payload?: Record<string, unknown>;
}

function parse(raw: string): Line | undefined {
  try {
    const line = JSON.parse(raw) as Line;
    return typeof line === "object" && line !== null ? line : undefined;
  } catch {
    return undefined;
  }
}

/** A completed item of an `item_completed` event, else undefined. */
function completedItem(line: Line): Record<string, unknown> | undefined {
  if (line.type !== "event_msg" || line.payload?.type !== "item_completed") return undefined;
  const item = line.payload.item;
  return typeof item === "object" && item !== null ? (item as Record<string, unknown>) : undefined;
}

/** The written text of a user or agent item: its text parts, or `[image]` for images alone. */
function itemText(item: Record<string, unknown>): string {
  const content = Array.isArray(item.content) ? (item.content as Record<string, unknown>[]) : [];
  const text = content
    .filter((part) => typeof part?.text === "string" && /^text$/i.test(String(part.type)))
    .map((part) => part.text as string)
    .join("\n");
  if (text.trim() === "" && content.some((part) => /image/i.test(String(part?.type))))
    return "[image]";
  return text;
}

/** Item types that are a tool call other than a shell command or a file edit. */
const OTHER_TOOLS = new Set([
  "McpToolCall",
  "DynamicToolCall",
  "CollabAgentToolCall",
  "WebSearch",
  "ImageView",
  "ImageGeneration",
  "Extension",
  "Plan",
]);

/** The session's first line, `session_meta`; undefined when the file does not start with one. */
async function sessionMeta(file: string): Promise<Record<string, unknown> | undefined> {
  for await (const raw of lines(file)) {
    const line = parse(raw);
    return line?.type === "session_meta" ? line.payload : undefined;
  }
  return undefined;
}

/**
 * Each message the user typed, in order, with the agent's written replies (its
 * commentary as well as its final answer) and what its tools did up to the next
 * message. A fork's rollout holds only its own lines (it names the session it
 * came from instead of copying it), so nothing is left out. Codex writes a new
 * `thread_settings_applied` when a process picks the session up again (and when
 * the user changes a setting, which looks the same): the next message is marked
 * resumed.
 */
export async function readConversation(file: string): Promise<ChatTurn[]> {
  const turns: ChatTurn[] = [];
  let pendingResume = false;
  for await (const raw of lines(file)) {
    if (raw.includes('"thread_settings_applied"')) {
      if (turns.length > 0 && parse(raw)?.payload?.type === "thread_settings_applied")
        pendingResume = true;
      continue;
    }
    if (!raw.includes('"item_completed"')) continue;
    const line = parse(raw);
    const item = line && completedItem(line);
    if (!item) continue;
    const current = turns.at(-1);
    if (item.type === "UserMessage") {
      const text = itemText(item);
      if (text.trim() === "" || typeof line?.timestamp !== "string") continue;
      turns.push({
        id: `m${turns.length + 1}`,
        at: line.timestamp,
        text,
        ...(typeof item.id === "string" ? { uuid: item.id } : {}),
        replies: [],
        tools: { commands: 0, files: [], other: 0 },
        ...(pendingResume ? { resumed: true } : {}),
      });
      pendingResume = false;
      continue;
    }
    if (!current) continue;
    if (item.type === "AgentMessage") {
      const text = itemText(item);
      if (text.trim() !== "") current.replies.push(text);
    } else if (item.type === "CommandExecution") {
      current.tools.commands += 1;
    } else if (item.type === "FileChange") {
      const changes = (item.changes ?? {}) as Record<string, { move_path?: unknown }>;
      for (const [path, change] of Object.entries(changes))
        for (const name of [path, change?.move_path])
          if (typeof name === "string" && !current.tools.files.includes(name))
            current.tools.files.push(name);
    } else if (OTHER_TOOLS.has(String(item.type))) {
      current.tools.other += 1;
    }
  }
  return turns;
}

/** The Codex home a rollout lives in: the folder above its `sessions` or `archived_sessions`. */
function homeOf(file: string): string | undefined {
  for (let dir = dirname(file); dir !== dirname(dir); dir = dirname(dir))
    if (basename(dir) === "sessions" || basename(dir) === "archived_sessions") return dirname(dir);
  return undefined;
}

/** How deep a chain of forks is followed back. */
const FORK_DEPTH = 10;

/**
 * Where a forked session came from (`codex fork`, `codex exec fork`): its
 * `session_meta` names the origin and how many of the origin's lines it
 * shares, and the last message among those lines is the one the fork's first
 * own message grows from. A fork made before anyone typed in its origin goes
 * on to the origin's own origin. Null for a session of its own, or when the
 * origin's rollout is gone.
 */
export async function readForkOrigin(file: string): Promise<ForkOrigin | null> {
  const home = homeOf(file);
  if (home === undefined) return null;
  const known = await collectTranscripts({ CODEX_HOME: home });
  let meta = await sessionMeta(file);
  for (let depth = 0; depth < FORK_DEPTH; depth++) {
    const sessionId = meta?.forked_from_id;
    if (typeof sessionId !== "string") return null;
    const origin = known.get(sessionId);
    if (origin === undefined) return null;
    const base = meta?.history_base as { end_ordinal_exclusive?: unknown } | undefined;
    const limit = meta?.forked_from_ordinal_exclusive ?? base?.end_ordinal_exclusive;
    const last = await lastMessage(origin, typeof limit === "number" ? limit : Infinity);
    if (last) return { sessionId, copied: 0, last };
    meta = await sessionMeta(origin);
  }
  return null;
}

/** The last message the user typed in a rollout's first `limit` lines. */
async function lastMessage(file: string, limit: number): Promise<ForkOrigin["last"] | undefined> {
  let last: ForkOrigin["last"] | undefined;
  let read = 0;
  for await (const raw of lines(file)) {
    if (read++ >= limit) break;
    if (!raw.includes('"UserMessage"')) continue;
    const line = parse(raw);
    const item = line && completedItem(line);
    if (item?.type !== "UserMessage" || typeof line?.timestamp !== "string") continue;
    const text = itemText(item);
    if (text.trim() !== "") last = { uuid: String(item.id ?? ""), at: line.timestamp, text };
  }
  return last;
}

/** The directory the session runs in, from its `session_meta`; undefined when unknown. */
export async function readSessionCwd(file: string): Promise<string | undefined> {
  try {
    const cwd = (await sessionMeta(file))?.cwd;
    return typeof cwd === "string" && cwd !== "" ? cwd : undefined;
  } catch {
    return undefined;
  }
}

/** The model of the session's latest turn (`turn_context`); undefined when unknown. */
export async function readSessionModel(file: string): Promise<string | undefined> {
  let model: string | undefined;
  try {
    for await (const raw of lines(file)) {
      if (!raw.includes('"turn_context"')) continue;
      const line = parse(raw);
      const named = line?.type === "turn_context" ? line.payload?.model : undefined;
      if (typeof named === "string" && named !== "") model = named;
    }
  } catch {}
  return model;
}

/** The client that started the session (`codex_exec`, `codex-tui`, …); undefined when unknown. */
export async function readOriginator(file: string): Promise<string | undefined> {
  const originator = (await sessionMeta(file))?.originator;
  return typeof originator === "string" ? originator : undefined;
}

/** Whether nobody typed into this session: `codex exec` names itself as the originator. */
export async function isHeadlessTranscript(file: string): Promise<boolean> {
  return (await readOriginator(file)) === "codex_exec";
}

/**
 * Whether the agent read a handoff file (Story 8.6). Codex reads files with
 * shell commands, which it also records parsed, so a command naming a handoff
 * file counts.
 */
export async function readsHandoff(file: string): Promise<boolean> {
  for await (const raw of lines(file)) {
    if (!/handoff/i.test(raw) || !raw.includes('"CommandExecution"')) continue;
    const line = parse(raw);
    const item = line && completedItem(line);
    if (item?.type === "CommandExecution" && /handoff/i.test(JSON.stringify(item.command)))
      return true;
  }
  return false;
}

/**
 * Lines Codex writes with the user's role: typed messages and its own context
 * (`<environment_context>`, AGENTS.md). Above zero while `readConversation`
 * finds no message means Codex's format changed under us.
 */
export async function countUserLines(file: string): Promise<number> {
  let count = 0;
  for await (const raw of lines(file)) {
    if (!raw.includes('"role":"user"')) continue;
    const line = parse(raw);
    if (line?.type === "response_item" && line.payload?.role === "user") count += 1;
  }
  return count;
}

/** How many bytes from the end of a plain rollout `readLastTurn` reads at a time. */
export const LAST_TURN_TAIL_BYTES = 256 * 1024;

/** The newest user message and the agent's last written text after it, in some lines. */
function lastTurnIn(raws: Iterable<string>): LastTurn | null {
  let turn: LastTurn | null = null;
  for (const raw of raws) {
    if (!raw.includes('"item_completed"')) continue;
    const line = parse(raw);
    const item = line && completedItem(line);
    if (!item || typeof line?.timestamp !== "string") continue;
    const text = item.type === "AgentMessage" || item.type === "UserMessage" ? itemText(item) : "";
    if (text.trim() === "") continue;
    if (item.type === "UserMessage") turn = { speaker: "user", at: line.timestamp, text: "" };
    else if (turn) turn = { speaker: "agent", at: line.timestamp, text };
  }
  return turn;
}

/**
 * Who spoke last (Story 11.1): `agent` when the agent wrote after the newest
 * user message, else `user`. A plain rollout is read from its end, a window at
 * a time, until a user message turns up; a compressed one is read whole. Null
 * when no message was typed. Unreadable files are the caller's to handle.
 */
export async function readLastTurn(file: string): Promise<LastTurn | null> {
  if (file.endsWith(".zst")) {
    const all: string[] = [];
    for await (const raw of lines(file)) all.push(raw);
    return lastTurnIn(all);
  }
  const handle = await open(file, "r");
  try {
    const { size } = await handle.stat();
    const windows: Buffer[] = [];
    for (let end = size; end > 0; ) {
      const start = Math.max(0, end - LAST_TURN_TAIL_BYTES);
      windows.unshift(await readRange(handle, start, end));
      const text = Buffer.concat(windows).toString("utf8").split("\n");
      // A window that starts mid-file starts mid-line; that line is whole in the next one back.
      const turn = lastTurnIn(start > 0 ? text.slice(1) : text);
      if (turn) return turn;
      end = start;
    }
    return null;
  } finally {
    await handle.close();
  }
}

/**
 * A turn as the map shows it. Codex keeps what the user typed apart from the
 * context it adds, so there is nothing injected to remove; long text is cut
 * and edited files are shown relative to the project.
 */
export function displayTurn(turn: ChatTurn, roots: string[]): ChatTurn {
  return mapTurn(turn, turn.text.trim(), roots);
}

/** Up to this many characters of a message go to the agent. */
export const EXCERPT_LENGTH = 300;

/** A short, single-line view of a message for the agent to title it. */
export function excerpt(text: string, max = EXCERPT_LENGTH): string {
  const line = oneLine(text);
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}
