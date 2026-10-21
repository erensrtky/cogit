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

/** The status card comes from the most recently updated session. */
function statusCard(sessions: Session[]): StatusCard {
  let latest: Session | undefined;
  for (const session of sessions) {
    if (!latest || session.updatedAt > latest.updatedAt) latest = session;
  }
  return {
    goal: latest?.status.goal ?? "",
    done: latest?.status.done ?? [],
    pending: latest?.status.pending ?? [],
    next: latest?.status.next ?? "",
    lastActivity: latest?.updatedAt ?? null,
  };
}

function toViewSession(session: Session): ViewSession {
  return {
    sessionId: session.sessionId,
    agent: session.agent,
    title: session.title,
    epoch: session.epoch,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    status: session.status,
    nodes: buildNodeTree(session.nodes),
    // Story 2.5 adds the transcript lookup; a record without one still renders.
    transcriptAvailable: true,
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
    const view = toViewSession(session);
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
    status: statusCard(sessions),
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
