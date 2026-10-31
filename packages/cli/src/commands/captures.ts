import { distillSessionInput, formatProposal } from "../captures.js";
import { CliError, type Io } from "../io.js";
import {
  type CaptureItem,
  type CaptureState,
  type Captures,
  CaptureTransitionError,
  readCaptures,
  setCaptureState,
  UnknownCaptureError,
} from "../store/captures.js";
import { loadAllSessions, loadConfig } from "../store/stores.js";
import { captureInput, hasOpenWork } from "../view/captures.js";
import { timeSince } from "../view/inbox.js";
import { buildMessages } from "../view/lineage.js";
import {
  type EffectiveSession,
  loadEffectiveSessions,
  openProject,
  selectSessions,
} from "./log.js";

/**
 * `cogit captures` (Story 15.1): the curated list the side model drafts and the
 * user curates. The map shows the same store, so the two never disagree.
 * Accepting, dismissing or closing an item is the user's act; distilling by
 * hand (`cogit captures distill`) backfills sessions that ended before the
 * setting was on or ran without a side pass.
 */

export interface CapturesOptions {
  dir: string;
  io: Io;
  json?: boolean | undefined;
  /** The reference time for "how old"; tests pin it. */
  now?: string | undefined;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** `sessionId:messageId` → the message's `mN` label, from the records. */
async function messageLabels(
  root: string,
  warn: (message: string) => void,
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  for (const session of await loadAllSessions(root, warn)) {
    for (const message of buildMessages(session.nodes)) {
      if (message.label !== undefined)
        labels.set(`${session.sessionId}:${message.id}`, message.label);
    }
  }
  return labels;
}

function newestFirst(a: CaptureItem, b: CaptureItem): number {
  return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
}

function itemLine(item: CaptureItem, labels: ReadonlyMap<string, string>, now: string): string {
  const label = labels.get(`${item.source.sessionId}:${item.source.messageId}`);
  const source = [item.source.sessionId, label ?? item.source.messageId].join(" ");
  const age = timeSince(item.updatedAt, now);
  const meta = age === "" ? source : `${source} · ${age} ago`;
  return `${item.id}  ${oneLine(item.text)}  (${meta})`;
}

/**
 * The list in three sections: suggestions waiting for the user, accepted items,
 * and the last ten that were done. Dismissed items are closed and stay out of
 * the reading view.
 */
export function formatCaptures(
  store: Captures,
  labels: ReadonlyMap<string, string> = new Map(),
  now = new Date().toISOString(),
): string[] {
  const of = (state: CaptureState): CaptureItem[] =>
    store.items.filter((item) => item.state === state).sort(newestFirst);
  const section = (title: string, items: CaptureItem[]): string[] =>
    items.length === 0 ? [] : [title, ...items.map((item) => `  ${itemLine(item, labels, now)}`)];
  const lines = [
    ...section("To review", of("suggested")),
    ...section("Open", of("open")),
    ...section("Done", of("done").slice(0, 10)),
  ];
  return lines.length === 0 ? ["No captured work."] : lines;
}

/** `cogit captures`; returns the store for tests and JSON callers. */
export async function captures(opts: CapturesOptions): Promise<Captures> {
  const root = await openProject(opts.dir);
  const store = await readCaptures(root, opts.io.warn);
  if (opts.json === true) {
    opts.io.out(JSON.stringify(store, null, 2));
    return store;
  }
  const labels = await messageLabels(root, opts.io.warn);
  for (const line of formatCaptures(store, labels, opts.now ?? opts.io.now())) opts.io.out(line);
  return store;
}

/** The state each verb moves an item to. */
export const CAPTURE_VERBS = {
  accept: "open",
  dismiss: "dismissed",
  done: "done",
} as const;

export type CaptureVerb = keyof typeof CAPTURE_VERBS;

/** What the confirmation says: "accepted", "dismissed", "closed". */
const CAPTURE_DONE: Readonly<Record<CaptureVerb, string>> = {
  accept: "accepted",
  dismiss: "dismissed",
  done: "closed",
};

/** `cogit captures accept|dismiss|done <id>`: the user's own change to the list. */
export async function setCapture(
  dir: string,
  verb: CaptureVerb,
  id: string,
  io: Io,
): Promise<CaptureItem> {
  const root = await openProject(dir);
  try {
    const item = await setCaptureState(root, id, CAPTURE_VERBS[verb], io.now());
    io.out(`${CAPTURE_DONE[verb]} ${item.id}: ${oneLine(item.text)}`);
    return item;
  } catch (err) {
    if (err instanceof UnknownCaptureError) throw new CliError(`no captured item ${id}`);
    if (err instanceof CaptureTransitionError)
      throw new CliError(`a ${err.from} item cannot become ${err.to}`);
    throw err;
  }
}

export interface DistillOptions {
  dir: string;
  io: Io;
  /** Only this session (id or unambiguous prefix). */
  session?: string | undefined;
  /** Every session with something left open; the default is the newest one. */
  all?: boolean | undefined;
  /** Print the proposals and write nothing. */
  dryRun?: boolean | undefined;
  now?: string | undefined;
}

/** The pass over one effective session, reusing the records already read. */
async function distillOne(
  root: string,
  entry: EffectiveSession,
  opts: DistillOptions,
): Promise<void> {
  const input = captureInput({
    sessionId: entry.session.sessionId,
    title: entry.session.title,
    updatedAt: entry.session.updatedAt,
    status: entry.session.status,
    messages: entry.messages,
  });
  if (!hasOpenWork(input)) {
    opts.io.out(`session ${entry.session.sessionId} has nothing left open to distil`);
    return;
  }
  const result = await distillSessionInput(root, input, {
    io: opts.io,
    ...(opts.dryRun === undefined ? {} : { dryRun: opts.dryRun }),
    ...(opts.now === undefined ? {} : { now: opts.now }),
  });
  if (result === undefined) return;
  if (opts.dryRun === true) {
    for (const line of formatProposal(result.proposal)) opts.io.out(line);
    return;
  }
  const added = result.proposal.added;
  if (added.length === 0) {
    opts.io.out(`nothing new for session ${entry.session.sessionId}`);
    return;
  }
  opts.io.out(
    `drafted ${added.length} item${added.length === 1 ? "" : "s"} from session ${entry.session.sessionId}`,
  );
  for (const item of added) opts.io.out(`  ${item.id}  ${item.text}`);
}

/**
 * `cogit captures distill`: runs the same pass by hand. One selected session,
 * every session with something open, or the newest session by default. With
 * `--dry-run` nothing is written.
 */
export async function distill(opts: DistillOptions): Promise<void> {
  const root = await openProject(opts.dir);
  const config = await loadConfig(opts.io.env);
  if (!config.captures) {
    throw new CliError("captured work is off; turn it on with `cogit config set captures true`");
  }
  const sessions = await loadEffectiveSessions(root, opts.io);
  if (opts.session !== undefined) {
    const selected = selectSessions(sessions, opts.session);
    for (const entry of selected) await distillOne(root, entry, opts);
    return;
  }
  if (opts.all === true) {
    for (const entry of sessions) await distillOne(root, entry, opts);
    return;
  }
  const newest = [...sessions].sort((a, b) =>
    b.session.updatedAt.localeCompare(a.session.updatedAt),
  )[0];
  if (newest === undefined) {
    opts.io.out("this project has no recorded session to distil");
    return;
  }
  await distillOne(root, newest, opts);
}
