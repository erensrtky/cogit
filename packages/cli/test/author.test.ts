import { describe, expect, it } from "vitest";
import { sameAuthor, stampedIdentity } from "../src/author.js";
import { resolveContinues } from "../src/view/lineage.js";
import type { ViewSession } from "../src/view/model.js";

describe("sameAuthor", () => {
  it("tells people apart by email, whatever their names", () => {
    expect(sameAuthor({ author: "Eren", authorEmail: "E@x.dev" }, { authorEmail: "e@x.dev" })).toBe(
      true,
    );
    expect(
      sameAuthor(
        { author: "Eren", authorEmail: "e@x.dev" },
        { author: "Eren", authorEmail: "o@x.dev" },
      ),
    ).toBe(false);
  });

  it("falls back to names, and lets a record without an author match anyone", () => {
    expect(sameAuthor({ author: "Eren" }, { author: "Ayşe", authorEmail: "a@x.dev" })).toBe(false);
    expect(sameAuthor({ author: "Eren" }, { author: "Eren" })).toBe(true);
    expect(sameAuthor({}, { author: "Ayşe" })).toBe(true);
  });
});

describe("stampedIdentity", () => {
  const here = { author: "Eren", authorEmail: "e@x.dev" };

  it("stamps this machine's identity on a new record", () => {
    expect(stampedIdentity(undefined, here)).toEqual(here);
  });

  it("keeps a record's own author and adds the email only for the same name", () => {
    expect(stampedIdentity({ author: "Eren" }, here)).toEqual(here);
    expect(stampedIdentity({ author: "Ayşe" }, here)).toEqual({ author: "Ayşe" });
    expect(stampedIdentity({ author: "Ayşe", authorEmail: "a@x.dev" }, here)).toEqual({
      author: "Ayşe",
      authorEmail: "a@x.dev",
    });
    expect(stampedIdentity(undefined, {})).toEqual({});
  });
});

describe("resolveContinues", () => {
  const session = (sessionId: string, author: string, parent: string | null): ViewSession => ({
    sessionId,
    agent: "claude-code",
    title: sessionId,
    author,
    startedAt: "2026-10-22T09:00:00.000Z",
    updatedAt: "2026-10-22T09:00:00.000Z",
    status: { goal: "", done: [], pending: [], next: "" },
    messages: [{ id: "h1", label: "m1", kind: "message", title: "One", parent }],
    transcriptAvailable: true,
  });

  it("never draws a session as the continuation of a teammate's", () => {
    const sessions = [
      session("a", "Eren", null),
      session("b", "Eren", "a:h1"),
      session("c", "Ayşe", "a:h1"),
    ];
    resolveContinues(sessions);
    expect(sessions[1]?.messages[0]?.continues?.sessionId).toBe("a");
    expect(sessions[2]?.messages[0]?.continues).toBeUndefined();
    expect(sessions[2]?.messages[0]?.parent).toBeNull();
  });
});
