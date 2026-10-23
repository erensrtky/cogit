import type { ViewNode } from "../../cli/src/view/model.js";

/**
 * Lays a session's messages out as a git graph (Story 8.2): one row per message
 * in send order, one lane per branch, branch starts curving out of the message
 * they react to, returns routed through a channel left of the lanes. Pure: the
 * React component draws exactly what this returns.
 *
 * Git terms here: a message is a commit, its `parent` is the message it reacts
 * to, a root starts something new, a branch is a chain of messages with only
 * one child each, and `links` are returns to older messages.
 */

/** One message per row; long branches fold into first / ⋮ N more / last. */
export const ROW_HEIGHT = 30;
/** A branch with more messages than this starts folded. */
export const FOLD_LIMIT = 4;
/** Extra space above a new root, so a fresh start reads as a break. */
export const ROOT_GAP = 24;
/** Distance between lanes; also the dot column spacing. */
export const LANE_GAP = 20;
/** Distance between the return channels on the left. */
export const CHANNEL_GAP = 12;
const CHANNEL_PAD = 8;
const LANE_PAD = 10;
const LANE_TAIL = 6;
/** Width reserved for the row text right of the dots. */
export const ROW_WIDTH = 520;
const ROW_GAP = 8;

/** How many lane colours the page defines (`--l0` … `--l5`). */
export const LANE_COLORS = 6;

export interface GitBranch {
  title: string;
  asked: string;
  outcome: string;
  open: string;
  /** First and last message of the branch, for the "m33–m36" range. */
  fromId: string;
  toId: string;
  /** The labels `m33` / `m36` the user reads; the ids are stable keys. */
  fromLabel: string;
  toLabel: string;
  count: number;
  firstAt?: string;
  lastAt?: string;
}

export interface GitSegment {
  /** The branch's first message id; stable across rebuilds, so UI state uses it. */
  id: string;
  ids: string[];
  /** The message the branch starts from; null for a new root. */
  parentId: string | null;
  parentSegmentId: string | null;
  lane: number;
  /** Lane of the branch this one starts from; null for a root. */
  parentLane: number | null;
  colorIndex: number;
  branch: GitBranch;
  /** Row y of the branch's first message and of the message it reacts to. */
  startY: number;
  parentY: number | null;
}

export interface GitReturn {
  /** The older message this row returns to. */
  id: string;
  /** Its `m22` label, which the row shows instead of the stable id. */
  label: string;
  colorIndex: number;
}

export interface GitMessageRow {
  kind: "message";
  message: ViewNode;
  segmentId: string;
  colorIndex: number;
  /** Centre of the row on the canvas. */
  y: number;
  /** First message of its branch: hollow ring and branch label. */
  first: boolean;
  /** A new root starts here, with a gap above it. */
  gap: boolean;
  returns: GitReturn[];
  /** "left off here": the newest message of the newest session. */
  head: boolean;
  /** Row height: titles wrap instead of being cut, so long ones get taller rows. */
  height: number;
}

export interface GitMoreRow {
  kind: "more";
  segmentId: string;
  colorIndex: number;
  y: number;
  height: number;
  /** The messages the fold hides. */
  hidden: string[];
}

export type GitRow = GitMessageRow | GitMoreRow;

export interface GitLink {
  /** The message that returns. */
  fromId: string;
  /** The older message it returns to. */
  toId: string;
  fromY: number;
  toY: number;
  /** The column left of the lanes this link runs through. */
  channelX: number;
  colorIndex: number;
}

export interface GitLayout {
  segments: GitSegment[];
  rows: GitRow[];
  links: GitLink[];
  /** Dot x per lane. */
  laneX: number[];
  /** Width of the channel + lanes area; the row text starts after it. */
  graphWidth: number;
  /** Whole box: graph width, gap, then the row text. */
  width: number;
  height: number;
  headId: string | null;
}

export interface GitLayoutOptions {
  /** Branch ids the user has unfolded. */
  unfolded?: ReadonlySet<string>;
  /** The "Unfold all" toggle. */
  openAll?: boolean;
  /** Message that carries "left off here"; defaults to the newest message. */
  headId?: string | null;
}

