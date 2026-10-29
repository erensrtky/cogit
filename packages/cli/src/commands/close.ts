import { type ChatTurn, defaultAgent } from "../agents/index.js";
import type { Io } from "../io.js";
import { hashTurns, upgradeSessionIds } from "../messages.js";
import { parseMessageRef } from "../schema/common.js";
import { BranchSummary, type Session, Status } from "../schema/session.js";
import { applyEvents, readEvents } from "../store/events.js";
import { loadConfig, loadSession } from "../store/stores.js";
import { actionLines, agentRecord, resultText, runClaude } from "./backfill.js";
import { type CandidateSession, candidateSessions, sessionWrite } from "./session.js";

/**
 * The session-end pass (the "closing link"). One side-model call over the whole
 * session: it splits the session into threads and says what each grew from;
 * the parents follow from that in code, so the model never has to pick a parent
 * id per message (which it does poorly: it defaults to "the previous one"). The
 * same call writes the branch summaries (L1) and the one line on where the
 * session left off (L0).
 */

/** One thread as the model returns it. */
export interface Thread {
  name: string;
  /** Ranges of labels, e.g. "m7-m15, m19-m33": a thread can pause for a detour. */
  messages: string;
  /** The message the thread starts from; null for a brand-new start. */
  from?: string | null;
  asked?: string;
  outcome?: string;
  open?: string;
}

/** How much of a message and a reply the pass reads: the gist is enough to tell topics apart. */
const USER_LIMIT = 400;
const REPLY_LIMIT = 220;

function clip(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}

/** The labels a range list names, in the order given, limited to the known ones. */
export function threadMembers(spec: string, known: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const match of spec.matchAll(/m(\d+)(?:\s*[-–]\s*m?(\d+))?/g)) {
    const from = Number(match[1]);
    const to = match[2] === undefined ? from : Number(match[2]);
    for (let n = from; n <= Math.min(to, from + 10_000); n += 1)
      if (known.has(`m${n}`)) out.push(`m${n}`);
  }
  return out;
}

/**
 * Parents from threads, by label, for every message after the first:
 * - the same thread as the previous message: the previous message;
 * - back to a thread seen before: that thread's latest message;
 * - the first message of a new thread: its `from` when that is an earlier
 *   message, a root when `from` is null, else the previous message.
 * A message no thread names keeps the previous message.
 */
export function deriveParents(order: string[], threads: Thread[]): Map<string, string | null> {
  const known = new Set(order);
  const threadOf = new Map<string, number>();
  threads.forEach((thread, index) => {
    for (const label of threadMembers(thread.messages, known))
      if (!threadOf.has(label)) threadOf.set(label, index);
  });
  const position = new Map(order.map((label, at) => [label, at]));
  const latest = new Map<number, string>();
  const parents = new Map<string, string | null>();
  order.forEach((label, at) => {
    const thread = threadOf.get(label);
    if (at > 0) {
      const previous = order[at - 1] as string;
      let parent: string | null = previous;
      if (thread !== undefined && thread !== threadOf.get(previous)) {
        const seen = latest.get(thread);
        if (seen !== undefined) parent = seen;
        else {
          const from = threads[thread]?.from;
          if (from === null) parent = null;
          else if (typeof from === "string") {
            const target = from.split(":").at(-1) ?? "";
            const targetAt = position.get(target);
            if (targetAt !== undefined && targetAt < at) parent = target;
          }
        }
      }
      parents.set(label, parent);
    }
    if (thread !== undefined) latest.set(thread, label);
  });
  return parents;
}

/** A branch summary within the schema's limits, or undefined when the model left it thin. */
function summaryOf(thread: Thread): BranchSummary | undefined {
  const parsed = BranchSummary.safeParse({
    title: clip(thread.name ?? "", 80),
    asked: clip(thread.asked ?? "", 300),
    outcome: clip(thread.outcome ?? "", 600),
    open: clip(thread.open ?? "", 300),
  });
  return parsed.success ? parsed.data : undefined;
}

