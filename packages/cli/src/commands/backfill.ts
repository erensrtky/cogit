import { spawn } from "node:child_process";
import { type ChatTurn, defaultAgent } from "../agents/index.js";
import { CliError, type Io } from "../io.js";
import { hashTurns, isRecorded, type SessionMessage, upgradeSessionIds } from "../messages.js";
import { LineageNodeInput, type Session, Status } from "../schema/session.js";
import { applyEvents, readEvents } from "../store/events.js";
import { LockBusyError, withLock } from "../store/lock.js";
import { projectPaths } from "../store/paths.js";
import { resolveProjectRoot } from "../store/root.js";
import { loadConfig, loadProject, loadSession } from "../store/stores.js";
import { closeSession } from "./close.js";
import { sessionWrite } from "./session.js";

/** How much of one message or reply goes into the prompt. */
const TEXT_LIMIT = 1500;

/** Keeps the prompt finite; the summary only needs the gist of a long paste. */
function cut(text: string): string {
  return text.length <= TEXT_LIMIT ? text : `${text.slice(0, TEXT_LIMIT)}…`;
}

/** One unrecorded message with the agent's replies and tool counts after it. */
function turnBlock(turn: ChatTurn): string {
  const agent =
    turn.replies.length === 0 ? "(no written reply)" : turn.replies.map(cut).join("\n\n");
  const { commands, other } = turn.tools;
  const tools = `${commands} command(s), ${turn.tools.files.length} file(s) edited, ${other} other tool call(s)`;
  return [
    `### ${turn.label ?? turn.id} · ${turn.at}`,
    `USER: ${cut(turn.text)}`,
    `AGENT: ${agent}`,
    `TOOLS: ${tools}`,
    ...actionLines(turn),
  ].join("\n");
}

/**
 * What the agent actually did in a turn, beyond its words: the questions it
 * asked with their options, the files it edited and its steps. The recorder
 * finds the agent's choices and the topic of a turn in these.
 */
export function actionLines(turn: ChatTurn): string[] {
  const lines: string[] = [];
  const asks = turn.tools.asks ?? [];
  if (asks.length > 0) lines.push(`ASKED THE USER: ${asks.slice(0, 5).join(" ; ")}`);
  if (turn.tools.files.length > 0)
    lines.push(`FILES EDITED: ${turn.tools.files.slice(0, 12).join(", ")}`);
  const steps = turn.tools.steps ?? [];
  if (steps.length > 0) lines.push(`STEPS: ${steps.slice(0, 15).join(" ; ")}`);
  return lines;
}

function recordPart(record: Session | undefined): string {
  if (!record || record.nodes.length === 0) return "The record has no nodes yet.";
  const lines = record.nodes.map(
    (node) => `- ${node.id} (${node.kind}) parent=${node.parent ?? "null"}: ${node.title}`,
  );
  return `The record so far (reuse these ids; a parent is an earlier message):\n${lines.join("\n")}`;
}

/** Who runs the side model and how much of the record it may write (Story 12.1). */
export type RecordMode = "agent" | "mixed" | "side";

/**
 * The recording rules, in line with `skills/record/SKILL.md`. In `mixed` mode
 * this is the periodic side run: messages, titles, parents and user decisions
 * only, because the main agent owns the status, the branch summaries and its
 * own decisions.
 */