interface RawRow {
  kind: "message" | "more";
  /** Position in send order; a folded row sits just after its first message. */
  index: number;
  segment: GitSegment;
  id?: string;
  hidden?: string[];
  y: number;
  height: number;
  gap: boolean;
}

/** Average glyph widths at the row's font sizes; a rough estimate is enough. */
const TITLE_CHAR = 6.4;
const TITLE_LINE = 16;
const BRANCH_CHAR = 6;
const BRANCH_LINE = 14;
const BRANCH_MAX = 150;
/** Padding, the time column and the gaps around it. */
const ROW_FIXED = 106;

/**
 * Height of a message row whose title (and branch label) wrap instead of being
 * cut with an ellipsis: the width left for the title after the fixed parts of
 * the row decides how many lines it needs.
 */
export function rowHeight(
  message: ViewNode,
  row: { first: boolean; branchTitle: string; returns: number; head: boolean },
): number {
  const fixed =
    ROW_FIXED +
    (message.label ?? message.id).length * 7 +
    (row.first ? BRANCH_MAX + 8 : 0) +
    row.returns * 44 +
    (row.head ? 92 : 0) +
    (message.unsummarized ? 116 : 0) +
    // The "↑ continues <session> · m67" mark sits in the row, next to the title.
    (message.continues ? 150 + message.continues.sessionTitle.length * 6.4 : 0);
  const room = Math.max(120, ROW_WIDTH - fixed);
  const titleLines = Math.max(1, Math.ceil((message.title.length * TITLE_CHAR) / room));
  const branchLines = row.first
    ? Math.max(1, Math.ceil((row.branchTitle.length * BRANCH_CHAR) / (BRANCH_MAX - 12)))
    : 1;
  return Math.max(ROW_HEIGHT, 12 + Math.max(titleLines * TITLE_LINE, branchLines * BRANCH_LINE));
}

/** Parent ids that point forward, at themselves or outside the session become roots. */
function parentOf(message: ViewNode, index: Map<string, number>): string | null {
  const parent = message.parent;
  if (typeof parent !== "string") return null;
  const self = index.get(message.id) ?? 0;
  const at = index.get(parent);
  return at !== undefined && at < self ? parent : null;
}

function branchOf(ids: string[], byId: Map<string, ViewNode>): GitBranch {
  const first = byId.get(ids[0] ?? "");
  const last = byId.get(ids[ids.length - 1] ?? "");
  return {
    title: (first?.branch?.title ?? first?.title ?? ids[0] ?? "").slice(0, 80),
    asked: first?.branch?.asked ?? "",
    outcome: first?.branch?.outcome ?? first?.summary ?? "",
    open: first?.branch?.open ?? "",
    fromId: ids[0] ?? "",
    toId: ids[ids.length - 1] ?? "",
    fromLabel: first?.label ?? ids[0] ?? "",
    toLabel: last?.label ?? ids[ids.length - 1] ?? "",
    count: ids.length,
    ...(first?.at === undefined ? {} : { firstAt: first.at }),
    ...(last?.at === undefined ? {} : { lastAt: last.at }),
  };
}