function candidatePart(sessions: CandidateSession[]): string[] {
  if (sessions.length === 0) return [];
  const lines = sessions.map((s) => {
    const branches = s.branches
      .map(
        (b) =>
          `    · ${b.title}${b.open ? ` (open: ${clip(b.open, 120)})` : ""} → ${s.sessionId}:${b.last.id}`,
      )
      .join("\n");
    const last = s.messages.at(-1);
    return [
      `- ${s.sessionId} "${s.title}" (${s.updatedAt})${s.leftOff ? `: ${s.leftOff}` : ""}`,
      branches,
      last ? `    · last message: ${last.title} → ${s.sessionId}:${last.id}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });
  return [
    "Earlier sessions of this project, newest first, with where each left off and its threads:",
    ...lines,
    'If the first message continues one of them, set "continues" to the reference after → of the thread it picks up; otherwise null. Only when the first message clearly continues that work.',
    "",
  ];
}

/** The prompt of the session-end pass. */
export function closePrompt(
  turns: ChatTurn[],
  record: Session,
  opts: { language: string; candidates: CandidateSession[]; status: boolean },
): string {
  const writing = opts.language === "auto" ? "the conversation's language" : opts.language;
  const nodes = new Map(record.nodes.map((node) => [node.id, node]));
  const labelOf = new Map(turns.map((turn) => [turn.hash ?? turn.id, turn.label ?? turn.id]));
  let previousAt: string | undefined;
  const blocks = turns.map((turn) => {
    const node = nodes.get(turn.hash ?? turn.id);
    const gap =
      previousAt === undefined
        ? 0
        : Math.round((Date.parse(turn.at) - Date.parse(previousAt)) / 60_000);
    previousAt = turn.at;
    const parent = node?.parent ? (labelOf.get(node.parent) ?? node.parent) : "null";
    return [
      `### ${turn.label ?? turn.id} · ${turn.at}${gap >= 30 ? ` · gap ${gap} min` : ""} · current parent=${parent}`,
      ...(node ? [`title: ${node.title}`] : []),
      `USER: ${clip(turn.text, USER_LIMIT)}`,
      `AGENT: ${clip(turn.replies.join(" "), REPLY_LIMIT) || "(no written reply)"}`,
      ...actionLines(turn).map((line) => line.slice(0, 260)),
    ].join("\n");
  });
  const status = opts.status
    ? ', "status": {"goal": "one sentence", "done": ["..."], "pending": [{"text": "...", "needsUser": true}], "next": "a concrete step"}'
    : "";
  return [
    "You close a cogit lineage record at the end of a coding session. Each user message below is listed with what the agent did.",
    "Split the session into threads. A thread is one line of work with one goal: a feature, a bug, a release, a discussion, an idea.",
    "",
    "Rules:",
    '- Every message belongs to exactly one thread. List a thread\'s messages as ranges, e.g. "m7-m15, m19-m33": a thread can pause for a detour and resume later.',
    "- A detour is a thread the user opens in the middle of another one and then leaves (a side question, an idea, an unrelated check). When the user goes back to the earlier work, those messages belong to the earlier thread again.",
    "- Short approvals and follow-ups ('do it', 'yap hadi', 'commit at', 'ne durumdayız?') belong to the thread of the message before them.",
    "- Similar subject is not enough to join threads; the goal must be the same.",
    "- For each thread give `from`: the message whose outcome it starts from. Usually the message just before the thread's first message; for a detour the message it interrupts (the same); for a new task after a finished one, the last message of the finished thread; null only if the first message would work as the first message of a brand-new chat.",
    "",
    "Then write a branch summary for every thread (asked: what the user wanted; outcome: what it meant and what came of it; open: what is still open, or empty), and leftOff: one line saying where the session left off, so a later session can decide whether to continue it.",
    `Write text in ${writing}; JSON keys stay English. Never invent what is not in the record. Never write secrets, credentials or personal data.`,
    "",
    ...candidatePart(opts.candidates),
    `Return only one JSON object, no code fences: {"threads": [{"name": "a few words", "messages": "m1-m6, m55-m66", "from": null, "asked": "...", "outcome": "...", "open": ""}], "leftOff": "..."${
      opts.candidates.length > 0 ? ', "continues": null' : ""
    }${status}}`,
    "",
    ...blocks,
  ].join("\n");
}

/**
 * Turns the pass's answer into a `session write` payload: derived parents for
 * the messages whose parent changes, a branch summary on each thread's first
 * message, `leftOff`, and the first message's earlier-session parent. The side
 * write keeps every parent and note the main agent wrote.
 */
