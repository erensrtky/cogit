import { describe, expect, it } from "vitest";
import type { ViewSession } from "../../cli/src/view/model.js";
import { filterOf, peopleOf, valueOf } from "../src/people.js";

const session = (sessionId: string, author?: string, authorEmail?: string): ViewSession => ({
  sessionId,
  agent: "claude-code",
  title: sessionId,
  ...(author === undefined ? {} : { author }),
  ...(authorEmail === undefined ? {} : { authorEmail }),
  startedAt: "2026-10-22T09:00:00.000Z",
  updatedAt: "2026-10-22T09:00:00.000Z",
  status: { goal: "", done: [], pending: [], next: "" },
  messages: [],
  transcriptAvailable: true,
});

const mine = session("a", "Eren", "e@x.dev");
const theirs = session("b", "Ayşe", "a@x.dev");
const old = session("c");
const viewer = { author: "Eren", authorEmail: "e@x.dev" };

describe("peopleOf", () => {
  it("names a teammate's session and never your own", () => {
    const people = peopleOf({ sessions: [mine, theirs, old], viewer });
    expect(people.showAuthor(mine)).toBe(false);
    expect(people.showAuthor(theirs)).toBe(true);
    expect(people.showAuthor(old)).toBe(false);
  });

  it("offers Everyone, You and each teammate, and fades the rest", () => {
    const people = peopleOf({ sessions: [mine, theirs, old], viewer });
    expect(people.options()).toEqual([
      { value: "everyone", label: "Everyone" },
      { value: "you", label: "You" },
      { value: "person:a@x.dev", label: "Ayşe" },
    ]);
    expect(people.matches(theirs, "you")).toBe(false);
    expect(people.matches(old, "you")).toBe(true);
    expect(people.matches(theirs, { key: "a@x.dev" })).toBe(true);
    expect(people.matches(mine, { key: "a@x.dev" })).toBe(false);
    expect(people.matches(theirs, null)).toBe(true);
  });

  it("offers nothing on a map that is all one person's", () => {
    expect(peopleOf({ sessions: [mine, old], viewer }).options()).toEqual([]);
  });

  it("without a viewer, names authors once there are two", () => {
    const one = peopleOf({ sessions: [mine, old] });
    expect(one.showAuthor(mine)).toBe(false);
    expect(one.options()).toEqual([]);
    const two = peopleOf({ sessions: [mine, theirs] });
    expect(two.showAuthor(mine)).toBe(true);
    expect(two.options().map((option) => option.label)).toEqual(["Everyone", "Eren", "Ayşe"]);
  });
});

describe("the filter's select value", () => {
  it("round-trips", () => {
    for (const filter of [null, "you", { key: "a@x.dev" }] as const)
      expect(filterOf(valueOf(filter))).toEqual(filter);
  });
});
