import type { LineageViewModel, ViewChatTurn, ViewNode, ViewStatus } from "./model.js";

/**
 * Lineage search (Story 8.14). The CLI and the map read the same data and use
 * this one matcher, so `cogit search <text>` and the map's search box
 * return the same hits in the same order. No index file and no model: a linear
 * scan over the records and the stored conversation is enough at this size.
 *
 * Matching is case- and accent-insensitive with Turkish letters folded the way
 * a Turkish keyboard user expects: `I`, `İ` and `ı` all match each other, and
 * `ş`, `ğ`, `ç`, `ö`, `ü` match their plain forms.
 */

export type SearchField = "title" | "branch" | "conversation" | "session";

/** One session as the matcher sees it; the CLI and the map both build these. */
export interface SearchSource {
  sessionId: string;
  title: string;
  status?: ViewStatus;
  startedAt?: string;
  updatedAt?: string;
  messages: readonly ViewNode[];
  /** The stored conversation, when there is one (never tool output). */
  chat?: readonly ViewChatTurn[];
}

export interface SearchHit {
  sessionId: string;
  sessionTitle: string;
  /** The matching message; null when the session's title or status matched. */
  messageId: string | null;
  label: string | null;
  /** The message's time, or the session's last activity for a session hit. */
  at: string | null;
  field: SearchField;
  /** One line around the match, whitespace collapsed. */
  excerpt: string;
}

/**
 * Folds a character to its lowercase, unaccented form. Turkish `İ` decomposes
 * to `I` plus a combining dot; `I` and `ı` are mapped to `i` explicitly, so all
 * three forms match each other. Other accents fall out with the combining marks.
 */
function foldChar(ch: string): string {
  return ch
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[Iı]/g, "i")
    .toLowerCase();
}

/** The case- and accent-insensitive form used for matching. */
export function fold(text: string): string {
  return foldChar(text.normalize("NFC"));
}

/** The query as the matcher compares it: folded and with runs of space collapsed. */
export function normalizeQuery(query: string): string {
  return fold(query).replace(/\s+/g, " ").trim();
}

/** Where in `text` the folded character at `index` starts; code units, like `slice`. */
function originalIndex(text: string, index: number): number {
  let folded = 0;
  let offset = 0;
  for (const ch of text) {
    if (folded >= index) return offset;
    folded += foldChar(ch).length;
    offset += ch.length;
  }
  return text.length;
}

/** One line around the first match of the already-folded `needle`, or null. */
export function excerptFor(text: string, needle: string, max = 120): string | null {
  if (needle === "") return null;
  const at = fold(text).indexOf(needle);
  if (at < 0) return null;
  const start = originalIndex(text, at);
  const end = originalIndex(text, at + needle.length);
  const before = Math.min(start, 40);
  const after = Math.max(0, max - before - (end - start));
  const left = start - before;
  const right = Math.min(text.length, end + after);
  const oneLine = text.slice(left, right).replace(/\s+/g, " ").trim();
  return `${left > 0 ? "…" : ""}${oneLine}${right < text.length ? "…" : ""}`;
}

const NO_HIT = Symbol("no-hit");
type FieldHit = { field: SearchField; excerpt: string } | typeof NO_HIT;

/** Tries one string and returns either the hit or the marker for "try the next one". */
function matchText(text: string | undefined, needle: string, field: SearchField): FieldHit {
  if (text === undefined || text === "") return NO_HIT;
  const excerpt = excerptFor(text, needle);
  return excerpt === null ? NO_HIT : { field, excerpt };
}

/** The message's own text: title, notes and decisions — shown in the same panel. */
function messageHit(message: ViewNode, needle: string): FieldHit {
  for (const text of [
    message.title,
    message.summary,
    message.why,
    ...(message.alternatives ?? []).flatMap((alt) => [alt.option, alt.why]),
    ...(message.work ?? []),
    ...(message.agentDecisions ?? []).flatMap((decision) => [
      decision.title,
      decision.why,
      ...(decision.alternatives ?? []).flatMap((alt) => [alt.option, alt.why]),
    ]),
  ]) {
    const hit = matchText(text, needle, "title");
    if (hit !== NO_HIT) return hit;
  }
  return NO_HIT;
}

/** The branch summary that starts on this message. */
function branchHit(message: ViewNode, needle: string): FieldHit {
  if (message.branch === undefined) return NO_HIT;
  for (const text of [
    message.branch.title,
    message.branch.asked,
    message.branch.outcome,
    message.branch.open,
  ]) {
    const hit = matchText(text, needle, "branch");
    if (hit !== NO_HIT) return hit;
  }
  return NO_HIT;
}

/** The stored conversation turn: the user's text first, then the agent's replies. */
function conversationHit(turn: ViewChatTurn | undefined, needle: string): FieldHit {
  if (turn === undefined) return NO_HIT;
  const hit = matchText(turn.text, needle, "conversation");
  if (hit !== NO_HIT) return hit;
  for (const reply of turn.replies) {
    const replyHit = matchText(reply, needle, "conversation");
    if (replyHit !== NO_HIT) return replyHit;
  }
  return NO_HIT;
}

function turnOf(
  chat: readonly ViewChatTurn[] | undefined,
  message: ViewNode,
): ViewChatTurn | undefined {
  return chat?.find(
    (turn) => turn.id === message.id || (turn.label !== undefined && turn.label === message.label),
  );
}

