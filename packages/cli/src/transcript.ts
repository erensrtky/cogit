import { createReadStream } from "node:fs";
import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { claudeConfigDir } from "./view/transcripts.js";

/** One message the user typed, numbered in transcript order. */
export interface UserMessage {
  /** `m1`, `m2`, …: the node id the message gets on the map. */
  id: string;
  /** When the user sent it, from the transcript. */
  at: string;
  text: string;
  /** A `/clear`, a resume or a new process came between this message and the previous one. */
  resumed?: boolean;
  /** The agent ran `git commit` between the previous message and this one. */
  commitBetween?: boolean;
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

/** What the agent did with tools during one turn, without their output. */
export interface ToolUse {
  /** Shell commands run. */
  commands: number;
  /** Files written or edited, as the agent named them. */
  files: string[];
  /** Any other tool calls (reads, searches, web, subagents…). */
  other: number;
}

/** One user message and what the agent wrote back before the next one. */
export interface ChatTurn extends UserMessage {
  /** The transcript's uuid for the user line; the key of the conversation store. */
  uuid?: string;
  /** The agent's written replies, in order; tool output never appears here. */
  replies: string[];
  tools: ToolUse;
}

/** The longest text one chat entry keeps on the map; the rest is cut with a note. */
export const CHAT_TEXT_LIMIT = 20_000;

function capped(text: string): string {
  if (text.length <= CHAT_TEXT_LIMIT) return text;
  return `${text.slice(0, CHAT_TEXT_LIMIT)}\n\n[… ${text.length - CHAT_TEXT_LIMIT} more characters not shown]`;
}

/**
 * A turn as the map shows it: reminders the harness injected are dropped, paste
 * markers become a plain label, very long text is cut, and edited files are shown
 * relative to the project (or the worktree the session ran in).
 */
export function displayTurn(turn: ChatTurn, roots: string[]): ChatTurn {
  const text = turn.text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
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

/**
 * `git commit`, also behind options like `-C dir`. A hint, not a decision: a
 * command that merely mentions a commit (`git log --grep commit`) may match.
 */
const GIT_COMMIT = /(?:^|[\s;&|])git(?:\s+[^\s;&|]+)*\s+commit\b/;

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
  let pendingCommit = false;
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
      if (current && hasCommit(line)) pendingCommit = true;
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
      ...(!first && pendingCommit ? { commitBetween: true } : {}),
    });
    pendingResume = false;
    pendingCommit = false;
  }
  return turns;
}

/** Whether an assistant line ran a `git commit`. */
function hasCommit(line: Record<string, unknown>): boolean {
  if (line.isSidechain) return false;
  const content = (line.message as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(content)) return false;
  return content.some(
    (block) =>
      block?.type === "tool_use" &&
      block.name === "Bash" &&
      typeof block.input?.command === "string" &&
      GIT_COMMIT.test(block.input.command),
  );
}

/** Reads the user's messages from a transcript, in order. */
export async function readUserMessages(file: string): Promise<UserMessage[]> {
  return (await readConversation(file)).map(({ id, at, text, resumed, commitBetween }) => ({
    id,
    at,
    text,
    ...(resumed ? { resumed: true } : {}),
    ...(commitBetween ? { commitBetween: true } : {}),
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
  const withoutReminders = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, " ");
  const own = oneLine(withoutReminders.replace(PASTE, " "));
  const cleaned =
    own === ""
      ? `[pasted] ${oneLine([...withoutReminders.matchAll(PASTE)].map((m) => m[1]).join(" "))}`
      : oneLine(
          withoutReminders.replace(PASTE, (_, body: string) => {
            const first = oneLine(body).slice(0, 80);
            return ` [pasted: ${first}…] `;
          }),
        );
  return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max - 1)}…`;
}
