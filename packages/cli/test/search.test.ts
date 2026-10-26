import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { init } from "../src/commands/init.js";
import { shortHash, stamp } from "../src/commands/log.js";
import { formatSearch, search } from "../src/commands/search.js";
import { createProgram } from "../src/program.js";
import type { Session } from "../src/schema/session.js";
import { appendConversationTurns } from "../src/store/conversations.js";
import { projectPaths } from "../src/store/paths.js";
import type { LineageViewModel, ViewNode } from "../src/view/model.js";
import {
  excerptFor,
  fold,
  hitMessageIds,
  hitSessionIds,
  isHashQuery,
  normalizeQuery,
  resolveHashPrefix,
  type SearchSource,
  searchLineage,
  searchSources,
  stepHitIndex,
} from "../src/view/search.js";
import { envFor, type FakeIo, fakeIo, T0, tempDir } from "./helpers.js";

const A = "h111111111111";
const B = "h111111222222";
const C = "h222222222222";

function session(over: Partial<Session> & { sessionId: string }): Session {
  return {
    schema: 1,
    agent: "claude-code",
    title: "",
    epoch: null,
    startedAt: T0,
    updatedAt: T0,
    status: { goal: "", done: [], pending: [], next: "" },
    nodes: [],
    ...over,
  };
}

const turn = (hash: string, label: string, at: string, text: string, replies: string[] = []) => ({
  id: hash,
  label,
  at,
  text,
  replies,
  tools: { commands: 0, files: [], other: 0 },
});

function message(over: Partial<ViewNode> & { id: string; title: string }): ViewNode {
  return { kind: "message", ...over };
}

describe("search folding", () => {
  it("folds Turkish letters both ways", () => {
    expect(fold("Işık")).toBe("isik");
    expect(fold("İSTANBUL")).toBe("istanbul");
    expect(fold("Şişli ĞÇÖÜ")).toBe("sisli gcou");
    expect(fold("I")).toBe(fold("ı"));
    expect(normalizeQuery("  Çok   Önemli ")).toBe("cok onemli");
  });

  it("keeps one line of context around the match", () => {
    expect(excerptFor("Fix the loop", "loop")).toBe("Fix the loop");
    const long = `${"a".repeat(100)} needle ${"b".repeat(100)}`;
    const excerpt = excerptFor(long, "needle");
    expect(excerpt).toContain("needle");
    expect(excerpt?.startsWith("…")).toBe(true);
    expect(excerpt?.endsWith("…")).toBe(true);
    expect(excerptFor("nothing here", "needle")).toBeNull();
  });
});