export function closePayload(
  answer: Record<string, unknown>,
  turns: ChatTurn[],
  record: Session,
  opts: { status: boolean },
): Record<string, unknown> {
  const nodes = new Map(record.nodes.map((node) => [node.id, node]));
  const recorded = turns.filter((turn) => nodes.has(turn.hash ?? turn.id));
  const order = recorded.map((turn) => turn.label ?? turn.id);
  const idOf = new Map(recorded.map((turn) => [turn.label ?? turn.id, turn.hash ?? turn.id]));
  const threads = (Array.isArray(answer.threads) ? answer.threads : []).filter(
    (t): t is Thread => typeof t === "object" && t !== null && typeof t.messages === "string",
  );
  const parents = threads.length > 0 ? deriveParents(order, threads) : new Map();
  const branches = new Map<string, BranchSummary>();
  const known = new Set(order);
  for (const thread of threads) {
    const first = threadMembers(thread.messages, known).sort(
      (a, b) => order.indexOf(a) - order.indexOf(b),
    )[0];
    const summary = summaryOf(thread);
    if (first !== undefined && summary && !branches.has(first)) branches.set(first, summary);
  }

  const out: Record<string, unknown>[] = [];
  order.forEach((label, at) => {
    const id = idOf.get(label) as string;
    const node = nodes.get(id);
    if (!node) return;
    const entry: Record<string, unknown> = { id: label, kind: "message", title: node.title };
    let changed = false;
    if (at === 0) {
      const continues = answer.continues;
      if (
        node.parent === null &&
        typeof continues === "string" &&
        parseMessageRef(continues).sessionId !== null
      ) {
        entry.parent = continues;
        changed = true;
      }
    } else if (parents.has(label)) {
      const parent = parents.get(label) as string | null;
      const parentId = parent === null ? null : (idOf.get(parent) ?? parent);
      if (parentId !== (node.parent ?? null)) {
        entry.parent = parent;
        changed = true;
      }
    }
    const branch = branches.get(label);
    if (branch) {
      entry.branch = branch;
      changed = true;
    }
    if (changed) out.push(entry);
  });

  const payload: Record<string, unknown> = { sessionId: record.sessionId, nodes: out };
  if (typeof answer.leftOff === "string" && answer.leftOff.trim() !== "")
    payload.leftOff = clip(answer.leftOff, 400);
  // A malformed status would fail the whole write; it is left out instead.
  const status = opts.status ? Status.safeParse(answer.status) : undefined;
  if (status?.success) payload.status = status.data;
  return payload;
}

/**
 * `cogit backfill <session-id> --close`: runs the session-end pass over a
 * recorded session and writes its answer as the side model. Nothing recorded
 * yet means nothing to close.
 */
export async function closeSession(root: string, sessionId: string, io: Io): Promise<void> {
  const agent = defaultAgent();
  const file = await agent.findTranscript(sessionId, io.env);
  const loaded = await loadSession(root, sessionId);
  if (!file || !loaded.found || !loaded.ok) {
    io.out(`session ${sessionId} has no record to close`);
    return;
  }
  const turns = hashTurns(sessionId, await agent.readConversation(file));
  const upgraded = upgradeSessionIds(loaded.data, turns);
  const record: Session = {
    ...upgraded,
    nodes: applyEvents(upgraded.nodes, await readEvents(root, sessionId)),
  };
  const recorded = new Set(record.nodes.map((node) => node.id));
  const closing = turns.filter((turn) => recorded.has(turn.hash ?? turn.id));
  if (closing.length === 0) {
    io.out(`session ${sessionId} has no recorded message to close`);
    return;
  }
  const config = await loadConfig(io.env);
  const firstNode = record.nodes.find((node) => node.id === (closing[0]?.hash ?? ""));
  // Only a first message that still hangs from nothing looks at earlier sessions.
  const candidates =
    firstNode && firstNode.parent === null ? await candidateSessions(root, sessionId, io.env) : [];
  // The status belongs to the main agent unless only the side model records.
  const status = config.recorder === "side";
  const prompt = closePrompt(closing, record, {
    language: config.language,
    candidates,
    status,
  });
  const answer = agentRecord(resultText(await runClaude(prompt, config.sideModel, io.env)));
  const payload = closePayload(answer, closing, record, { status });
  await sessionWrite({ dir: root, by: "side" }, io, async () => JSON.stringify(payload));
}
