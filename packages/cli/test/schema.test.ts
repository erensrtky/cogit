import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Config } from "../src/schema/config.js";
import { mergeSession, repairTree } from "../src/schema/merge.js";
import { Project } from "../src/schema/project.js";
import {
  type LineageNode,
  Session,
  SessionInput,
  sessionInputJsonSchema,
} from "../src/schema/session.js";
import { parseVersioned } from "../src/schema/versioned.js";

const T0 = "2026-10-21T10:00:00.000Z";
const T1 = "2026-10-21T11:00:00.000Z";

const input = (v: unknown) => SessionInput.parse(v);
const node = (id: string, parent: string | null, title = id): LineageNode => ({
  id,
  parent,
  kind: "step",
  title,
});

describe("Session schema", () => {
  it("fills defaults for a minimal session", () => {
    const s = Session.parse({ schema: 1, sessionId: "abc", startedAt: T0, updatedAt: T0 });
    expect(s.agent).toBe("claude-code");
    expect(s.epoch).toBeNull();
    expect(s.status).toEqual({ goal: "", done: [], pending: [], next: "" });
    expect(s.nodes).toEqual([]);
  });

  it("rejects ids that are not safe slugs", () => {
    for (const sessionId of ["../etc", "a/b", "", ".hidden"]) {
      expect(SessionInput.safeParse({ sessionId }).success).toBe(false);
    }
  });

  it("rejects unknown node kinds", () => {
    const r = SessionInput.safeParse({
      sessionId: "a",
      nodes: [{ id: "n1", kind: "rant", title: "x" }],
    });
    expect(r.success).toBe(false);
  });

  it("keeps message links and a branch summary, and old records still parse", () => {
    const s = Session.parse({
      schema: 1,
      sessionId: "abc",
      startedAt: T0,
      updatedAt: T0,
      nodes: [
        {
          id: "m1",
          parent: null,
          kind: "message",
          title: "Start",
          branch: { title: "Setup", asked: "set it up", outcome: "done" },
        },
        { id: "m2", parent: "m1", kind: "message", title: "Next", links: ["m1"] },
        // An old record: a phase topic and a message whose parent is that phase.
        { id: "topic", parent: null, kind: "phase", title: "Old topic" },
        { id: "m3", parent: "topic", kind: "message", title: "Old message" },
      ],
    });
    expect(s.nodes[0]?.branch).toEqual({
      title: "Setup",
      asked: "set it up",
      outcome: "done",
      open: "",
    });
    expect(s.nodes[1]?.links).toEqual(["m1"]);
    expect(s.nodes[3]?.parent).toBe("topic");
  });

  it("limits links to five and branch texts to their lengths", () => {
    const message = (extra: object) => ({
      sessionId: "abc",
      nodes: [{ id: "m1", kind: "message", title: "x", ...extra }],
    });
    expect(input(message({ links: ["a", "b", "c", "d", "e"] })).nodes?.[0]?.links).toHaveLength(5);
    expect(SessionInput.safeParse(message({ links: ["a", "b", "c", "d", "e", "f"] })).success).toBe(
      false,
    );
    expect(
      SessionInput.safeParse(
        message({ branch: { title: "t".repeat(81), asked: "a", outcome: "o" } }),
      ).success,
    ).toBe(false);
    expect(
      SessionInput.safeParse(
        message({ branch: { title: "t", asked: "a", outcome: "o", open: "" } }),
      ).success,
    ).toBe(true);
  });

  it("exports a JSON Schema for the agent input", () => {
    const js = sessionInputJsonSchema() as { required?: string[]; properties?: object };
    expect(js.required).toEqual(["sessionId"]);
    expect(Object.keys(js.properties ?? {})).toContain("nodes");
  });
});

describe("Project and Config schemas", () => {
  it("defaults epochs and settings", () => {
    expect(Project.parse({ schema: 1, name: "p" }).epochs).toEqual([]);
    expect(Config.parse({ schema: 1 })).toMatchObject({
      language: "auto",
      updateEveryTurns: 5,
      sessionEndCatchUp: true,
      gitPolicy: "ignore",
    });
  });
});

