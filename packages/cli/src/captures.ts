import { agentRecord, resultText, runClaude } from "./commands/backfill.js";
import { buildProject } from "./commands/build.js";
import type { Io } from "./io.js";
import type { Session } from "./schema/session.js";
import { addCaptureSuggestions, type CaptureItem, readCaptures } from "./store/captures.js";
import { LockBusyError, withLock } from "./store/lock.js";
import { projectPaths } from "./store/paths.js";
import { loadConfig } from "./store/stores.js";
import { type CaptureInput, captureInput, hasOpenWork } from "./view/captures.js";
import { buildMessages } from "./view/lineage.js";

/**
 * The captured-work distiller (Story 15.1): one headless side-model call over a
 * session's leftover work, turning the record's raw pending lines and open
 * branch lines into at most three user-level items the user then accepts,
 * dismisses or closes. The model's result enters the store as `suggested`; the
 * model never closes, reopens or rewrites an item the user already saw.
 *
 * The pass runs at session end from the close pass, behind a per-session lock,
 * and can be run by hand (`cogit captures distill`) for existing sessions.
 */

/** One item the model proposes, with the recorded message it came from. */
export interface CaptureDraftItem {
  text: string;
  messageId: string;
}

export interface DistillAnswer {
  items: CaptureDraftItem[];
  duplicateOf: string[];
}

/** At most this many items per session: the list is meant to stay short. */
export const DISTILL_LIMIT = 3;

function clip(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}

/** An existing item the model may name as the session's continuing subject. */
export interface ExistingCapture {
  id: string;
  text: string;
}

/**
 * The prompt of the captured-work pass: the session's leftover lines and last
 * message titles, plus the project's current open and suggested items so
 * nothing is drafted twice.
 */
export function distillPrompt(
  input: CaptureInput,
  existing: readonly ExistingCapture[],
  language: string,
): string {
  const writing = language === "auto" ? "the conversation's language" : language;
  const pending = input.pending.map(
    (item) => `- ${item.needsUser ? "(needs the user) " : ""}${clip(item.text, 300)}`,
  );
  const branches = input.branches.map(
    (item) => `- ${item.label ?? item.messageId ?? "?"}: ${clip(item.text, 300)}`,
  );
  const messages = input.lastMessages.map(
    (message) => `- ${message.label ?? message.id}: ${clip(message.title, 200)}`,
  );
  const current =
    existing.length === 0
      ? []
      : [
          "The project's current captured items (open or suggested):",
          ...existing.map((item) => `- ${item.id}: ${clip(item.text, 300)}`),
          'If this session is still about one of them, name its id in "duplicateOf" and do not draft it again.',
          "",
        ];
  return [
    "You distil the work a coding session left undone into a few items its user would recognize.",
    "The session below lists what its record says is still open: pending items, the open line of each branch summary, and the titles of its last messages.",
    "",
    "Rules:",
    `- At most ${DISTILL_LIMIT} items. Each one is work a person would ask for, phrased as a short imperative (one line, at most 140 characters) in ${writing}.`,
    "- Name only work the user asked for and that is still not done, or that the session left undone. A problem a later message fixed, finished or dropped is done, not open.",
    '- Never draft a commit step, a test run, a release chore, a status fact ("0.24 is unreleased") or a question a later message answered.',
    "- Each item carries `messageId`: the reference shown for the message it came from (m1, m2, …).",
    "- Existing captured items are the user's list: never rephrase, merge or close them. Only put an id in `duplicateOf`.",
    "",
    ...current,
    `Session ${input.sessionId} "${clip(input.title, 200)}"`,
    ...(pending.length === 0 ? [] : ["Pending items:", ...pending]),
    ...(branches.length === 0 ? [] : ["Open branch lines:", ...branches]),
    ...(messages.length === 0 ? [] : ["Last messages:", ...messages]),
    "",
    `Return only one JSON object, no code fences: {"items": [{"text": "...", "messageId": "m3"}], "duplicateOf": []}`,
  ].join("\n");
}

/**
 * The model's answer, tolerated as an object (a code fence is stripped) with a
 * missing or malformed list read as "nothing". Text and message refs are
 * flattened and trimmed here; the store validates the rest.
 */
export function parseDistillAnswer(text: string): DistillAnswer {
  const answer = agentRecord(text);
  const rawItems = Array.isArray(answer.items) ? answer.items : [];
  const items: CaptureDraftItem[] = [];
  for (const raw of rawItems) {
    if (typeof raw !== "object" || raw === null) continue;
    const { text: itemText, messageId } = raw as Record<string, unknown>;
    if (typeof itemText !== "string" || typeof messageId !== "string") continue;
    const flat = itemText.replace(/\s+/g, " ").trim();
    if (flat === "") continue;
    items.push({ text: flat, messageId: messageId.trim() });
    if (items.length >= DISTILL_LIMIT) break;
  }
  const rawDuplicates = Array.isArray(answer.duplicateOf) ? answer.duplicateOf : [];
  const duplicateOf = rawDuplicates.filter(
    (id): id is string => typeof id === "string" && id.trim() !== "",
  );
  return { items, duplicateOf: duplicateOf.map((id) => id.trim()) };
}

