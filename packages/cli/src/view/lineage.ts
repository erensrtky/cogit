import type { Project } from "../schema/project.js";
import type { LineageNode, Session } from "../schema/session.js";
import {
  DATA_ELEMENT_ID,
  type LineageViewModel,
  type PageModel,
  type PanelSettings,
  type StatusCard,
  VIEW_SCHEMA,
  type ViewChatTurn,
  type ViewEpoch,
  type ViewNode,
  type ViewPendingMessage,
  type ViewSession,
} from "./model.js";

/**
 * The session's user messages, flat and in the order they were sent (8.2). A
 * message hangs from the earlier message it reacts to; an explicit `null` in
 * the record makes a new root. Any other parent (a topic in an older record, a
 * forward or unknown id) falls back to the previous message, so an old record
 * renders as one chain and no message is ever dropped.
 */
export function buildMessages(
  nodes: LineageNode[],
  pending: ViewPendingMessage[] = [],
  commitSubjects?: ReadonlyMap<string, string>,
): ViewNode[] {
  const recorded = nodes.filter((node) => node.kind === "message");
  // One row per message in send order; unrecorded messages are part of the same
  // order, so a session's labels (`m1`, `m2`, …) count both and line up with
  // `session show` (Story 8.5).
  type Row =
    | { kind: "recorded"; node: LineageNode; index: number }
    | { kind: "pending"; message: ViewPendingMessage; index: number };
  const combined: Row[] = [
    ...recorded.map((node, index): Row => ({ kind: "recorded", node, index })),
    ...pending.map(
      (message, index): Row => ({ kind: "pending", message, index: recorded.length + index }),
    ),
  ].sort(
    (a, b) =>
      ((a.kind === "recorded" ? a.node.at : a.message.at) ?? "").localeCompare(
        (b.kind === "recorded" ? b.node.at : b.message.at) ?? "",
      ) || a.index - b.index,
  );
  const idOf = (row: Row): string => (row.kind === "recorded" ? row.node.id : row.message.id);
  const known = new Set(combined.map(idOf));
  /** Position in send order: a parent or link must come before the message. */
  const order = new Map(combined.map((row, index) => [idOf(row), index]));
  const earlier = (other: string, id: string): boolean => {
    const otherAt = order.get(other);
    const selfAt = order.get(id);
    return otherAt !== undefined && selfAt !== undefined && otherAt < selfAt;
  };
  const out: ViewNode[] = [];
  let previous: string | null = null;

  const push = (message: ViewNode, parent: string | null): void => {
    message.parent = parent;
    message.label = `m${out.length + 1}`;
    out.push(message);
    previous = message.id;
  };

  for (const row of combined) {
    if (row.kind === "pending") {
      push(
        {
          id: row.message.id,
          kind: "message",
          title: row.message.title,
          at: row.message.at,
          unsummarized: true,
        },
        previous,
      );
      continue;
    }
    const node = row.node;
    // A `<sessionId>:<id>` parent points into another session's graph (8.6): it
    // stays on the node for the map to resolve, and the local layout sees no
    // parent (the message reads as a root of this session).
    const parentRef = node.parent ?? null;
    const cross = parentRef !== null && parentRef.includes(":");
    const parent =
      parentRef === null
        ? null
        : cross
          ? parentRef
          : known.has(parentRef) && earlier(parentRef, node.id)
            ? parentRef
            : previous;
    const links = (node.links ?? []).filter((link) => known.has(link) && earlier(link, node.id));
    push(
      {
        id: node.id,
        kind: node.kind,
        title: node.title,
        ...(node.summary === undefined ? {} : { summary: node.summary }),
        ...(node.why === undefined ? {} : { why: node.why }),
        ...(node.at === undefined ? {} : { at: node.at }),
        ...(node.decidedBy === undefined ? {} : { decidedBy: node.decidedBy }),
        ...(node.alternatives?.length ? { alternatives: node.alternatives } : {}),
        ...(node.commits?.length ? { commits: node.commits } : {}),
        ...(node.commits?.length
          ? {
              commitTags: node.commits.map((hash) => {
                const subject = commitSubjects?.get(hash);
                return subject === undefined ? { hash } : { hash, subject };
              }),
            }
          : {}),
        ...(node.files?.length ? { files: node.files } : {}),
        ...(node.work?.length ? { work: node.work } : {}),
        ...(node.agentDecisions?.length ? { agentDecisions: node.agentDecisions } : {}),
        ...(node.addedAt === undefined ? {} : { addedAt: node.addedAt }),
        ...(node.touchedAt === undefined ? {} : { touchedAt: node.touchedAt }),
        ...(node.branch === undefined ? {} : { branch: node.branch }),
        ...(links.length ? { links } : {}),
      },
      parent,
    );
  }
  return out;
}