export function layoutGitGraph(messages: ViewNode[], options: GitLayoutOptions = {}): GitLayout {
  const index = new Map(messages.map((message, at) => [message.id, at]));
  const byId = new Map(messages.map((message) => [message.id, message]));
  const kids = new Map<string | null, string[]>();
  const parents = new Map<string, string | null>();
  for (const message of messages) {
    const parent = parentOf(message, index);
    parents.set(message.id, parent);
    const list = kids.get(parent) ?? [];
    list.push(message.id);
    kids.set(parent, list);
  }
  const children = (id: string | null): string[] => kids.get(id) ?? [];

  // A branch runs while each message has exactly one child; every child of its
  // last message starts a new branch hanging from it.
  const segments: GitSegment[] = [];
  const segOf = new Map<string, GitSegment>();
  const build = (start: string, parentSegment: GitSegment | null): GitSegment => {
    const ids = [start];
    let cur = start;
    while (children(cur).length === 1) {
      cur = children(cur)[0] as string;
      ids.push(cur);
    }
    const last = ids[ids.length - 1] as string;
    const segment: GitSegment = {
      id: start,
      ids,
      parentId: parents.get(start) ?? null,
      parentSegmentId: parentSegment?.id ?? null,
      lane: 0,
      parentLane: null,
      colorIndex: segments.length % LANE_COLORS,
      branch: branchOf(ids, byId),
      startY: 0,
      parentY: null,
    };
    segments.push(segment);
    for (const id of ids) segOf.set(id, segment);
    // The last message id and branch id agree only by accident; keep the map
    // from the last message's children as the branch points.
    for (const child of children(last)) build(child, segment);
    return segment;
  };
  for (const root of children(null)) build(root, null);

  // No `headId` key: the newest message is HEAD. An explicit null means this
  // session holds no HEAD (it is not the newest one), so its long branches fold.
  const headId = "headId" in options ? options.headId : (messages[messages.length - 1]?.id ?? null);
  const unfolded = options.unfolded ?? new Set<string>();
  const openAll = options.openAll ?? false;

  const raw: RawRow[] = [];
  for (const segment of segments) {
    const folded =
      segment.ids.length > FOLD_LIMIT &&
      !openAll &&
      !unfolded.has(segment.id) &&
      !(headId !== null && segment.ids.includes(headId));
    if (folded) {
      const first = segment.ids[0] as string;
      const last = segment.ids[segment.ids.length - 1] as string;
      const hidden = segment.ids.slice(1, -1);
      raw.push({
        kind: "message",
        index: index.get(first) ?? 0,
        segment,
        id: first,
        y: 0,
        height: ROW_HEIGHT,
        gap: false,
      });
      raw.push({
        kind: "more",
        index: (index.get(first) ?? 0) + 0.5,
        segment,
        hidden,
        y: 0,
        height: ROW_HEIGHT,
        gap: false,
      });
      raw.push({
        kind: "message",
        index: index.get(last) ?? 0,
        segment,
        id: last,
        y: 0,
        height: ROW_HEIGHT,
        gap: false,
      });
    } else {
      for (const id of segment.ids) {
        raw.push({
          kind: "message",
          index: index.get(id) ?? 0,
          segment,
          id,
          y: 0,
          height: ROW_HEIGHT,
          gap: false,
        });
      }
    }
  }
  raw.sort((a, b) => a.index - b.index);

  // Rows in time order; a new root gets a gap above it.
  let cursor = ROW_HEIGHT / 2;
  const rowOf = new Map<string, RawRow>();
  raw.forEach((row, at) => {
    row.gap =
      at > 0 &&
      row.kind === "message" &&
      row.segment.parentId === null &&
      row.segment.ids[0] === row.id;
    if (row.gap) cursor += ROOT_GAP;
    const message = row.kind === "message" ? byId.get(row.id ?? "") : undefined;
    row.height = message
      ? rowHeight(message, {
          first: row.segment.ids[0] === message.id,
          branchTitle: row.segment.branch.title,
          returns: (message.links ?? []).filter((id) => segOf.has(id)).length,
          head: message.id === headId,
        })
      : ROW_HEIGHT;
    row.y = cursor + row.height / 2;
    cursor += row.height;
    if (row.kind === "message" && row.id) rowOf.set(row.id, row);
    for (const hidden of row.hidden ?? []) rowOf.set(hidden, row);
  });

  // Lanes: a branch may reuse its parent's lane once the parent is done, and
  // any lane whose earlier occupants no longer span this row.
  const segById = new Map(segments.map((segment) => [segment.id, segment]));
  const occupancy = new Map<number, [number, number][]>();
  const ordered = [...segments].sort((a, b) => (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0));
  for (const segment of ordered) {
    const first = rowOf.get(segment.ids[0] ?? "");
    const last = rowOf.get(segment.ids[segment.ids.length - 1] ?? "");
    if (!first || !last) continue;
    const parentRow = segment.parentId === null ? null : rowOf.get(segment.parentId);
    const start = parentRow?.y ?? first.y;
    const span: [number, number] = [start, last.y + 0.1];
    const free = (lane: number): boolean =>
      !(occupancy.get(lane) ?? []).some(([a, b]) => a < span[1] && span[0] < b);
    const parent = segment.parentSegmentId === null ? null : segById.get(segment.parentSegmentId);
    let lane = parent && free(parent.lane) ? parent.lane : 0;
    while (!free(lane)) lane += 1;
    segment.lane = lane;
    segment.parentLane = parent?.lane ?? null;
    segment.startY = first.y;
    segment.parentY = parentRow?.y ?? null;
    const list = occupancy.get(lane) ?? [];
    list.push(span);
    occupancy.set(lane, list);
  }

  const laneCount = Math.max(0, ...segments.map((segment) => segment.lane + 1));
  const links: GitLink[] = [];
  for (const message of messages) {
    for (const target of message.links ?? []) {
      const from = rowOf.get(message.id);
      const to = rowOf.get(target);
      if (!from || !to) continue;
      links.push({
        fromId: message.id,
        toId: target,
        fromY: from.y,
        toY: to.y,
        channelX: 6 + links.length * CHANNEL_GAP,
        colorIndex: segOf.get(target)?.colorIndex ?? 0,
      });
    }
  }

  const channelWidth = links.length > 0 ? links.length * CHANNEL_GAP + CHANNEL_PAD : 0;
  const laneX = Array.from(
    { length: Math.max(laneCount, 1) },
    (_, lane) => channelWidth + LANE_PAD + lane * LANE_GAP,
  );
  const graphWidth = channelWidth + LANE_PAD + Math.max(laneCount, 1) * LANE_GAP + LANE_TAIL;

  const rows: GitRow[] = raw.map((row): GitRow => {
    if (row.kind === "more") {
      return {
        kind: "more",
        segmentId: row.segment.id,
        colorIndex: row.segment.colorIndex,
        y: row.y,
        height: row.height,
        hidden: row.hidden ?? [],
      };
    }
    const message = byId.get(row.id ?? "");
    if (!message) throw new Error(`message ${String(row.id)} vanished from the layout`);
    const returns: GitReturn[] = [];
    for (const target of message.links ?? []) {
      if (!rowOf.has(target)) continue;
      returns.push({
        id: target,
        label: byId.get(target)?.label ?? target,
        colorIndex: segOf.get(target)?.colorIndex ?? 0,
      });
    }
    return {
      kind: "message",
      message,
      segmentId: row.segment.id,
      colorIndex: row.segment.colorIndex,
      y: row.y,
      first: row.segment.ids[0] === message.id,
      gap: row.gap,
      returns,
      head: message.id === headId,
      height: row.height,
    };
  });

  return {
    segments,
    rows,
    links,
    laneX,
    graphWidth,
    width: graphWidth + ROW_GAP + ROW_WIDTH,
    height: cursor,
    headId,
  };
}

