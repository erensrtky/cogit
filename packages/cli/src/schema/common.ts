import { z } from "zod";

/** Ids end up in file names and HTML, so keep them to a safe slug. */
export const Slug = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/, "must be a slug: letters, digits, _ . -");

export const IsoDate = z.iso.datetime({ offset: true });

/**
 * A message reference in a parent or link (Story 8.6): a bare id for a message
 * of the same session, or `<sessionId>:<messageId>` for a message of an earlier
 * session of the same project. Both halves follow the slug rule.
 */
export const MessageRef = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}(:[A-Za-z0-9][A-Za-z0-9_.-]{0,127})?$/,
    "must be a node id or <sessionId>:<messageId>",
  );

export interface MessageRefParts {
  /** The other session, or null when the reference stays inside this one. */
  sessionId: string | null;
  id: string;
}

/** Splits `<sessionId>:<id>`; a bare id has no session. */
export function parseMessageRef(ref: string): MessageRefParts {
  const at = ref.indexOf(":");
  return at === -1
    ? { sessionId: null, id: ref }
    : { sessionId: ref.slice(0, at), id: ref.slice(at + 1) };
}
