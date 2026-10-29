import { createReadStream } from "node:fs";
import { access, type FileHandle, open, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { ChatTurn, LastTurn, ToolUse, UserMessage } from "../types.js";

/**
 * Reading Claude Code's transcripts. A session is one JSONL file under
 * `projects/<encoded cwd>/<id>.jsonl` in the Claude home; every line is an API
 * or harness record, and only some user lines are messages the user typed.
 */

/** Where Claude Code keeps its state: `$CLAUDE_CONFIG_DIR` or `~/.claude`. */
export function claudeConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
}

/**
 * The transcript of a session, `projects/<encoded cwd>/<id>.jsonl`. The encoded
 * directory is searched rather than derived, since a resumed or worktree session
 * may live under another project's folder. Null when there is none.
 */
export async function findTranscript(
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const projectsDir = join(claudeConfigDir(env), "projects");
  let dirs;
  try {
    dirs = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const file = join(projectsDir, dir.name, `${sessionId}.jsonl`);
    try {
      await access(file);
      return file;
    } catch {}
  }
  return null;
}

/**
 * Every transcript under `projects/<encoded>/*.jsonl`, by session id.
 * Best effort: an unreadable Claude home means "none found", never a failed build.
 */
export async function collectTranscripts(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const projectsDir = join(claudeConfigDir(env), "projects");

  let projectDirs;
  try {
    projectDirs = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of projectDirs) {
    if (!entry.isDirectory()) continue;
    const dir = join(projectsDir, entry.name);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (file.endsWith(".jsonl")) found.set(file.slice(0, -".jsonl".length), join(dir, file));
    }
  }
  return found;
}

/** Session ids that still have a transcript. */
export async function collectTranscriptIds(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Set<string>> {
  return new Set((await collectTranscripts(env)).keys());
}

/** Lines Claude Code writes as user turns that the user did not type as a message. */
const NOT_A_MESSAGE =
  /^\s*<(bash-input|bash-stdout|bash-stderr|local-command-[a-z]+|command-message)>/;
const COMMAND = /^\s*<command-name>([^<]*)<\/command-name>/;
const COMMAND_ARGS = /<command-args>([\s\S]*?)<\/command-args>/;
/** Claude Code's own note that the user stopped a turn; the user typed nothing. */
const INTERRUPTED = /^\s*\[Request interrupted\b[^\]]*\]\s*$/;

/**
 * The text of a user line when it is a message the user typed, else null. Tool
 * results, injected skill text (`isMeta`), compaction summaries, subagent turns,
 * shell (`!`) input and output, and slash commands without arguments are not
 * messages; a slash command with arguments counts as "/name args".
 */
export function messageText(line: Record<string, unknown>): string | null {
  if (line.type !== "user") return null;
  if (line.isMeta || line.isCompactSummary || line.isSidechain) return null;
  const origin = line.origin as { kind?: unknown } | undefined;
  if (origin && origin.kind !== "human") return null;
  const content = (line.message as { content?: unknown } | undefined)?.content;
  let text: string;
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    if (content.some((block) => block?.type === "tool_result")) return null;
    text = content
      .filter((block) => block?.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("\n");
    if (text.trim() === "" && content.some((block) => block?.type === "image")) text = "[image]";
  } else {
    return null;
  }
  if (NOT_A_MESSAGE.test(text)) return null;
  if (INTERRUPTED.test(text)) return null;
  const command = COMMAND.exec(text);
  if (command) {
    const args = COMMAND_ARGS.exec(text)?.[1]?.trim() ?? "";
    return args === "" ? null : `${command[1]?.trim()} ${args}`;
  }
  return text.trim() === "" ? null : text;
}

/** The longest text one chat entry keeps on the map; the rest is cut with a note. */
export const CHAT_TEXT_LIMIT = 20_000;

function capped(text: string): string {
  if (text.length <= CHAT_TEXT_LIMIT) return text;
  return `${text.slice(0, CHAT_TEXT_LIMIT)}\n\n[… ${text.length - CHAT_TEXT_LIMIT} more characters not shown]`;
}