describe("searchSources", () => {
  const sources: SearchSource[] = [
    {
      sessionId: "s1",
      title: "Parser work",
      startedAt: "2026-10-20T09:00:00.000Z",
      updatedAt: "2026-10-20T10:00:00.000Z",
      messages: [
        message({ id: A, title: "Start the parser", at: "2026-10-20T09:00:00.000Z", label: "m1" }),
        message({
          id: B,
          title: "Fix the loop",
          label: "m2",
          at: "2026-10-20T09:30:00.000Z",
          why: "The loop ate one line.",
          branch: {
            title: "Reading files",
            asked: "How do we read a file?",
            outcome: "One reader.",
            open: "",
          },
        }),
        message({
          id: C,
          title: "Işık testi",
          label: "m3",
          at: "2026-10-20T10:00:00.000Z",
          alternatives: [{ option: "Use a lamp", why: "Cheaper than the sun" }],
          agentDecisions: [
            {
              title: "Kept the switch",
              why: "It works.",
              alternatives: [{ option: "Replace it", why: "Too slow." }],
            },
          ],
        }),
      ],
      chat: [
        turn(A, "m1", "2026-10-20T09:00:00.000Z", "Start the parser", [
          "The reader lives in src/app.ts.",
        ]),
        turn(B, "m2", "2026-10-20T09:30:00.000Z", "Fix the loop"),
        turn(C, "m3", "2026-10-20T10:00:00.000Z", "Işık testi"),
      ],
    },
    {
      sessionId: "s2",
      title: "Other chat",
      status: {
        goal: "A goal about deployment",
        done: ["Shipped search docs"],
        pending: [{ text: "Write the tests", needsUser: false }],
        next: "Test it",
      },
      startedAt: "2026-10-21T09:00:00.000Z",
      updatedAt: "2026-10-21T09:10:00.000Z",
      messages: [
        message({ id: "h333333333333", title: "Unrelated", at: "2026-10-21T09:10:00.000Z" }),
      ],
    },
  ];

  it("reports where the match is and keeps one hit per message", () => {
    const hits = searchSources(sources, "parser");
    // The session title and the message title are separate rows; the message's
    // conversation repeats "parser" and does not add a third row for it.
    expect(hits).toHaveLength(2);
    const messageHit = hits.find((hit) => hit.messageId === A);
    expect(messageHit?.field).toBe("title");
    expect(messageHit?.label).toBe("m1");
    const sessionHit = hits.find((hit) => hit.messageId === null);
    expect(sessionHit?.field).toBe("session");
    expect(sessionHit?.excerpt).toContain("Parser work");
  });

  it("matches branches and the stored conversation, newest first", () => {
    const branch = searchSources(sources, "read a file");
    expect(branch).toHaveLength(1);
    expect(branch[0]?.field).toBe("branch");
    expect(branch[0]?.messageId).toBe(B);

    const conversation = searchSources(sources, "src/app.ts");
    expect(conversation).toHaveLength(1);
    expect(conversation[0]?.field).toBe("conversation");
    expect(conversation[0]?.excerpt).toContain("src/app.ts");

    const hits = searchSources(sources, "the");
    const times = hits.map((hit) => Date.parse(hit.at ?? ""));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("finds Turkish words typed without their accents", () => {
    const hits = searchSources(sources, "isik");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.messageId).toBe(C);
    expect(hits[0]?.field).toBe("title");
  });

  it("matches a session's status and returns no hits for an empty query", () => {
    const hits = searchSources(sources, "deployment");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.messageId).toBeNull();
    expect(hits[0]?.field).toBe("session");
    expect(searchSources(sources, "search docs")[0]?.messageId).toBeNull();
    expect(searchSources(sources, "the tests")[0]?.messageId).toBeNull();
    expect(searchSources(sources, "   ")).toEqual([]);
  });

  it("reads alternatives and the agent's own decisions", () => {
    expect(searchSources(sources, "lamp")[0]?.field).toBe("title");
    expect(searchSources(sources, "kept the switch")[0]?.messageId).toBe(C);
    expect(searchSources(sources, "replace it")[0]?.messageId).toBe(C);
  });

  it("orders equal times by message label, newest message first", () => {
    const at = "2026-10-20T11:00:00.000Z";
    const tied: SearchSource[] = [
      {
        sessionId: "s9",
        title: "Equal",
        startedAt: at,
        updatedAt: at,
        messages: [
          message({ id: "haaaaaaaa0001", title: "tie one", label: "m1", at }),
          message({ id: "haaaaaaaa0002", title: "tie two", label: "m2", at }),
          // No label (a record older than 8.5) sorts last at the same time.
          message({ id: "haaaaaaaa0003", title: "tie three", at }),
        ],
      },
    ];
    expect(searchSources(tied, "tie").map((hit) => hit.label)).toEqual(["m2", "m1", null]);
  });

  it("feeds the map: which sessions open and which messages highlight", () => {
    const hits = searchSources(sources, "parser");
    expect(hitSessionIds(hits)).toEqual(["s1"]);
    expect([...hitMessageIds(hits).keys()]).toEqual(["s1"]);
    expect([...(hitMessageIds(hits).get("s1") ?? [])]).toEqual([A]);
  });

  it("steps the counter within the list", () => {
    expect(stepHitIndex(0, 12, 1)).toBe(1);
    expect(stepHitIndex(11, 12, 1)).toBe(11);
    expect(stepHitIndex(0, 12, -1)).toBe(0);
    expect(stepHitIndex(0, 0, 1)).toBe(0);
  });
});

describe("hash jump", () => {
  const model: LineageViewModel = {
    kind: "lineage",
    schema: 1,
    project: { name: "p", path: "/tmp/p", generatedAt: T0 },
    status: { goal: "", done: [], pending: [], next: "", lastActivity: null },
    epochs: [
      {
        id: "e1",
        title: "Epoch one",
        createdAt: T0,
        sessions: [
          {
            sessionId: "s1",
            agent: "claude-code",
            title: "One",
            epoch: "e1",
            startedAt: T0,
            updatedAt: T0,
            status: { goal: "", done: [], pending: [], next: "" },
            messages: [
              message({ id: A, title: "First", at: T0, label: "m1" }),
              message({ id: B, title: "Second", at: T0, label: "m2" }),
              message({ id: C, title: "Third", at: T0, label: "m3" }),
            ],
            transcriptAvailable: true,
          },
        ],
      },
    ],
    unassigned: [],
  };

  it("recognises a hash and resolves only a unique prefix", () => {
    expect(isHashQuery(A)).toBe(true);
    expect(isHashQuery("h111111")).toBe(true);
    expect(isHashQuery("h11111")).toBe(false);
    expect(isHashQuery("start")).toBe(false);

    expect(resolveHashPrefix(model, "h222222")).toEqual({
      kind: "ok",
      sessionId: "s1",
      messageId: C,
      label: "m3",
      title: "Third",
    });
    expect(resolveHashPrefix(model, "h111111")).toEqual({ kind: "ambiguous", count: 2 });
    expect(resolveHashPrefix(model, "h999999")).toEqual({ kind: "none" });
  });

  it("searches the whole page model through the same matcher", () => {
    const hits = searchLineage(model, "second");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.messageId).toBe(B);
    expect(hits[0]?.sessionTitle).toBe("One");
  });
});

