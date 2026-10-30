import type { LineageViewModel, ViewSession } from "../../cli/src/view/model.js";
import { personKey, personLabel, sameAuthor } from "../../cli/src/view/people.js";

/** The map's person filter: everyone, the viewer's own sessions, or one person's by key. */
export type PersonFilter = null | "you" | { key: string };

export interface PersonOption {
  value: string;
  label: string;
}

/**
 * Whose sessions are whose on one map. The viewer is the git identity of the
 * machine that built the page; without it (an older page) the map falls back to
 * naming every author once there is more than one.
 */
export function peopleOf(model: Pick<LineageViewModel, "sessions" | "viewer">) {
  const viewer = model.viewer;
  const known = viewer !== undefined && personKey(viewer) !== undefined;
  const others = new Map<string, string>();
  for (const session of model.sessions) {
    const key = personKey(session);
    const label = personLabel(session);
    if (key === undefined || label === undefined) continue;
    if (known && sameAuthor(session, viewer)) continue;
    if (!others.has(key)) others.set(key, label);
  }
  const mine = (session: ViewSession): boolean | undefined =>
    known && personKey(session) !== undefined ? sameAuthor(session, viewer) : undefined;
  return {
    /** Whether the session is the viewer's own, by git identity; undefined when unknown. */
    mine,
    /** A teammate's session always says whose it is; your own never needs to. */
    showAuthor(session: ViewSession): boolean {
      if (session.author === undefined) return false;
      const own = mine(session);
      return own === undefined ? others.size > 1 : !own;
    },
    matches(session: ViewSession, filter: PersonFilter): boolean {
      if (filter === null) return true;
      if (filter === "you") return mine(session) !== false;
      return personKey(session) === filter.key;
    },
    /** The filter's choices; empty when everything on the map is one person's. */
    options(): PersonOption[] {
      const people = [...others].map(([key, label]) => ({ value: `person:${key}`, label }));
      if (people.length === 0 || (!known && people.length < 2)) return [];
      return [
        { value: "everyone", label: "Everyone" },
        ...(known ? [{ value: "you", label: "You" }] : []),
        ...people,
      ];
    },
  };
}

/** The select's value back to a filter. */
export function filterOf(value: string): PersonFilter {
  if (value === "you") return "you";
  if (value.startsWith("person:")) return { key: value.slice("person:".length) };
  return null;
}

/** A filter as the select's value. */
export function valueOf(filter: PersonFilter): string {
  if (filter === null) return "everyone";
  return filter === "you" ? "you" : `person:${filter.key}`;
}