function rules(language: string, messageSummaries: boolean, recorder: RecordMode): string {
  const writing = language === "auto" ? "the conversation's language" : language;
  const lines = [
    "Rules (from the cogit lineage skill):",
    '- Send one "message" node for every message below, with the id exactly as given in its heading (m1, m2, …); skip none, even a short "ok". Never make up an id.',
    "- The session title: when the record's title is empty, send one (a few words on what the session is about); a session without one shows only its id on the map.",
    `- kind is "message". title: a few words in the user's own wording.${
      messageSummaries ? " summary: one or two sentences on what came of it." : ""
    }`,
    "- parent: an earlier message id, or null when the message starts a new thread; never a topic or phase node.",
    "- Back to an older thread: that message is the parent and the previous one goes in links (at most 5). Unsure: use the previous message.",
    '- When the message itself made a decision (the user asked for it, picked an option or approved a proposal): decidedBy ("user" or "agreed"), the reason in why, and the options not taken in alternatives [{"option": "...", "why": "..."}].',
    "- alternatives lists only options someone actually named in the conversation before the decision. Never infer one from the decision, never list the current state as an option, and leave the field out when none was named. Its why says what the conversation said: no durations, sizes or reasons it does not contain. An option only postponed was not rejected.",
    '- decidedBy "agreed" needs the user approving the proposal in this message. A proposal the user has not answered is not a decision.',
    '- The agent\'s work belongs inside the message node that caused it, never in nodes of its own: work (short items), agentDecisions ([{"title": "...", "why": "...", "alternatives": [...]}]) only for technical choices with a reason — never for proposals or work items — commits (short hashes) and files (a few paths).',
    "- Write a branch summary ({title, asked, outcome, open}) on the first message of a branch when the branch ends.",
    '- Never send "at"; the CLI takes each message\'s time from the transcript.',
    "- Replace the whole status (goal, done, pending [{text, needsUser}], next) when it changed; otherwise leave it out. Pending is the work still open, one item per ask in the user's words, never a checklist of commands: a release and the restart it needs are one item, and a step that serves nothing is dropped.",
    "- Record decisions and reasons, never secrets, credentials, personal data, file contents or command output.",
    `- Write titles and text in ${writing}; JSON keys stay in English.`,
  ];
  if (recorder === "mixed") {
    lines.push(
      "- This is a periodic background run: send message nodes with their titles, parents, user decisions and the agent's technical decisions (agentDecisions), and the session title when it is empty. Do not send status or branch summaries; the main agent owns those, and it may correct the decisions you write.",
    );
  }
  return lines.join("\n");
}

/**
 * The one prompt the headless catch-up gets: the skill's record rules, the
 * record so topics can be reused, and the unrecorded messages themselves.
 */
export function catchUpPrompt(
  turns: ChatTurn[],
  record: Session | undefined,
  sessionId: string,
  language: string,
  messageSummaries = false,
  recorder: RecordMode = "agent",
): string {
  return [
    "You add the missing part of a cogit lineage record, a map of the user's messages.",
    "Below are the user's messages that have no node yet, each followed by the agent's written replies and what the agent did: the questions it asked the user with their options, the files it edited and its steps. Use these to find the agent's technical decisions and what it rejected.",
    "",
    rules(language, messageSummaries, recorder),
    "",
    recordPart(record),
    "",
    "Messages to record:",
    turns.map(turnBlock).join("\n\n"),
    "",
    `Return only one JSON object, no commentary and no code fences: {"sessionId": ${JSON.stringify(
      sessionId,
    )}, "nodes": [...], "status": {...}}`,
  ].join("\n");
}

/** The text inside Claude Code's `--output-format json` envelope. */
export function resultText(stdout: string): string {
  let envelope: unknown;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    throw new CliError("claude did not print valid JSON");
  }
  const result = (envelope as { result?: unknown }).result;
  if (typeof result !== "string") throw new CliError("claude returned no result text");
  return result;
}

/** The agent's answer as a JSON object, tolerating a code fence around it. */
export function agentRecord(text: string): Record<string, unknown> {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new CliError("the agent did not return a JSON record");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new CliError("the agent did not return a JSON object");
  return parsed as Record<string, unknown>;
}

/**
 * A small model writes `null` for a note it has nothing for (`"why": null`).
 * The schema wants such a field left out, and one null would fail the whole
 * write, so they are dropped; a node's `parent: null` (a root) stays.
 */
export function withoutNulls(record: Record<string, unknown>): Record<string, unknown> {
  // Any null at the top is a missing field.
  const top = Object.fromEntries(Object.entries(record).filter(([, value]) => value !== null));
  if (!Array.isArray(top.nodes)) return top;
  return {
    ...top,
    nodes: top.nodes.map((node) =>
      typeof node === "object" && node !== null
        ? Object.fromEntries(
            Object.entries(node).filter(([key, value]) => value !== null || key === "parent"),
          )
        : node,
    ),
  };
}

/** The headless agent must not fire our own hooks or leave a transcript. */
export function headlessEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...process.env, ...env, COGIT_DISABLE: "1" };
}

