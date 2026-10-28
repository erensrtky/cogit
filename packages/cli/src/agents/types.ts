/**
 * The boundary between cogit's own record format and the AI agent it records.
 * Everything here is agent-neutral; the only implementation today is Claude
 * Code (`agents/claude/`). A second agent adds a folder and an entry in
 * {@link AGENTS} (`agents/index.ts`), so no caller imports an implementation
 * directly.
 */

/** The agent recorded when nothing else is chosen; `session.agent` for new records. */
export const DEFAULT_AGENT = "claude-code";

/** One message the user typed, numbered in transcript order. */
export interface UserMessage {
  /** `m1`, `m2`, …: the node id the message gets on the map. */
  id: string;
  /** When the user sent it, from the transcript. */
  at: string;
  text: string;
  /** A `/clear`, a resume or a new process came between this message and the previous one. */
  resumed?: boolean;
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
  /** The message's stable id (`h…`, Story 8.5); set once the session id is known. */
  hash?: string;
  /** The display label (`m1`, `m2`, …); set once the session id is known. */
  label?: string;
  /** The agent's written replies, in order; tool output never appears here. */
  replies: string[];
  tools: ToolUse;
}

/**
 * How a transcript ends (Story 11.1): the deterministic "your turn" signal.
 * The agent wrote after the newest user message, or that message is still
 * waiting for an answer. Who asked what is never guessed from the text.
 */
export interface LastTurn {
  /** `agent` when the agent wrote after the newest user message; else `user`. */
  speaker: "agent" | "user";
  /** Time of the last agent line (`agent`) or of the newest user message (`user`). */
  at: string;
  /** The agent's last written text, verbatim (empty for a `user` tail). */
  text: string;
}

/** The fields of a hook payload cogit relies on, however the agent names them. */
export interface HookInput {
  session_id: string;
  cwd?: string | undefined;
  /** Where the agent keeps the session's transcript (UserPromptSubmit and friends). */
  transcript_path?: string | undefined;
  stop_hook_active?: boolean | undefined;
  /** SessionStart only: `startup`, `resume`, `clear` or `compact`. */
  source?: string | undefined;
  /** PreToolUse only: the tool about to run (`Edit`, `Write`, `MultiEdit`, …). */
  tool_name?: string | undefined;
  /**
   * PreToolUse only: the tool's arguments. `file_path` names the file for the
   * write tools; other tools pass whatever they take.
   */
  tool_input?: Record<string, unknown> | undefined;
}

/** A file cogit changed and the backup it left first. */
export interface FileChange {
  file: string;
  backup?: string;
}

/**
 * What cogit needs from an agent: where its transcripts are and how to read
 * them, how its hooks deliver a payload and receive context, and how to let the
 * agent run the record skill without asking every time.
 */
export interface AgentAdapter {
  /** The value stored in a session record's `agent` field. */
  readonly name: string;
  /** How a message asks the agent to run the record skill, e.g. `/cogit:record`. */
  readonly skill: string;
  /** The permission rule that allows the skill without a prompt. */
  readonly skillRule: string;
  /** The shell command that installs the plugin. */
  readonly installCommand: string;
  /** Env var the agent sets to the project directory for hooks. */
  readonly projectDirEnv: string;
  /** Env var that points at the installed plugin (skill text uses it). */
  readonly pluginRootEnv: string;
  /** Env var the skill and commands use for the current session id. */
  readonly sessionIdEnv: string;
  /**
   * Env var the agent sets in a shell it starts, naming the session that shell
   * belongs to. `prepare-commit-msg` reads it so a commit carries its own
   * session's message even when another session shares the working tree.
   */
  readonly commitSessionEnv: string;
  /** The agent's own default transcript retention, in days. */
  readonly defaultRetention: number;

  /** Where the agent keeps its state on this machine. */
  configDir(env: NodeJS.ProcessEnv): string;
  /** Locate one session's transcript; null when there is none. */
  findTranscript(sessionId: string, env: NodeJS.ProcessEnv): Promise<string | null>;
  /** Every transcript on this machine, by session id. */
  collectTranscripts(env: NodeJS.ProcessEnv): Promise<Map<string, string>>;
  /** Session ids that still have a transcript. */
  collectTranscriptIds(env: NodeJS.ProcessEnv): Promise<Set<string>>;
  /** Each message the user typed, in order, with the agent's replies and tool counts. */
  readConversation(file: string): Promise<ChatTurn[]>;
  /** Whether the transcript shows the agent reading a handoff file (Story 8.6). */
  readsHandoff(file: string): Promise<boolean>;
  /**
   * Who spoke last (Story 11.1), read from the end of the transcript. Null when
   * no user message was ever typed there.
   */
  readLastTurn(file: string): Promise<LastTurn | null>;
  /** Counts user-role lines, to tell "no messages" from "unreadable format". */
  countUserLines(file: string): Promise<number>;
  /** A turn as the map shows it: injected text removed, long text cut, paths relative. */
  displayTurn(turn: ChatTurn, roots: string[]): ChatTurn;
  /** A short, single-line view of a message for the agent to title it. */
  excerpt(text: string, max?: number): string;
  /** Parses a hook's stdin; undefined when it is not a payload cogit understands. */
  parseHookInput(stdin: string): HookInput | undefined;
  /** Hook output that adds context for the agent, in the agent's own protocol. */
  additionalContext(event: string, text: string): Record<string, unknown>;
  /** Days the agent keeps transcripts, undefined when the setting is unreadable. */
  readRetention(env: NodeJS.ProcessEnv): Promise<number | undefined>;
  /** Whether the agent lists the plugin as installed; undefined when unreadable. */
  readPluginInstalled(env: NodeJS.ProcessEnv): Promise<boolean | undefined>;
  /** Whether the record skill is already allowed; undefined when unreadable. */
  readSkillAllowed(env: NodeJS.ProcessEnv): Promise<boolean | undefined>;
  /** Sets the transcript retention in the agent's settings. */
  setRetention(days: number, env: NodeJS.ProcessEnv, stamp: string): Promise<FileChange>;
  /** Allows the record skill in the agent's settings. */
  allowSkill(env: NodeJS.ProcessEnv, stamp: string): Promise<FileChange>;
  /** Whether the project's shared settings enable the plugin and guard; undefined when unreadable. */
  readProjectSetup(root: string): Promise<boolean | undefined>;
  /** Enables the plugin for the whole project and adds the guard against sessions without it. */
  writeProjectSetup(root: string): Promise<FileChange>;
  /** Updates an outdated guard or marketplace an earlier setup wrote; the file when it changed. */
  refreshProjectSetup(root: string): Promise<string | undefined>;
  /** Records that this session started with the plugin loaded; the guard looks for it. */
  markLive(sessionId: string): Promise<void>;
}
