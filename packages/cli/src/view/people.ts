/* Kept free of Node imports: the map template uses these too. */

/**
 * Who a session belongs to (Story 9.3): the git identity it was recorded with.
 * Like git, a person is their email when there is one, else their name. A
 * session's thoughts are its author's own; another person's session is never
 * taken for a continuation of yours.
 */
export interface Author {
  author?: string | undefined;
  authorEmail?: string | undefined;
}

/**
 * Whether two sessions were recorded by the same person. Emails decide when both
 * have one, else names; a record from before authors were stamped matches
 * anyone, since it was made before teammates' records could be told apart.
 */
export function sameAuthor(a: Author, b: Author): boolean {
  if (a.authorEmail !== undefined && b.authorEmail !== undefined)
    return a.authorEmail.toLowerCase() === b.authorEmail.toLowerCase();
  if (a.author !== undefined && b.author !== undefined) return a.author === b.author;
  return true;
}

/** A person's label on the map: their name, else their email. */
export function personLabel(person: Author): string | undefined {
  return person.author ?? person.authorEmail;
}

/** One key per person, for grouping: the email when there is one, else the name. */
export function personKey(person: Author): string | undefined {
  return person.authorEmail?.toLowerCase() ?? person.author;
}