describe("cogit search", () => {
  let dir: string;
  let root: string;
  let io: FakeIo;

  /** Runs the command through Commander, as the user's shell does. */
  async function cli(...args: string[]): Promise<string> {
    let err = "";
    const program = createProgram(() => io, {
      launch: async () => true,
      server: async () => null,
      stdin: async () => "",
    });
    program.exitOverride().configureOutput({ writeErr: (s) => (err += s), writeOut: () => {} });
    for (const c of program.commands)
      c.exitOverride().configureOutput({ writeErr: (s) => (err += s) });
    try {
      await program.parseAsync(args, { from: "user" });
    } catch (e) {
      if (!err) throw e;
    }
    return err;
  }

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
    io = fakeIo(envFor(dir));
    await init(root, { name: "proj", retention: "keep", language: "auto" }, fakeIo(envFor(dir)));

    const s1 = session({
      sessionId: "s1",
      title: "Ship the parser",
      epoch: "e8",
      startedAt: "2026-10-20T09:00:00.000Z",
      updatedAt: "2026-10-20T10:00:00.000Z",
      nodes: [
        {
          id: A,
          parent: null,
          kind: "message",
          title: "Start the parser",
          at: "2026-10-20T09:00:00.000Z",
        },
        {
          id: B,
          parent: A,
          kind: "message",
          title: "Işık testi",
          at: "2026-10-20T09:30:00.000Z",
        },
      ],
    });
    const s2 = session({
      sessionId: "s2",
      title: "Later chat",
      startedAt: "2026-10-21T10:00:00.000Z",
      updatedAt: "2026-10-21T10:10:00.000Z",
      nodes: [
        {
          id: C,
          parent: "s1:h111111111111",
          kind: "message",
          title: "Continue the parser",
          at: "2026-10-21T10:00:00.000Z",
        },
      ],
    });
    await writeFile(projectPaths(root).session("s1"), JSON.stringify(s1));
    await writeFile(projectPaths(root).session("s2"), JSON.stringify(s2));
    await appendConversationTurns(root, "s1", [
      {
        id: "m1",
        uuid: "u1",
        hash: A,
        at: "2026-10-20T09:00:00.000Z",
        text: "Start the parser",
        replies: ["The reader lives in src/app.ts."],
        tools: { commands: 0, files: [], other: 0 },
      },
      {
        id: "m2",
        uuid: "u2",
        hash: B,
        at: "2026-10-20T09:30:00.000Z",
        text: "Işık testi",
        replies: [],
        tools: { commands: 0, files: [], other: 0 },
      },
    ]);
  });

  it("prints hash, label, time, where and an excerpt, newest first", async () => {
    const model = await search({ dir: root, io, text: "parser" });
    // C is the newest message; s1's session-title hit carries its updatedAt,
    // which is newer than the first message it also matches.
    expect(model.hits.map((hit) => hit.messageId)).toEqual([C, null, A]);
    expect(io.lines[0]).toBe(
      `${shortHash(C)}  m1    ${stamp("2026-10-21T10:00:00.000Z")}  title  Later chat`,
    );
    expect(io.lines[3]).toContain("Ship the parser");
    expect(io.lines[5]).toContain("Start the parser");
    expect(formatSearch(model)[0]).toContain("Later chat");
  });

  it("finds stored conversation text and Turkish without accents", async () => {
    const conversation = await search({ dir: root, io: fakeIo(envFor(dir)), text: "src/app.ts" });
    expect(conversation.hits).toHaveLength(1);
    expect(conversation.hits[0]?.field).toBe("conversation");

    const turkish = await search({ dir: root, io: fakeIo(envFor(dir)), text: "isik" });
    expect(turkish.hits.map((hit) => hit.messageId)).toContain(B);
  });

  it("limits, filters by session and prints JSON", async () => {
    const limited = await search({ dir: root, io: fakeIo(envFor(dir)), text: "parser", limit: 1 });
    expect(limited.hits).toHaveLength(1);

    const onlySession = await search({
      dir: root,
      io: fakeIo(envFor(dir)),
      text: "parser",
      session: "s2",
    });
    expect(onlySession.hits.every((hit) => hit.sessionId === "s2")).toBe(true);

    const jsonIo = fakeIo(envFor(dir));
    await search({ dir: root, io: jsonIo, text: "parser", json: true });
    const parsed = JSON.parse(jsonIo.lines.join("\n")) as {
      query: string;
      hits: { sessionId: string; messageId: string | null; field: string; excerpt: string }[];
    };
    expect(parsed.query).toBe("parser");
    expect(parsed.hits[0]).toMatchObject({
      sessionId: "s2",
      messageId: C,
      field: "title",
    });
    expect(parsed.hits[0]?.excerpt).toContain("parser");
  });

  it("refuses an empty query and an unknown session", async () => {
    await expect(search({ dir: root, io, text: "   " })).rejects.toThrow(/needs some text/);
    await expect(search({ dir: root, io, text: "parser", session: "nope" })).rejects.toThrow(
      /no session matches/,
    );
  });

  it("runs through the program with -n and --json", async () => {
    const err = await cli("search", "parser", root, "-n", "1", "--json");
    expect(err).toBe("");
    const parsed = JSON.parse(io.lines.join("\n")) as { hits: unknown[] };
    expect(parsed.hits).toHaveLength(1);
  });
});