/** The newest recorded message id, the fallback when the model names none. */
function newestMessageId(input: CaptureInput): string {
  return input.lastMessages.at(-1)?.id ?? input.pending[0]?.messageId ?? "";
}

/** The message id the model named, when it is a reference the session could show. */
export function resolveMessageId(input: CaptureInput, raw: string): string {
  const ref = raw.trim();
  if (ref !== "") {
    if (input.lastMessages.some((message) => message.id === ref || message.label === ref))
      return ref;
    if (/^m[1-9][0-9]*$/.test(ref)) return ref;
  }
  return newestMessageId(input);
}

/** What one distill pass produced: the model's answer and the rows it added. */
export interface CaptureProposal {
  sessionId: string;
  sessionTitle: string;
  items: CaptureDraftItem[];
  duplicateOf: string[];
  /** Empty in a dry run. */
  added: CaptureItem[];
}

export interface DistillResult {
  proposal: CaptureProposal;
  /** False when nothing was written (a dry run, or everything was a duplicate). */
  written: boolean;
}

export interface DistillOptions {
  io: Io;
  /** Print the proposals and write nothing. */
  dryRun?: boolean | undefined;
  /** Stamp for the store; tests pin it. */
  now?: string | undefined;
}

/** The input a recorded session gives the pass. */
export function sessionInput(record: Session): CaptureInput {
  return captureInput({
    sessionId: record.sessionId,
    title: record.title,
    updatedAt: record.updatedAt,
    status: record.status,
    messages: buildMessages(record.nodes),
  });
}

/**
 * Runs the pass over one session and writes the result as `suggested` items.
 * The session must actually have something open, and the setting must be on;
 * otherwise no model call happens and the result is undefined.
 */
export async function distillSessionInput(
  root: string,
  input: CaptureInput,
  opts: DistillOptions,
): Promise<DistillResult | undefined> {
  const config = await loadConfig(opts.io.env);
  if (!config.captures || !hasOpenWork(input)) return undefined;
  const store = await readCaptures(root, opts.io.warn);
  const existing = store.items
    .filter((item) => item.state === "open" || item.state === "suggested")
    .map((item): ExistingCapture => ({ id: item.id, text: item.text }));
  const prompt = distillPrompt(input, existing, config.language);
  const answer = parseDistillAnswer(
    resultText(await runClaude(prompt, config.sideModel, opts.io.env)),
  );
  // An item with no recorded message to point at could never be opened from
  // the map, so it is dropped rather than stored without a source.
  const items = answer.items
    .map((item) => ({ text: item.text, messageId: resolveMessageId(input, item.messageId) }))
    .filter((item) => item.messageId !== "");
  const known = new Set(existing.map((item) => item.id));
  const duplicateOf = answer.duplicateOf.filter((id) => known.has(id));
  const now = opts.now ?? opts.io.now();
  const added =
    opts.dryRun === true
      ? []
      : await addCaptureSuggestions(root, input.sessionId, items, { now, duplicateOf });
  return {
    proposal: {
      sessionId: input.sessionId,
      sessionTitle: input.title,
      items,
      duplicateOf,
      added,
    },
    written: opts.dryRun !== true && (added.length > 0 || duplicateOf.length > 0),
  };
}

/**
 * The session-end pass: one call over the just-closed record, behind the
 * session's own lock so two closures never distil the same session twice. A
 * busy lock and a broken model answer are skipped, never fatal: the close pass
 * has already written the record. With `captures` off, or in agent-only mode
 * where there is no side pass, nothing happens.
 */
export async function distillAtClose(
  root: string,
  record: Session,
  io: Io,
): Promise<DistillResult | undefined> {
  const config = await loadConfig(io.env);
  if (!config.captures || config.recorder === "agent") return undefined;
  const input = sessionInput(record);
  if (!hasOpenWork(input)) return undefined;
  let result: DistillResult | undefined;
  try {
    result = await withLock(
      projectPaths(root).lock(`captures-${record.sessionId}`),
      () => distillSessionInput(root, input, { io }),
      { timeoutMs: 0 },
    );
  } catch (err) {
    if (err instanceof LockBusyError) return undefined;
    io.warn(`could not distil captured work: ${(err as Error).message}`);
    return undefined;
  }
  if ((result?.proposal.added.length ?? 0) > 0) {
    // The map is a snapshot of the store: write a fresh one so the Captured
    // button appears without waiting for the next session.
    try {
      await buildProject({ dir: root, io, quiet: true });
    } catch {
      // The next build picks the list up; a failed rebuild is not this pass's error.
    }
  }
  return result;
}

/** A dry run's proposals as plain lines. */
export function formatProposal(proposal: CaptureProposal): string[] {
  const head = `Session ${proposal.sessionId} "${proposal.sessionTitle}":`;
  if (proposal.items.length === 0) return [`${head} nothing to draft`];
  return [
    head,
    ...proposal.items.map((item) => `  + ${item.text}  (${item.messageId})`),
    ...(proposal.duplicateOf.length === 0
      ? []
      : [`  still about: ${proposal.duplicateOf.join(", ")}`]),
  ];
}