/** Claude Code's injected reminders, dropped from the text the map shows. */
function withoutReminders(text: string): string {
  return text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "");
}

/**
 * A turn as the map shows it: reminders the harness injected are dropped, paste
 * markers become a plain label, very long text is cut, and edited files are shown
 * relative to the project (or the worktree the session ran in).
 */
export function displayTurn(turn: ChatTurn, roots: string[]): ChatTurn {
  const text = withoutReminders(turn.text)
    .replace(
      /<pasted_content[^>]*>([\s\S]*?)<\/pasted_content[^>]*>/g,
      "\n[Pasted]\n$1\n[/Pasted]\n",
    )
    .trim();
  const relative = (file: string): string => {
    for (const root of roots) if (file.startsWith(`${root}/`)) return file.slice(root.length + 1);
    return file;
  };
  return {
    ...turn,
    text: capped(text),
    replies: turn.replies.map(capped),
    // Steps and questions feed the recorder only; the map keeps the counts.
    tools: {
      commands: turn.tools.commands,
      files: turn.tools.files.map(relative),
      other: turn.tools.other,
    },
  };
}

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

/** A `/clear` written by the user or by the CLI as a local command. */
const CLEAR = /<command-name>\s*\/clear\s*<\/command-name>/;

/** The uuid chain fields, read from every line without parsing it. */
const LINE_UUID = /"uuid":"([^"]+)"/;
const LINE_PARENT = /"parentUuid":"([^"]+)"/;

/** Keeps a step or question list short and free of repeats. */
const LIST_LIMIT = 40;

function addOnce(tools: ToolUse, key: "steps" | "asks", text: string): void {
  const list = tools[key] ?? [];
  if (list.length < LIST_LIMIT && !list.includes(text)) tools[key] = [...list, text.slice(0, 300)];
}

/** Records the agent's text and tool calls of one assistant line on the current turn. */
function addAssistant(turn: ChatTurn, line: Record<string, unknown>): void {
  if (line.isSidechain) return;
  const content = (line.message as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (block?.type === "text" && typeof block.text === "string" && block.text.trim() !== "") {
      turn.replies.push(block.text);
    } else if (block?.type === "tool_use") {
      const input = (block.input ?? {}) as Record<string, unknown>;
      const path = input.file_path;
      if (block.name === "Bash") {
        turn.tools.commands += 1;
        if (typeof input.description === "string" && input.description.trim() !== "")
          addOnce(turn.tools, "steps", input.description.trim());
      } else if (EDIT_TOOLS.has(block.name) && typeof path === "string") {
        if (!turn.tools.files.includes(path)) turn.tools.files.push(path);
      } else {
        turn.tools.other += 1;
        if (block.name === "AskUserQuestion" && Array.isArray(input.questions))
          for (const q of input.questions as { question?: unknown; options?: unknown }[]) {
            if (typeof q?.question !== "string") continue;
            const options = Array.isArray(q.options)
              ? (q.options as { label?: unknown }[])
                  .map((o) => o?.label)
                  .filter((label): label is string => typeof label === "string")
              : [];
            addOnce(turn.tools, "asks", `${q.question} [${options.join(" | ")}]`);
          }
      }
    }
  }
}

/**
 * Reads the conversation from a transcript: each message the user typed, in
 * order, with the agent's written replies and a count of its tool calls up to
 * the next message. Unparseable lines are skipped.
 */