/** The dashed return route: target dot → left channel → arrow at the returning dot. */
export function linkPath(link: GitLink, targetX: number, fromX: number): string {
  const q = 6;
  const g = link.channelX;
  return [
    `M${targetX},${link.toY}`,
    `L${g + q},${link.toY}`,
    `Q${g},${link.toY} ${g},${link.toY + q}`,
    `L${g},${link.fromY - q}`,
    `Q${g},${link.fromY} ${g + q},${link.fromY}`,
    `L${fromX - 9},${link.fromY}`,
  ].join(" ");
}

/** Arrowhead at the returning message, pointing at its dot. */
export function linkArrow(link: GitLink, fromX: number): string {
  return `M${fromX - 15},${link.fromY - 4} L${fromX - 8},${link.fromY} L${fromX - 15},${link.fromY + 4}`;
}

/** The curve a branch start draws from its parent's dot into its lane. */
export function branchPath(segment: GitSegment, laneX: number[]): string {
  const x = laneX[segment.lane] ?? 0;
  const y0 = segment.parentY;
  if (y0 === null) return "";
  const px = segment.parentLane === null ? x : (laneX[segment.parentLane] ?? x);
  if (px === x) return `M${x},${y0} L${x},${segment.startY}`;
  return [
    `M${px},${y0}`,
    `C${px},${y0 + ROW_HEIGHT * 0.7} ${x},${y0 + ROW_HEIGHT * 0.3} ${x},${y0 + ROW_HEIGHT}`,
    `L${x},${segment.startY}`,
  ].join(" ");
}