describe("parseVersioned", () => {
  it("rejects non-objects and missing versions", () => {
    expect(parseVersioned([], Project, 1)).toMatchObject({ ok: false, error: "not a JSON object" });
    expect(parseVersioned({ name: "p" }, Project, 1)).toMatchObject({ ok: false });
  });

  it("migrates older documents step by step", () => {
    const ProjectV2 = Project.extend({ schema: z.literal(2) });
    const r = parseVersioned({ schema: 1, title: "p" }, ProjectV2, 2, {
      1: ({ title, ...rest }) => ({ ...rest, name: title }),
    });
    expect(r).toMatchObject({ ok: true, data: { schema: 2, name: "p" } });
  });

  it("fails when a migration step is missing", () => {
    const r = parseVersioned({ schema: 1, name: "p" }, Project, 2);
    expect(r).toMatchObject({ ok: false, error: "no migration from schema v1" });
  });

  it("reads newer documents best-effort with a warning", () => {
    const r = parseVersioned({ schema: 9, name: "p", extra: true }, Project, 1);
    expect(r.ok).toBe(true);
    expect(r.warnings[0]).toMatch(/newer/);
  });

  it("reports schema issues with their path", () => {
    const r = parseVersioned({ schema: 1, name: "" }, Project, 1);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/^name:/);
  });
});

describe("mergeSession", () => {
  it("keeps decision detail and re-stamps only when it changes", () => {
    const node = {
      id: "d",
      kind: "decision",
      title: "D",
      decidedBy: "agreed",
      alternatives: [{ option: "drag to resize", why: "user wanted auto size" }],
      commits: ["322259a"],
      files: ["packages/template/src/cardHeight.ts"],
    };
    const first = mergeSession(undefined, input({ sessionId: "s1", nodes: [node] }), T0).session;
    expect(first.nodes[0]).toMatchObject({ decidedBy: "agreed", commits: ["322259a"] });
    expect(
      mergeSession(first, input({ sessionId: "s1", nodes: [node] }), T1).session.nodes[0]
        ?.touchedAt,
    ).toBe(T0);
    const more = { ...node, commits: ["322259a", "61d2873"] };
    expect(
      mergeSession(first, input({ sessionId: "s1", nodes: [more] }), T1).session.nodes[0]
        ?.touchedAt,
    ).toBe(T1);
    expect(() =>
      input({ sessionId: "s1", nodes: [{ ...node, commits: ["not-a-hash"] }] }),
    ).toThrow();
  });

  it("stamps nodes when they are added or changed, never from agent input", () => {
    const node = { id: "a", kind: "step", title: "A", touchedAt: "2000-01-01T00:00:00.000Z" };
    const first = mergeSession(undefined, input({ sessionId: "s1", nodes: [node] }), T0).session;
    expect(first.nodes[0]?.touchedAt).toBe(T0);
    expect(first.nodes[0]?.addedAt).toBe(T0);
    const same = mergeSession(first, input({ sessionId: "s1", nodes: [node] }), T1).session;
    expect(same.nodes[0]?.touchedAt).toBe(T0);
    const moved = mergeSession(
      first,
      input({ sessionId: "s1", nodes: [{ ...node, title: "A2" }] }),
      T1,
    ).session;
    expect(moved.nodes[0]?.touchedAt).toBe(T1);
    expect(moved.nodes[0]?.addedAt).toBe(T0);
    // a node stored before the stamps existed never gets a made-up addedAt
    const legacy = {
      ...first,
      nodes: [{ id: "a", parent: null, kind: "step" as const, title: "A" }],
    };
    expect(
      mergeSession(legacy, input({ sessionId: "s1", nodes: [node] }), T1).session.nodes[0],
    ).not.toHaveProperty("addedAt");
  });

  it("creates a new session owned by the CLI timestamps", () => {
    const { session } = mergeSession(undefined, input({ sessionId: "s1", title: "x" }), T0);
    expect(session).toMatchObject({ schema: 1, startedAt: T0, updatedAt: T0, title: "x" });
  });

  it("upserts nodes by id and never removes them", () => {
    const first = mergeSession(
      undefined,
      input({
        sessionId: "s1",
        nodes: [
          { id: "n1", kind: "phase", title: "a", summary: "keep" },
          { id: "n2", parent: "n1", kind: "step", title: "b" },
        ],
      }),
      T0,
    ).session;
    const { session } = mergeSession(
      first,
      input({
        sessionId: "s1",
        nodes: [
          { id: "n2", kind: "step", title: "b2" },
          { id: "n3", kind: "decision", title: "c", why: "because" },
        ],
      }),
      T1,
    );
    expect(session.nodes.map((n) => n.id)).toEqual(["n1", "n2", "n3"]);
    expect(session.nodes[0]?.summary).toBe("keep");
    expect(session.nodes[1]).toMatchObject({ title: "b2", parent: "n1" });
    expect(session.nodes[2]?.parent).toBeNull();
    expect(session).toMatchObject({ startedAt: T0, updatedAt: T1 });
  });

  it("replaces status when sent and keeps fields that were not sent", () => {
    const first = mergeSession(
      undefined,
      input({ sessionId: "s1", title: "t", epoch: "e2e", status: { goal: "g", done: ["a"] } }),
      T0,
    ).session;
    const kept = mergeSession(first, input({ sessionId: "s1" }), T1).session;
    expect(kept).toMatchObject({ title: "t", epoch: "e2e" });
    expect(kept.status.done).toEqual(["a"]);

    const replaced = mergeSession(
      first,
      input({ sessionId: "s1", epoch: null, status: { goal: "g2" } }),
      T1,
    ).session;
    expect(replaced.epoch).toBeNull();
    expect(replaced.status).toEqual({ goal: "g2", done: [], pending: [], next: "" });
  });

  it("refuses to merge a different session", () => {
    const first = mergeSession(undefined, input({ sessionId: "s1" }), T0).session;
    expect(() => mergeSession(first, input({ sessionId: "s2" }), T1)).toThrow(/mismatch/);
  });
});