function claudeBin(): string {
  return process.platform === "win32" ? "claude.cmd" : "claude";
}

/** How long one headless run may take; a closing pass usually needs under two minutes. */
export const CLAUDE_TIMEOUT_MS = 5 * 60_000;

/**
 * Runs the agent once, headless and without session persistence, with the prompt
 * on stdin. Resolves with stdout; a missing binary, a failed run or one that
 * outlives the time limit rejects, so a hung run lands in the log instead of
 * waiting until the machine shuts down. `COGIT_CLAUDE_TIMEOUT_MS` overrides the limit.
 */
export function runClaude(prompt: string, model: string, env: NodeJS.ProcessEnv): Promise<string> {
  const limit = Number(env.COGIT_CLAUDE_TIMEOUT_MS) || CLAUDE_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const child = spawn(
      claudeBin(),
      [
        "-p",
        "--safe-mode",
        "--no-session-persistence",
        "--model",
        model,
        "--output-format",
        "json",
      ],
      { env: headlessEnv(env), stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, limit);
    // The child may exit before reading the prompt; that write error is not ours.
    child.stdin.on("error", () => {});
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      out += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      err += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new CliError(`could not run claude: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut)
        reject(new CliError(`claude did not answer within ${Math.round(limit / 1000)} s`));
      else if (code === 0) resolve(out);
      else reject(new CliError(`claude exited with ${code}: ${err.trim() || "no output"}`));
    });
    child.stdin.end(prompt);
  });
}

/** The user messages of a session that have no node yet, oldest first. */
async function missingTurns(
  root: string,
  sessionId: string,
  env: NodeJS.ProcessEnv,
): Promise<SessionMessage[]> {
  const agent = defaultAgent();
  const file = await agent.findTranscript(sessionId, env);
  if (!file) return [];
  const turns = hashTurns(sessionId, await agent.readConversation(file));
  const loaded = await loadSession(root, sessionId);
  let recorded = new Set<string>();
  if (loaded.found && loaded.ok) {
    const upgraded = upgradeSessionIds(loaded.data, turns);
    const events = await readEvents(root, sessionId);
    recorded = new Set(applyEvents(upgraded.nodes, events).map((node) => node.id));
  }
  return turns.filter((turn) => !isRecorded(recorded, turn));
}

/**
 * `cogit backfill <session-id> --tail`: records the user messages a session
 * never got to, by running the agent headless with the skill's rules and passing
 * its answer through `session write` (validation, redaction, stamping, build).
 * A busy session lock means another catch-up already runs, which is not an error.
 */
/**
 * The answer, trimmed to what the record accepts. A malformed status or summary
 * must not cost the session its whole write, and in mixed mode the side model
 * does not own the status, the branch summaries or the agent's decisions, so
 * they are dropped even when it sends them.
 */
export function writableAnswer(
  answer: Record<string, unknown>,
  recorder: string,
): { payload: Record<string, unknown>; dropped: number } {
  const out: Record<string, unknown> = { ...answer };
  const soleOwner = recorder !== "mixed";
  if (!soleOwner) delete out.status;
  let dropped = 0;
  // A null inside the status is a missing field (`next: null` means nothing to do next).
  if (out.status !== undefined) out.status = stripNulls(out.status);
  if (out.status !== undefined && !Status.safeParse(out.status).success) {
    delete out.status;
    dropped += 1;
  }
  if (Array.isArray(out.nodes)) {
    const kept: unknown[] = [];
    for (const node of out.nodes) {
      const fixed = ownedFields(summaryAsText(node), soleOwner);
      dropped += fixed.removed;
      const salvaged = withoutBadFields(fixed.node);
      if (salvaged === undefined) {
        dropped += 1;
        continue;
      }
      kept.push(salvaged.node);
      dropped += salvaged.removed;
    }
    out.nodes = kept;
  }
  return { payload: out, dropped };
}

/** What a node cannot do without; a bad one here loses the node. */
const REQUIRED_FIELDS = new Set(["id", "kind", "title"]);

/**
 * A node with its malformed optional fields taken out (a `work` item over the
 * length limit, an alternative without an option): one bad field must not cost
 * the message its whole record. Undefined when a required field is bad.
 */
function withoutBadFields(node: unknown): { node: unknown; removed: number } | undefined {
  if (typeof node !== "object" || node === null) return undefined;
  let current = { ...(node as Record<string, unknown>) };
  let removed = 0;
  for (let attempt = 0; attempt < 20; attempt++) {
    const parsed = LineageNodeInput.safeParse(current);
    if (parsed.success) return { node: current, removed };
    const bad = new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")));
    if ([...bad].some((key) => key === "" || REQUIRED_FIELDS.has(key))) return undefined;
    current = Object.fromEntries(Object.entries(current).filter(([key]) => !bad.has(key)));
    removed += bad.size;
  }
  return undefined;
}

/** Drops every null, so the schema's defaults fill the gaps. */
function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== null)
        .map(([key, v]) => [key, stripNulls(v)]),
    );
  }
  return value;
}

/** A summary the model wrote as an object keeps its text; anything else is left for validation. */
function summaryAsText(node: unknown): unknown {
  if (typeof node !== "object" || node === null) return node;
  const { summary, ...rest } = node as Record<string, unknown>;
  if (summary === undefined || typeof summary === "string") return node;
  const text =
    typeof summary === "object" && summary !== null
      ? (summary as Record<string, unknown>).text
      : undefined;
  return typeof text === "string" ? { ...rest, summary: text } : rest;
}

/**
 * In mixed mode the side model may not write a branch summary: it is left out,
 * and the rest of the node is kept. The agent's decisions it may write: the
 * side model records most messages before the agent's turn comes, and the
 * agent only sees the ones still unrecorded, so leaving them to the agent left
 * most messages without any. The agent can still replace what it writes.
 */
function ownedFields(node: unknown, soleOwner: boolean): { node: unknown; removed: number } {
  if (soleOwner || typeof node !== "object" || node === null) return { node, removed: 0 };
  const { branch, ...rest } = node as Record<string, unknown>;
  return branch === undefined ? { node, removed: 0 } : { node: rest, removed: 1 };
}

export async function backfillTail(
  dir: string,
  sessionId: string,
  io: Io,
  opts: { close?: boolean } = {},
): Promise<void> {
  const { root } = await resolveProjectRoot(dir);
  const project = await loadProject(root);
  if (!project.found) throw new CliError(`${root} is not initialized; run \`cogit init\` first`);
  if (!project.ok) throw new CliError(project.error);

  let turns: ChatTurn[] | undefined;
  try {
    turns = await withLock(
      projectPaths(root).lock(`session-${sessionId}`),
      () => missingTurns(root, sessionId, io.env),
      { timeoutMs: 0 },
    );
  } catch (err) {
    if (!(err instanceof LockBusyError)) throw err;
    io.out(`the side model is already recording ${sessionId}`);
    return;
  }
  if (turns.length === 0) {
    io.out(`session ${sessionId} has nothing left to record`);
    if (opts.close === true) await closeSession(root, sessionId, io);
    return;
  }

  const config = await loadConfig(io.env);
  const loaded = await loadSession(root, sessionId);
  const record = loaded.found && loaded.ok ? loaded.data : undefined;
  const prompt = catchUpPrompt(
    turns,
    record,
    sessionId,
    config.language,
    config.messageSummaries,
    config.recorder,
  );
  const stdout = await runClaude(prompt, config.sideModel, io.env);
  const { payload, dropped } = writableAnswer(
    withoutNulls(agentRecord(resultText(stdout))),
    config.recorder,
  );
  if (dropped > 0) io.warn(`dropped ${dropped} malformed field(s) from the catch-up answer`);
  // Story 12.1: a side run fills empty fields and new nodes; it never rewrites
  // what the main agent wrote.
  await sessionWrite({ dir: root, by: "side" }, io, async () =>
    JSON.stringify({ ...payload, sessionId }),
  );
  // At the session end the closing pass reads the whole session once it is all recorded.
  if (opts.close === true) await closeSession(root, sessionId, io);
  // The session end wrote the last messages after the last code commit; auto
  // mode commits exactly those record files now (Story 9.3).
}
