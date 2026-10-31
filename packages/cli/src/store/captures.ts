import { randomBytes } from "node:crypto";
import { z } from "zod";
import { IsoDate } from "../schema/common.js";
import { atomicWriteJson, readJson } from "./fs.js";
import { withLock } from "./lock.js";
import { projectPaths } from "./paths.js";

/**
 * The curated captured-work list (Story 15.1). A side model distils a session's
 * leftover work into a few user-level items; the user accepts, dismisses or
 * closes them. The store is local to the machine (`.cogit/state/captures.json`,
 * never committed) and is not a plan: cogit keeps no tracker state.
 *
 * An item's id is minted once and never derived from its text, because the model
 * may rephrase a suggestion without it becoming a second row.
 */

export const CAPTURES_SCHEMA = 1;

const SESSION_ID = /^[A-Za-z0-9._:-]{1,128}$/;
/** A random `c` followed by eight hex characters. */
export const CAPTURE_ID = /^c[0-9a-f]{8}$/;
/** One item is a line, not a paragraph. */
export const CAPTURE_TEXT_MAX = 300;

export const CaptureState = z.enum(["suggested", "open", "dismissed", "done"]);
export type CaptureState = z.infer<typeof CaptureState>;

export const CaptureItem = z.object({
  id: z.string().regex(CAPTURE_ID),
  text: z.string().trim().min(1).max(CAPTURE_TEXT_MAX),
  state: CaptureState,
  /** The recorded message the item came from. */
  source: z.object({
    sessionId: z.string().regex(SESSION_ID),
    messageId: z.string().min(1).max(128),
  }),
  createdAt: IsoDate,
  updatedAt: IsoDate,
  /** Set when the item became `done`; absent otherwise. */
  closedAt: IsoDate.optional(),
});
export type CaptureItem = z.infer<typeof CaptureItem>;

export const Captures = z.object({
  schema: z.literal(CAPTURES_SCHEMA),
  items: z.array(CaptureItem).default([]),
});
export type Captures = z.infer<typeof Captures>;

/** A missing file is an empty list, not an error. */
export function emptyCaptures(): Captures {
  return { schema: CAPTURES_SCHEMA, items: [] };
}

/** An id no item in `taken` uses; the model never picks one. */
export function newCaptureId(taken: ReadonlySet<string> = new Set()): string {
  for (;;) {
    const id = `c${randomBytes(4).toString("hex")}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * What the user may do with an item: a suggestion is accepted or dismissed, an
 * open item is closed. A dismissed or done item stays as it is — the model never
 * reopens what the user already saw.
 */
export const CAPTURE_TRANSITIONS: Readonly<Record<CaptureState, readonly CaptureState[]>> = {
  suggested: ["open", "dismissed"],
  open: ["done"],
  dismissed: [],
  done: [],
};

export function canTransition(from: CaptureState, to: CaptureState): boolean {
  return CAPTURE_TRANSITIONS[from].includes(to);
}

export class UnknownCaptureError extends Error {
  constructor(readonly id: string) {
    super(`no captured item ${id}`);
  }
}

export class CaptureTransitionError extends Error {
  constructor(
    readonly id: string,
    readonly from: CaptureState,
    readonly to: CaptureState,
  ) {
    super(`a ${from} item cannot become ${to}`);
  }
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function sameText(a: string, b: string): boolean {
  return oneLine(a).toLocaleLowerCase() === oneLine(b).toLocaleLowerCase();
}

/**
 * The store as it is now. A missing file is empty; a corrupt one is replaced
 * with an empty store after a warning — the list is local state and must never
 * fail a build or a command.
 */
export async function readCaptures(
  root: string,
  warn?: (message: string) => void,
): Promise<Captures> {
  const file = projectPaths(root).captures;
  const read = await readJson(file);
  if (!read.found) return emptyCaptures();
  const parsed = "error" in read ? undefined : Captures.safeParse(read.value);
  if (parsed === undefined || !parsed.success) {
    warn?.(`ignored a corrupt ${file}; starting with an empty captured list`);
    // Replace it so the next read is clean; a failed repair is not fatal either.
    await atomicWriteJson(file, emptyCaptures()).catch(() => undefined);
    return emptyCaptures();
  }
  return parsed.data;
}

/** A rephrase from the model for one recorded message. */
export interface CaptureDraft {
  text: string;
  messageId: string;
}

export interface AddCapturesOptions {
  /** The time to stamp on new and touched items. */
  now: string;
  /** Existing items the session is still about; only their `updatedAt` moves. */
  duplicateOf?: readonly string[] | undefined;
}

/**
 * Drafts suggestions from one session's leftover work. A text the store already
 * holds as `suggested` or `open` is not added twice; `duplicateOf` items are
 * left untouched except for `updatedAt`. Returns only the items it added.
 */
export async function addCaptureSuggestions(
  root: string,
  sessionId: string,
  drafts: readonly CaptureDraft[],
  opts: AddCapturesOptions,
): Promise<CaptureItem[]> {
  if (!SESSION_ID.test(sessionId)) throw new Error(`not a session id: ${sessionId}`);
  const paths = projectPaths(root);
  return withLock(
    paths.lock("captures"),
    async () => {
      const store = await readCaptures(root);
      const items = [...store.items];
      const byId = new Map(items.map((item) => [item.id, item]));
      const touched = new Set<string>();
      for (const id of opts.duplicateOf ?? []) {
        const item = byId.get(id);
        if (item === undefined || (item.state !== "suggested" && item.state !== "open")) continue;
        item.updatedAt = opts.now;
        touched.add(id);
      }
      const known = items
        .filter((item) => item.state === "suggested" || item.state === "open")
        .map((item) => item.text);
      const taken = new Set(items.map((item) => item.id));
      const added: CaptureItem[] = [];
      for (const draft of drafts) {
        const text = oneLine(draft.text).slice(0, CAPTURE_TEXT_MAX);
        if (text === "" || known.some((seen) => sameText(seen, text))) continue;
        const id = newCaptureId(taken);
        taken.add(id);
        known.push(text);
        const item: CaptureItem = {
          id,
          text,
          state: "suggested",
          source: { sessionId, messageId: draft.messageId },
          createdAt: opts.now,
          updatedAt: opts.now,
        };
        items.push(item);
        added.push(item);
      }
      if (added.length === 0 && touched.size === 0) return [];
      await atomicWriteJson(paths.captures, { schema: CAPTURES_SCHEMA, items });
      return added;
    },
    { timeoutMs: 5000 },
  );
}

/**
 * Sets one item's state. Only the transitions in `CAPTURE_TRANSITIONS` are
 * allowed; `done` records `closedAt`.
 */
export async function setCaptureState(
  root: string,
  id: string,
  state: CaptureState,
  now: string,
): Promise<CaptureItem> {
  const paths = projectPaths(root);
  return withLock(
    paths.lock("captures"),
    async () => {
      const store = await readCaptures(root);
      const items = store.items.map((item) => ({ ...item }));
      const item = items.find((candidate) => candidate.id === id);
      if (item === undefined) throw new UnknownCaptureError(id);
      if (!canTransition(item.state, state))
        throw new CaptureTransitionError(id, item.state, state);
      item.state = state;
      item.updatedAt = now;
      if (state === "done") item.closedAt = now;
      await atomicWriteJson(paths.captures, { schema: CAPTURES_SCHEMA, items });
      return item;
    },
    { timeoutMs: 5000 },
  );
}