describe("cross-session references (Story 8.6)", () => {
  it("accepts <sessionId>:<id> in a parent or link and refuses a malformed one", () => {
    const parsed = input({
      sessionId: "s1",
      nodes: [{ id: "h1", kind: "message", title: "M", parent: "other:h0", links: ["other:h2"] }],
    });
    expect(parsed.nodes?.[0]?.parent).toBe("other:h0");
    expect(parsed.nodes?.[0]?.links).toEqual(["other:h2"]);
    for (const parent of ["a:b:c", ":h1", "a:", "other:h 1"]) {
      expect(
        SessionInput.safeParse({
          sessionId: "s1",
          nodes: [{ id: "h1", kind: "message", title: "M", parent }],
        }).success,
      ).toBe(false);
    }
  });

  it("leaves a cross-session parent out of the local tree repair", () => {
    const nodes = [node("a", "other:h1")];
    expect(repairTree(nodes)).toEqual([]);
    expect(nodes[0]?.parent).toBe("other:h1");
  });
});

describe("repairTree", () => {
  it("re-roots nodes with a missing parent", () => {
    const nodes = [node("a", "ghost")];
    expect(repairTree(nodes)).toEqual(["node a: parent ghost not found, moved to root"]);
    expect(nodes[0]?.parent).toBeNull();
  });

  it("breaks parent cycles", () => {
    const nodes = [node("a", "b"), node("b", "a"), node("c", "a")];
    const warnings = repairTree(nodes);
    expect(warnings).toHaveLength(1);
    expect(nodes.filter((n) => n.parent === null)).toHaveLength(1);
  });
});