export async function readConversation(file: string): Promise<ChatTurn[]> {
  const turns: ChatTurn[] = [];
  /** Uuids already read, to notice a chain that starts again (a resumed process). */
  const seen = new Set<string>();
  let pendingResume = false;
  const lines = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
  for await (const raw of lines) {
    // A /clear line is a local command, not a message, but it breaks the thread.
    if (raw.includes("<command-name>") && CLEAR.test(raw)) pendingResume = true;
    // A resume or a new process can append a chain whose parent is not in this
    // file (system lines sit in the chain too, so every line counts). A resume
    // that continues the chain cannot be told apart.
    const uuid = LINE_UUID.exec(raw)?.[1];
    const parent = LINE_PARENT.exec(raw)?.[1];
    if (
      seen.size > 0 &&
      parent !== undefined &&
      !seen.has(parent) &&
      !raw.includes('"isSidechain":true')
    )
      pendingResume = true;
    if (uuid !== undefined) seen.add(uuid);
    // Most lines are tool output, attachments or API records; skip them unparsed.
    const user = raw.includes('"type":"user"');
    if (!user && !raw.includes('"type":"assistant"')) continue;
    let line: Record<string, unknown>;
    try {
      line = JSON.parse(raw);
    } catch {
      continue;
    }
    // Another line type may still carry `"type":"user"` in nested text.
    if (line.type !== "user" && line.type !== "assistant") continue;
    const current = turns.at(-1);
    if (line.type === "assistant") {
      if (current) addAssistant(current, line);
      continue;
    }
    const text = messageText(line);
    if (text === null || typeof line.timestamp !== "string") continue;
    const first = turns.length === 0;
    turns.push({
      id: `m${turns.length + 1}`,
      at: line.timestamp,
      text,
      ...(uuid === undefined ? {} : { uuid }),
      replies: [],
      tools: { commands: 0, files: [], other: 0 },
      ...(!first && pendingResume ? { resumed: true } : {}),
    });
    pendingResume = false;
  }
  return turns;
}

/**
 * How many bytes from the end of a transcript `readLastTurn` reads first
 * (Story 11.1). The last turn is nearly always in here; a longer turn makes the
 * reader walk further back a window at a time.
 */
export const LAST_TURN_TAIL_BYTES = 256 * 1024;

/** What scanning a transcript for its ending keeps. */
interface TurnState {
  /** A user message was typed somewhere in the scanned window. */
  userSeen: boolean;
  userAt: string | null;
  /** The last agent text line after the newest user message. */
  agentAt: string | null;
  agentText: string | null;
}

/** Reads a byte range from an open file, however many reads the OS needs. */
async function readRange(handle: FileHandle, start: number, end: number): Promise<Buffer> {
  const buffer = Buffer.allocUnsafe(end - start);
  let offset = 0;
  // A POSIX read may return less than asked; `end` is inside the file, so this
  // loop cannot stall at zero.
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, start + offset);
    offset += bytesRead;
  }
  return buffer.subarray(0, offset);
}

/**
 * Applies the lines of one transcript stretch to the tail state. A user line is
 * a message only when {@link messageText} says the user typed it, so tool
 * results and injected reminders leave the turn alone; an assistant line with
 * written text is the agent's reply. A new user message starts a new turn.
 */
function scanLastTurn(raw: string, state: TurnState): void {
  for (const line of raw.split("\n")) {
    const user = line.includes('"type":"user"');
    if (!user && !line.includes('"type":"assistant"')) continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (parsed.type === "user") {
      if (messageText(parsed) === null || typeof parsed.timestamp !== "string") continue;
      state.userSeen = true;
      state.userAt = parsed.timestamp;
      state.agentAt = null;
      state.agentText = null;
      continue;
    }
    if (parsed.type !== "assistant" || parsed.isSidechain) continue;
    const content = (parsed.message as { content?: unknown } | undefined)?.content;
    if (!Array.isArray(content)) continue;
    const texts = content
      .filter(
        (block): block is { type: "text"; text: string } =>
          block?.type === "text" && typeof block.text === "string" && block.text.trim() !== "",
      )
      .map((block) => block.text);
    if (texts.length === 0 || typeof parsed.timestamp !== "string") continue;
    state.agentAt = parsed.timestamp;
    state.agentText = texts.join("\n");
  }
}

/** Whether one downloaded window holds a user message, without keeping its state. */
function containsUserMessage(raw: string): boolean {
  const probe: TurnState = { userSeen: false, userAt: null, agentAt: null, agentText: null };
  scanLastTurn(raw, probe);
  return probe.userSeen;
}

/**
 * Who spoke last, read from the end of the transcript (Story 11.1). The state is
 * the last user message plus the agent's last written reply after it: the agent
 * wrote last means it is the user's turn, the user wrote last means the agent is
 * still working (or has not started). Null when no user message was typed.
 *
 * Reads the last {@link LAST_TURN_TAIL_BYTES} first and walks back only as far
 * as the newest user message, so a panel over every project does not reread
 * whole transcripts. Unreadable files are the caller's to handle.
 */