/** The first matching group of a message, in reading order. */
function hitOf(
  message: ViewNode,
  chat: readonly ViewChatTurn[] | undefined,
  needle: string,
): FieldHit {
  const own = messageHit(message, needle);
  if (own !== NO_HIT) return own;
  const branch = branchHit(message, needle);
  if (branch !== NO_HIT) return branch;
  return conversationHit(turnOf(chat, message), needle);
}

/** Session title and status, as one "session" hit. */
function sessionHit(source: SearchSource, needle: string): FieldHit {
  const status = source.status;
  const statusTexts =
    status === undefined
      ? []
      : [status.goal, ...status.done, ...status.pending.map((item) => item.text), status.next];
  for (const text of [source.title, ...statusTexts]) {
    const hit = matchText(text, needle, "session");
    if (hit !== NO_HIT) return hit;
  }
  return NO_HIT;
}

function timeOf(value: string | null | undefined): number {
  if (value === null || value === undefined) return Number.NEGATIVE_INFINITY;
  const at = Date.parse(value);
  return Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at;
}

/** `m12` → 12, so equal times still order newest message first. */
function labelNumber(label: string | null): number {
  const match = label === null ? null : /^m([1-9][0-9]*)$/.exec(label);
  return match === null ? -1 : Number(match[1]);
}

/**
 * Every hit, newest first. One hit per message: the first matching field wins
 * (the message's own text, then its branch summary, then its conversation), so
 * a message that says "search" twice is still one row of the counter.
 */
export function searchSources(sources: readonly SearchSource[], query: string): SearchHit[] {
  const needle = normalizeQuery(query);
  if (needle === "") return [];
  const hits: SearchHit[] = [];

  for (const source of sources) {
    const sessionLevel = sessionHit(source, needle);
    if (sessionLevel !== NO_HIT) {
      const newest = source.messages[source.messages.length - 1];
      hits.push({
        sessionId: source.sessionId,
        sessionTitle: source.title,
        messageId: null,
        label: null,
        at: source.updatedAt ?? source.startedAt ?? newest?.at ?? null,
        field: sessionLevel.field,
        excerpt: sessionLevel.excerpt,
      });
    }

    for (const message of source.messages) {
      const hit = hitOf(message, source.chat, needle);
      if (hit === NO_HIT) continue;
      hits.push({
        sessionId: source.sessionId,
        sessionTitle: source.title,
        messageId: message.id,
        label: message.label ?? null,
        at: message.at ?? null,
        field: hit.field,
        excerpt: hit.excerpt,
      });
    }
  }

  return hits.sort(
    (a, b) =>
      timeOf(b.at) - timeOf(a.at) ||
      a.sessionId.localeCompare(b.sessionId) ||
      labelNumber(b.label) - labelNumber(a.label),
  );
}

/** The sessions a hit list points at, in first-seen order. */
export function hitSessionIds(hits: readonly SearchHit[]): string[] {
  return [...new Set(hits.map((hit) => hit.sessionId))];
}

/** Moves the active hit by `delta`, clamped to the list: the ↑/↓ counter (8.14). */
export function stepHitIndex(active: number, count: number, delta: number): number {
  if (count === 0) return 0;
  return Math.min(Math.max(active + delta, 0), count - 1);
}

/**
 * The message ids to highlight, by session. A session-level hit has no message
 * to highlight, so it contributes nothing here.
 */
export function hitMessageIds(hits: readonly SearchHit[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const hit of hits) {
    if (hit.messageId === null) continue;
    const ids = out.get(hit.sessionId) ?? new Set<string>();
    ids.add(hit.messageId);
    out.set(hit.sessionId, ids);
  }
  return out;
}

/** True for a message reference the map can try: `h` plus 6..12 hex characters. */
export function isHashQuery(text: string): boolean {
  return /^h[0-9a-f]{6,12}$/.test(text.trim().toLowerCase());
}

export type HashRefResult =
  | { kind: "ok"; sessionId: string; messageId: string; label: string | null; title: string }
  | { kind: "ambiguous"; count: number }
  | { kind: "none" };

/** A pasted hash (or a unique prefix) as the map resolves it, like `show`. */
export function resolveHashPrefix(model: LineageViewModel, ref: string): HashRefResult {
  const prefix = ref.trim().toLowerCase();
  const found = [...model.epochs.flatMap((epoch) => epoch.sessions), ...model.unassigned].flatMap(
    (session) =>
      session.messages
        .filter((message) => message.id.startsWith(prefix))
        .map((message) => ({ session, message })),
  );
  if (found.length === 0) return { kind: "none" };
  if (found.length > 1) return { kind: "ambiguous", count: found.length };
  const hit = found[0] as { session: { sessionId: string }; message: ViewNode };
  return {
    kind: "ok",
    sessionId: hit.session.sessionId,
    messageId: hit.message.id,
    label: hit.message.label ?? null,
    title: hit.message.title,
  };
}

/** The map's search: every session of the page as a source, in page order. */
export function searchLineage(model: LineageViewModel, query: string): SearchHit[] {
  const sessions = [...model.epochs.flatMap((epoch) => epoch.sessions), ...model.unassigned];
  return searchSources(
    sessions.map((session) => ({
      sessionId: session.sessionId,
      title: session.title,
      status: session.status,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
      messages: session.messages,
      ...(session.chat === undefined ? {} : { chat: session.chat }),
    })),
    query,
  );
}
