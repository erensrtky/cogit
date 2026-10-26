import { spawn } from "node:child_process";
import { type ChatTurn, defaultAgent } from "../agents/index.js";
import { CliError, type Io } from "../io.js";
import { hashTurns, isRecorded, type SessionMessage, upgradeSessionIds } from "../messages.js";
import type { Session } from "../schema/session.js";
import { maybeAutoCommit } from "../session-git.js";
import { applyEvents, readEvents } from "../store/events.js";
import { LockBusyError, withLock } from "../store/lock.js";
import { projectPaths } from "../store/paths.js";
import { resolveProjectRoot } from "../store/root.js";
import { loadConfig, loadProject, loadSession } from "../store/stores.js";
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
  ].join("\n");
}

function recordPart(record: Session | undefined): string {
  if (!record || record.nodes.length === 0) return "The record has no nodes yet.";
  const lines = record.nodes.map(
    (node) => `- ${node.id} (${node.kind}) parent=${node.parent ?? "null"}: ${node.title}`,
  );
  return `The record so far (reuse these topic ids):\n${lines.join("\n")}`;
}

function rules(language: string, messageSummaries: boolean): string {
  const writing = language === "auto" ? "the conversation's language" : language;
  return [
    "Rules (from the cogit lineage skill):",
    '- Send one "message" node for every message below, with the id exactly as given; skip none, even a short "ok".',
    `- kind is "message". title: a few words in the user's own wording.${
      messageSummaries ? " summary: one or two sentences on what came of it." : ""
    }`,
    '- parent: the id of the topic it belongs to. Reuse a topic id from the record below; otherwise add a "phase" topic with a short slug id and parent null.',
    '- When the message itself made a decision (the user asked for it, picked an option or approved a proposal): decidedBy ("user" or "agreed"), the reason in why, and the options not taken in alternatives [{"option": "...", "why": "..."}].',
    '- The agent\'s work goes inside the message node that caused it, never in nodes of its own: work (short items), agentDecisions ([{"title": "...", "why": "...", "alternatives": [...]}]), commits (short hashes) and files (a few paths).',
    '- Never send "at"; the CLI takes each message\'s time from the transcript.',
    "- Replace the whole status (goal, done, pending [{text, needsUser}], next) when it changed; otherwise leave it out.",
    "- Record decisions and reasons, never secrets, credentials, personal data, file contents or command output.",
    `- Write titles and text in ${writing}; JSON keys stay in English.`,
  ].join("\n");
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
): string {
  return [
    "You add the missing part of a cogit lineage record, a map of the user's messages.",
    "Below are the user's messages that have no node yet, each followed by the agent's written replies and a count of its tool calls.",
    "",
    rules(language, messageSummaries),
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

/** The headless agent must not fire our own hooks or leave a transcript. */
export function headlessEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...process.env, ...env, COGIT_DISABLE: "1" };
}

function claudeBin(): string {
  return process.platform === "win32" ? "claude.cmd" : "claude";
}

/**
 * Runs the agent once, headless and without session persistence, with the prompt
 * on stdin. Resolves with stdout; a missing binary or a failed run rejects.
 */
function runClaude(prompt: string, model: string, env: NodeJS.ProcessEnv): Promise<string> {
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
    // The child may exit before reading the prompt; that write error is not ours.
    child.stdin.on("error", () => {});
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      out += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      err += chunk;
    });
    child.on("error", (error) => {
      reject(new CliError(`could not run claude: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) resolve(out);
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
export async function backfillTail(dir: string, sessionId: string, io: Io): Promise<void> {
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
    io.out(`catch-up already running for ${sessionId}`);
    return;
  }
  if (turns.length === 0) {
    io.out(`session ${sessionId} has nothing to catch up`);
    // Story 9.3: `recordCommit: auto` still commits what an earlier update wrote.
    await maybeAutoCommit(root, sessionId, io.env);
    return;
  }

  const config = await loadConfig(io.env);
  const loaded = await loadSession(root, sessionId);
  const record = loaded.found && loaded.ok ? loaded.data : undefined;
  const prompt = catchUpPrompt(turns, record, sessionId, config.language, config.messageSummaries);
  const stdout = await runClaude(prompt, config.catchUpModel, io.env);
  const payload = { ...agentRecord(resultText(stdout)), sessionId };
  await sessionWrite({ dir: root }, io, async () => JSON.stringify(payload));
  // The session end wrote the last messages after the last code commit; auto
  // mode commits exactly those record files now (Story 9.3).
  await maybeAutoCommit(root, sessionId, io.env);
}