/** A session counts as active while it was updated within this window. */
export const ACTIVE_WINDOW_DAYS = 7;
const ACTIVE_WINDOW_MS = ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Parsed timestamp, with `-Infinity` for a value the date parser rejects. */
function timestamp(value: string): number {
  const time = Date.parse(value);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function isActive(session: Session, now: string): boolean {
  const updated = timestamp(session.updatedAt);
  const reference = timestamp(now);
  if (updated === Number.NEGATIVE_INFINITY || reference === Number.NEGATIVE_INFINITY) return false;
  return reference - updated <= ACTIVE_WINDOW_MS;
}

/** Most recently updated first; the session id keeps equal timestamps deterministic. */
function byUpdatedAt(a: Session, b: Session): number {
  return timestamp(b.updatedAt) - timestamp(a.updatedAt) || a.sessionId.localeCompare(b.sessionId);
}

/** The timestamp the session was last active at, and that value as stored. */
interface Activity {
  value: string;
  time: number;
}

/**
 * Activity is message time, not record time (Story 9.5): fixing an old record
 * touches its `updatedAt`, which must not make the session look like it ran
 * until now. A session with no timed message falls back to `updatedAt`.
 */
function lastActivityOf(session: Session): Activity {
  let value = session.updatedAt;
  let time = Number.NEGATIVE_INFINITY;
  for (const node of session.nodes) {
    if (node.kind !== "message" || node.at === undefined) continue;
    const at = timestamp(node.at);
    if (at > time) {
      time = at;
      value = node.at;
    }
  }
  return { value, time: time === Number.NEGATIVE_INFINITY ? timestamp(value) : time };
}

/** When the session was last active; the newest message's time, else `updatedAt`. */
export function lastActive(session: Session): number {
  return lastActivityOf(session).time;
}

function hasStatus(session: Session): boolean {
  const { goal, done, pending, next } = session.status;
  return goal !== "" || next !== "" || done.length > 0 || pending.length > 0;
}

/**
 * The status card: goal, done, pending and next come from the most recently
 * updated session that recorded a status, so a newer session without one does not
 * blank the card; `needsUser` items are merged from every other session active
 * within `ACTIVE_WINDOW_DAYS`, newest first and deduplicated by text. Last
 * activity is the newest message time across every session (Story 9.5), not the
 * newest `updatedAt`. `now` is the build time the window is measured against.
 */
export function statusCard(sessions: Session[], now: string): StatusCard {
  const ordered = [...sessions].sort(byUpdatedAt);
  const latest = ordered.find(hasStatus);

  const pending = (latest?.status.pending ?? []).map((item) => ({ ...item }));
  const seen = new Set(pending.map((item) => item.text));
  const others = ordered.filter((session) => session !== latest);
  for (const session of others) {
    if (!isActive(session, now)) continue;
    for (const item of session.status.pending) {
      if (!item.needsUser || seen.has(item.text)) continue;
      seen.add(item.text);
      pending.push({ ...item });
    }
  }

  const activity = ordered
    .map(lastActivityOf)
    .reduce<Activity | null>(
      (best, current) => (best === null || current.time > best.time ? current : best),
      null,
    );

  return {
    goal: latest?.status.goal ?? "",
    done: latest?.status.done ?? [],
    pending,
    next: latest?.status.next ?? "",
    lastActivity: activity?.value ?? null,
  };
}

/**
 * The messages the record does not hold yet join the end of the chain, so the
 * newest message is on the map before the agent summarizes it (8.2).
 */
function toViewSession(
  session: Session,
  transcripts?: ReadonlySet<string>,
  chat?: ViewChatTurn[],
  unrecorded?: number,
  pending?: ViewPendingMessage[],
  commitSubjects?: ReadonlyMap<string, string>,
): ViewSession {
  return {
    sessionId: session.sessionId,
    agent: session.agent,
    title: session.title,
    ...(session.author === undefined ? {} : { author: session.author }),
    epoch: session.epoch,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    status: session.status,
    messages: buildMessages(session.nodes, pending, commitSubjects),
    // Undefined means the caller did not ask (fixtures, unit tests); then the
    // record is shown as resumable rather than pretending the transcript is gone.
    transcriptAvailable: transcripts === undefined ? true : transcripts.has(session.sessionId),
    ...(session.worktree ? { worktree: session.worktree } : {}),
    ...(unrecorded ? { unrecordedMessages: unrecorded } : {}),
    ...(chat ? { chat } : {}),
  };
}

/** Sessions in chronological order; the id keeps ties deterministic. */
function byStartedAt(a: Session, b: Session): number {
  return a.startedAt.localeCompare(b.startedAt) || a.sessionId.localeCompare(b.sessionId);
}

export interface ViewModelInput {
  project: Project;
  sessions: Session[];
  /** Absolute project path shown on the page. */
  path: string;
  generatedAt: string;
  /** Session ids whose Claude Code transcript still exists; omit to skip the check. */
  transcripts?: ReadonlySet<string>;
  /** Each session's conversation from its transcript, shown in the drill-down. */
  chats?: ReadonlyMap<string, ViewChatTurn[]>;
  /** Unrecorded message counts, shown while the catch-up is off. */
  unrecorded?: ReadonlyMap<string, number> | undefined;
  /** User messages with no node yet, drawn as not-yet-summarized cards. */
  pending?: ReadonlyMap<string, ViewPendingMessage[]> | undefined;
  /** Commit subjects read from git at build time (Story 8.8). */
  commitSubjects?: ReadonlyMap<string, string> | undefined;
  /** Settings embedded for the modal's `file://` view (Story 8.13). */
  settings?: PanelSettings | undefined;
}

/**
 * Turns a `<sessionId>:<id>` parent into the `continues` mark the map draws and
 * leaves the message a root of its own session, so one session's graph never
 * leaks into another's (8.6). Runs once every session's labels are known.
 * A target the map no longer holds still gets the mark, with the raw id.
 */
export function resolveContinues(sessions: ViewSession[]): void {
  const byId = new Map(sessions.map((session) => [session.sessionId, session]));
  for (const session of sessions) {
    for (const message of session.messages) {
      const parent = message.parent;
      if (typeof parent !== "string") continue;
      const at = parent.indexOf(":");
      if (at === -1) continue;
      const otherId = parent.slice(0, at);
      const id = parent.slice(at + 1);
      const other = byId.get(otherId);
      const target = other?.messages.find((candidate) => candidate.id === id);
      message.parent = null;
      message.continues = {
        sessionId: otherId,
        sessionTitle: other?.title || otherId,
        id,
        ...(target?.label === undefined ? {} : { label: target.label }),
      };
    }
  }
}

/**
 * Builds the page model: epochs in project order, sessions by `startedAt`, and
 * every session whose epoch is null or unknown in the `unassigned` group.
 */
export function buildViewModel(input: ViewModelInput): LineageViewModel {
  const buckets = new Map<string, ViewSession[]>(
    input.project.epochs.map((epoch) => [epoch.id, []]),
  );
  const unassigned: ViewSession[] = [];
  const sessions = [...input.sessions].sort(byStartedAt);
  const views: ViewSession[] = [];

  for (const session of sessions) {
    const view = toViewSession(
      session,
      input.transcripts,
      input.chats?.get(session.sessionId),
      input.unrecorded?.get(session.sessionId),
      input.pending?.get(session.sessionId),
      input.commitSubjects,
    );
    const bucket = session.epoch === null ? undefined : buckets.get(session.epoch);
    (bucket ?? unassigned).push(view);
    views.push(view);
  }
  resolveContinues(views);

  const epochs: ViewEpoch[] = input.project.epochs.map((epoch) => ({
    id: epoch.id,
    title: epoch.title,
    createdAt: epoch.createdAt,
    sessions: buckets.get(epoch.id) ?? [],
  }));

  return {
    kind: "lineage",
    schema: VIEW_SCHEMA,
    project: { name: input.project.name, path: input.path, generatedAt: input.generatedAt },
    status: statusCard(sessions, input.generatedAt),
    epochs,
    unassigned,
    ...(input.settings === undefined ? {} : { settings: input.settings }),
  };
}

const EMPTY_DATA_ELEMENT = `<script id="${DATA_ELEMENT_ID}" type="application/json"></script>`;

/**
 * Escapes `<`, `>`, `&`, U+2028 and U+2029 inside the serialized JSON. The
 * escapes stay valid JSON (`<`), so a `</script>` in the data cannot end the
 * element, and the template can stay one file.
 */
export function escapeForScript(json: string): string {
  return json.replace(
    /[<>&\u2028\u2029]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/** Fills the template's empty data element with the serialized model. */
export function embedViewModel(template: string, model: PageModel): string {
  if (!template.includes(EMPTY_DATA_ELEMENT)) {
    throw new Error(`the template has no empty <script id="${DATA_ELEMENT_ID}"> element`);
  }
  const data = `<script id="${DATA_ELEMENT_ID}" type="application/json">${escapeForScript(
    JSON.stringify(model),
  )}</script>`;
  return template.replace(EMPTY_DATA_ELEMENT, data);
}
