import type { Project } from "../schema/project.js";
import type { LineageNode, Session } from "../schema/session.js";
import {
  DATA_ELEMENT_ID,
  type LineageViewModel,
  type StatusCard,
  VIEW_SCHEMA,
  type ViewEpoch,
  type ViewNode,
  type ViewSession,
} from "./model.js";

/**
 * Turns a session's flat node list into the nested tree the graph draws. Order is
 * preserved. A missing parent, a self-reference or a cycle becomes a root, so no
 * recorded node is ever dropped.
 */
export function buildNodeTree(nodes: LineageNode[]): ViewNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenOf = new Map<string, LineageNode[]>();
  const roots: LineageNode[] = [];
  for (const node of nodes) {
    const parent = node.parent === null ? undefined : byId.get(node.parent);
    if (parent && parent.id !== node.id) {
      const list = childrenOf.get(parent.id) ?? [];
      list.push(node);
      childrenOf.set(parent.id, list);
    } else {
      roots.push(node);
    }
  }

  const visited = new Set<string>();
  const build = (node: LineageNode): ViewNode => {
    visited.add(node.id);
    const children = (childrenOf.get(node.id) ?? [])
      .filter((child) => !visited.has(child.id))
      .map(build);
    return {
      id: node.id,
      kind: node.kind,
      title: node.title,
      ...(node.summary === undefined ? {} : { summary: node.summary }),
      ...(node.why === undefined ? {} : { why: node.why }),
      ...(node.at === undefined ? {} : { at: node.at }),
      children,
    };
  };

  const tree = roots.filter((root) => !visited.has(root.id)).map(build);
  // A pure cycle has no root, so break it at the first node not yet emitted.
  for (const node of nodes) if (!visited.has(node.id)) tree.push(build(node));
  return tree;
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

/**
 * The status card: goal, done, pending and next come from the most recently
 * updated session; `needsUser` items are merged from every other session active
 * within `ACTIVE_WINDOW_DAYS`, newest first and deduplicated by text.
 * `now` is the build time the window is measured against.
 */
export function statusCard(sessions: Session[], now: string): StatusCard {
  let latest: Session | undefined;
  for (const session of sessions) {
    if (!latest || timestamp(session.updatedAt) > timestamp(latest.updatedAt)) latest = session;
  }

  const pending = (latest?.status.pending ?? []).map((item) => ({ ...item }));
  const seen = new Set(pending.map((item) => item.text));
  const others = sessions.filter((session) => session !== latest).sort(byUpdatedAt);
  for (const session of others) {
    if (!isActive(session, now)) continue;
    for (const item of session.status.pending) {
      if (!item.needsUser || seen.has(item.text)) continue;
      seen.add(item.text);
      pending.push({ ...item });
    }
  }

  return {
    goal: latest?.status.goal ?? "",
    done: latest?.status.done ?? [],
    pending,
    next: latest?.status.next ?? "",
    lastActivity: latest?.updatedAt ?? null,
  };
}

function toViewSession(session: Session, transcripts?: ReadonlySet<string>): ViewSession {
  return {
    sessionId: session.sessionId,
    agent: session.agent,
    title: session.title,
    epoch: session.epoch,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    status: session.status,
    nodes: buildNodeTree(session.nodes),
    // Undefined means the caller did not ask (fixtures, unit tests); then the
    // record is shown as resumable rather than pretending the transcript is gone.
    transcriptAvailable: transcripts === undefined ? true : transcripts.has(session.sessionId),
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

  for (const session of sessions) {
    const view = toViewSession(session, input.transcripts);
    const bucket = session.epoch === null ? undefined : buckets.get(session.epoch);
    (bucket ?? unassigned).push(view);
  }

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
export function embedViewModel(template: string, model: LineageViewModel): string {
  if (!template.includes(EMPTY_DATA_ELEMENT)) {
    throw new Error(`the template has no empty <script id="${DATA_ELEMENT_ID}"> element`);
  }
  const data = `<script id="${DATA_ELEMENT_ID}" type="application/json">${escapeForScript(
    JSON.stringify(model),
  )}</script>`;
  return template.replace(EMPTY_DATA_ELEMENT, data);
}
