import { createReadStream } from "node:fs";
import { access, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { ChatTurn, ToolUse, UserMessage } from "../types.js";

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
    tools: { ...turn.tools, files: turn.tools.files.map(relative) },
  };
}

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

/** A `/clear` written by the user or by the CLI as a local command. */
const CLEAR = /<command-name>\s*\/clear\s*<\/command-name>/;

/** The uuid chain fields, read from every line without parsing it. */
const LINE_UUID = /"uuid":"([^"]+)"/;
const LINE_PARENT = /"parentUuid":"([^"]+)"/;

/** Records the agent's text and tool calls of one assistant line on the current turn. */
function addAssistant(turn: ChatTurn, line: Record<string, unknown>): void {
  if (line.isSidechain) return;
  const content = (line.message as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (block?.type === "text" && typeof block.text === "string" && block.text.trim() !== "") {
      turn.replies.push(block.text);
    } else if (block?.type === "tool_use") {
      const path = (block.input as { file_path?: unknown } | undefined)?.file_path;
      if (block.name === "Bash") turn.tools.commands += 1;
      else if (EDIT_TOOLS.has(block.name) && typeof path === "string") {
        if (!turn.tools.files.includes(path)) turn.tools.files.push(path);
      } else turn.tools.other += 1;
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