export async function readLastTurn(file: string): Promise<LastTurn | null> {
  const handle = await open(file, "r");
  try {
    const { size } = await handle.stat();
    if (size === 0) return null;
    // Windows are kept newest first, then joined in file order and decoded once,
    // so a multi-byte character split by a window edge is still intact.
    const windows: Buffer[] = [];
    let end = size;
    let start = 0;
    let found = false;
    let text = "";
    while (end > 0) {
      start = Math.max(0, end - LAST_TURN_TAIL_BYTES);
      windows.unshift(await readRange(handle, start, end));
      text = Buffer.concat(windows).toString("utf8");
      // A window that starts mid-file starts mid-line; that line is complete in
      // the newer window it continues into, so only the first partial goes.
      if (start > 0) {
        const newline = text.indexOf("\n");
        text = newline === -1 ? "" : text.slice(newline + 1);
      }
      if (containsUserMessage(text)) {
        found = true;
        break;
      }
      end = start;
    }
    // No user message anywhere: a transcript the user never typed into.
    if (!found) return null;
    const state: TurnState = { userSeen: false, userAt: null, agentAt: null, agentText: null };
    scanLastTurn(text, state);
    if (state.userAt === null) return null;
    if (state.agentAt === null) return { speaker: "user", at: state.userAt, text: "" };
    return { speaker: "agent", at: state.agentAt, text: state.agentText ?? "" };
  } finally {
    await handle.close();
  }
}

/**
 * Whether the transcript shows the agent reading a handoff file (Story 8.6): a
 * cheap hint that this session continues earlier work. A tool-use line names the
 * tool before its input, so `Read` and `file_path` share the line.
 */
export async function readsHandoff(file: string): Promise<boolean> {
  const lines = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
  for await (const raw of lines) {
    if (!raw.includes("handoff")) continue;
    if (/"name":"(?:Read|Bash)"/.test(raw) && /"file_path":"[^"]*handoff[^"]*"/i.test(raw))
      return true;
    if (/"name":"Bash"[^}]*"command":"[^"]*handoff/i.test(raw)) return true;
  }
  return false;
}

/** Reads the user's messages from a transcript, in order. */
export async function readUserMessages(file: string): Promise<UserMessage[]> {
  return (await readConversation(file)).map(({ id, at, text, resumed }) => ({
    id,
    at,
    text,
    ...(resumed ? { resumed: true } : {}),
  }));
}

/**
 * Counts `type: "user"` lines in a transcript, whether or not they are messages
 * (tool results, injected text and shell lines are user lines too). When this is
 * above zero and `readUserMessages` finds none, Claude Code's format changed under
 * us rather than the user having written nothing.
 */
export async function countUserLines(file: string): Promise<number> {
  let count = 0;
  const lines = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
  for await (const raw of lines) {
    if (!raw.includes('"type":"user"')) continue;
    try {
      if ((JSON.parse(raw) as { type?: unknown }).type === "user") count += 1;
    } catch {}
  }
  return count;
}

/** Up to this many characters of a message go to the agent. */
export const EXCERPT_LENGTH = 300;

const PASTE = /<pasted_content[^>]*>([\s\S]*?)<\/pasted_content[^>]*>/g;

/** Text on one line, whitespace collapsed. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * A short, single-line view of a message for the agent to title it. System
 * reminders are dropped; a paste is named by its first words, unless the
 * message is nothing but pastes, which then show as far as the limit allows.
 */
export function excerpt(text: string, max = EXCERPT_LENGTH): string {
  const without = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, " ");
  const own = oneLine(without.replace(PASTE, " "));
  const cleaned =
    own === ""
      ? `[pasted] ${oneLine([...without.matchAll(PASTE)].map((m) => m[1]).join(" "))}`
      : oneLine(
          without.replace(PASTE, (_, body: string) => {
            const first = oneLine(body).slice(0, 80);
            return ` [pasted: ${first}…] `;
          }),
        );
  return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max - 1)}…`;
}
