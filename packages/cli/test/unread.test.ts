import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import { buildProject } from "../src/commands/build.js";
import { formatUnread, logUnread } from "../src/commands/log.js";
import { createProgram } from "../src/program.js";
import type { Session } from "../src/schema/session.js";
import { readProjectChanges } from "../src/store/changes.js";
import { projectPaths } from "../src/store/paths.js";
import { readReadState, setMessageRead } from "../src/store/read-state.js";
import { projectJson } from "../src/store/stores.js";
import {
  attachChanges,
  countBigUnread,
  messageChange,
  unreadMessages,
  unreadViewMessages,
} from "../src/view/change.js";
import { DATA_ELEMENT_ID } from "../src/view/model.js";
import { envFor, type FakeIo, fakeIo, T0, tempDir } from "./helpers.js";

const run = promisify(execFile);

const TEMPLATE = `<!doctype html><html><body><div id="root"></div>
    <script id="${DATA_ELEMENT_ID}" type="application/json"></script></body></html>`;
const DATA_PREFIX = `<script id="${DATA_ELEMENT_ID}" type="application/json">`;

const A = "h111111111111";
const B = "h222222222222";
const C = "h333333333333";

function session(nodes: Session["nodes"]): Session {
  return {
    schema: 1,
    sessionId: "s1",
    agent: "claude-code",
    title: "Ship the parser",
    startedAt: T0,
    updatedAt: T0,
    status: { goal: "Parse the file", done: [], pending: [], next: "" },
    nodes,
  };
}

function message(id: string, title: string, commits?: string[]): Session["nodes"][number] {
  return {
    id,
    parent: null,
    kind: "message",
    title,
    at: T0,
    ...(commits === undefined ? {} : { commits }),
  };
}

interface Embedded {
  sessions: {
    messages: {
      id: string;
      change?: { added: number; removed: number; files: number };
      commits?: string[];
    }[];
  }[];
  read?: string[];
}

function embedded(html: string): Embedded {
  const start = html.indexOf(DATA_PREFIX);
  const end = html.indexOf("</script>", start);
  return JSON.parse(html.slice(start + DATA_PREFIX.length, end));
}

describe("how much code landed per message (10.3)", () => {
  let dir: string;
  let root: string;
  let env: NodeJS.ProcessEnv;
  let io: FakeIo;

  const git = async (...args: string[]): Promise<string> =>
    (await run("git", ["-C", root, ...args])).stdout;

  const writeProject = async (nodes: Session["nodes"]): Promise<void> => {
    const paths = projectPaths(root);
    await mkdir(paths.sessions, { recursive: true });
    await writeFile(paths.project, projectJson({ schema: 1, name: "proj" }));
    await writeFile(paths.session("s1"), JSON.stringify(session(nodes)));
  };

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
    env = envFor(dir);
    io = fakeIo(env);
    await git("init", "-q");
    await git("config", "user.email", "t@example.com");
    await git("config", "user.name", "Tester");
    await writeFile(join(root, "base.txt"), "base\n");
    await git("add", "base.txt");
    await git("commit", "-q", "-m", "chore: base");
  });

  /** Creates the three commits this suite reads, with thoughts for A. */
  const createCommits = async (): Promise<{ first: string; second: string; third: string }> => {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "one.ts"), "a\nb\nc\nd\n");
    await git("add", "src/one.ts");
    await git("commit", "-q", "-m", "feat: one", "--trailer", `Thought: ${A}`);
    const first = (await git("rev-parse", "HEAD")).trim();

    await writeFile(join(root, "src", "one.ts"), "a\nB\nc\nd\n");
    await git("add", "src/one.ts");
    await git("commit", "-q", "-m", "fix: one", "--trailer", `Thought: ${A}`);
    const second = (await git("rev-parse", "HEAD")).trim();
    const secondShort = (await git("rev-parse", "--short", "HEAD")).trim();

    await writeFile(join(root, "src", "two.ts"), "1\n2\n3\n4\n5\n");
    await git("add", "src/two.ts");
    await git("commit", "-q", "-m", "feat: two");
    const third = (await git("rev-parse", "HEAD")).trim();

    // The record lists the second commit twice (short and full): the union is a
    // set of commits, so its lines count once.
    await writeProject([
      message(A, "Write the parser", [secondShort, second, second]),
      message(B, "Add the second file", [third]),
      message(C, "Write the docs"),
    ]);
    expect(first).toHaveLength(40);
    return { first, second, third };
  };

  it("sums numstat per message and counts a commit linked twice once", async () => {
    await createCommits();
    await buildProject({ dir: root, io, templateHtml: TEMPLATE });
    const html = await readFile(projectPaths(root).html, "utf8");
    const messages = embedded(html).sessions[0]?.messages ?? [];
    const a = messages.find((node) => node.id === A);
    const b = messages.find((node) => node.id === B);
    const c = messages.find((node) => node.id === C);

    // A: the trailer-only commit (4 added, 1 file) plus the recorded commit
    // (1 added, 1 removed, same file) — the duplicate hash adds nothing.
    expect(a?.change).toEqual({ added: 5, removed: 1, files: 1 });
    expect(b?.change).toEqual({ added: 5, removed: 0, files: 1 });
    // No commits: nothing shown, not a misleading zero.
    expect(c?.change).toBeUndefined();
  });

  it("counts one commit once even when the record lists it twice", () => {
    const full = "a".repeat(40);
    const changes = new Map([
      [full.slice(0, 7), { full, added: 7, removed: 3, files: ["src/one.ts"] }],
      [full, { full, added: 7, removed: 3, files: ["src/one.ts"] }],
    ]);
    expect(messageChange([full.slice(0, 7), full], changes)).toEqual({
      added: 7,
      removed: 3,
      files: 1,
    });
    // A commit git does not know leaves no numbers at all.
    expect(messageChange(["deadbee"], changes)).toBeUndefined();
    expect(messageChange(undefined, changes)).toBeUndefined();
  });

  it("round-trips the read mark and embeds it in the map", async () => {
    await createCommits();
    expect([...(await readReadState(root))]).toEqual([]);
    await setMessageRead(root, A, true);
    expect([...(await readReadState(root))]).toEqual([A]);

    await buildProject({ dir: root, io, templateHtml: TEMPLATE });
    const html = await readFile(projectPaths(root).html, "utf8");
    expect(embedded(html).read).toEqual([A]);

    await setMessageRead(root, A, false);
    expect([...(await readReadState(root))]).toEqual([]);
  });

  it("replaces an unreadable state file instead of blocking the toggle", async () => {
    await mkdir(join(projectPaths(root).base, "state"), { recursive: true });
    await writeFile(projectPaths(root).readState, "{not json");
    await setMessageRead(root, B, true);
    expect([...(await readReadState(root))]).toEqual([B]);
    await expect(setMessageRead(root, "not-a-message", true)).rejects.toThrow("not a message id");
  });

  it("lists unread messages most code first, and the threshold counts only big ones", () => {
    const sessions = [
      {
        sessionId: "s1",
        title: "Ship the parser",
        startedAt: T0,
        nodes: [
          {
            id: A,
            kind: "message",
            title: "Write the parser",
            change: { added: 900, removed: 100, files: 3 },
          },
          {
            id: B,
            kind: "message",
            title: "Add the second file",
            change: { added: 10, removed: 0, files: 1 },
          },
          { id: C, kind: "message", title: "No commits" },
        ],
      },
    ];
    const ordered = unreadMessages(sessions, new Set());
    expect(ordered.map((entry) => entry.messageId)).toEqual([A, B]);
    expect(countBigUnread(sessions, new Set(), 300)).toBe(1);
    expect(countBigUnread(sessions, new Set([A]), 300)).toBe(0);
    expect(unreadMessages(sessions, new Set([A, B])).map((entry) => entry.messageId)).toEqual([]);
  });

  it("prints `log --unread` most code first and drops a message once read", async () => {
    await createCommits();
    const unread = await logUnread({ dir: root, io });
    expect(unread.map((entry) => entry.messageId)).toEqual([A, B]);
    const lines = formatUnread(unread);
    expect(lines[0]).toContain("+5 −1 · 1 file");
    expect(lines[0]).toContain("Write the parser");
    expect(lines[1]).toContain("+5 −0 · 1 file");
    expect(io.lines).toEqual(lines);

    await setMessageRead(root, A, true);
    const after = await logUnread({ dir: root, io, json: true });
    expect(after.map((entry) => entry.messageId)).toEqual([B]);
    expect(JSON.parse(io.lines.at(-1) ?? "[]")).toHaveLength(1);

    // Nothing unread: one plain line, no invented numbers.
    await setMessageRead(root, B, true);
    const none = await logUnread({ dir: root, io });
    expect(none).toEqual([]);
    expect(io.lines.at(-1)).toBe("No unread messages with linked commits.");
  });
  it("drops a stale number when its commit no longer resolves", () => {
    const sessions = [
      {
        sessionId: "s1",
        title: "t",
        startedAt: T0,
        nodes: [
          { id: A, kind: "message", title: "Changed", change: { added: 9, removed: 9, files: 2 } },
        ],
      },
    ];
    // No changes at all: the records pass through untouched.
    expect(attachChanges(sessions, new Map())[0]?.nodes[0]?.change).toEqual({
      added: 9,
      removed: 9,
      files: 2,
    });
    const stale = attachChanges(
      sessions,
      new Map([["deadbee", { full: "f".repeat(40), added: 1, removed: 1, files: ["x"] }]]),
    );
    expect(stale[0]?.nodes[0]?.change).toBeUndefined();
    expect(
      unreadViewMessages(
        [{ sessionId: "s1", title: "t", startedAt: T0, messages: stale[0]?.nodes ?? [] }],
        new Set(),
      ),
    ).toHaveLength(0);
    expect(
      unreadViewMessages(
        [
          {
            sessionId: "s1",
            title: "t",
            startedAt: T0,
            messages: [
              {
                id: A,
                kind: "message",
                title: "Changed",
                change: { added: 4, removed: 0, files: 1 },
              },
            ],
          },
        ],
        new Set(),
      ).map((entry) => entry.messageId),
    ).toEqual([A]);
  });

  it("projects numstat paths onto a project inside a larger repository", async () => {
    const sub = join(root, "sub");
    await mkdir(sub);
    await writeFile(join(sub, "a.txt"), "a\nb\n");
    await writeFile(join(root, "outside.txt"), "x\ny\nz\n");
    await git("add", "sub/a.txt", "outside.txt");
    await git("commit", "-q", "-m", "feat: inside and outside");
    const full = (await git("rev-parse", "HEAD")).trim();

    const inside = await readProjectChanges(sub, [full]);
    expect(inside.get(full)).toEqual({
      full,
      added: 5,
      removed: 0,
      files: ["a.txt"],
    });

    // Empty input and a directory outside git resolve to nothing, never an error.
    expect(await readProjectChanges(sub, [])).toEqual(new Map());
    expect(await readProjectChanges(dir, [full])).toEqual(new Map());
  });

  it("is reachable as `cogit log --unread`", async () => {
    await createCommits();
    const program = createProgram(() => io);
    program.exitOverride();
    for (const command of program.commands) command.exitOverride();
    await program.parseAsync(["log", "--unread", "-C", root], { from: "user" });
    expect(io.lines.join("\n")).toContain("+5 −1 · 1 file");
    expect(io.lines.join("\n")).toContain("Write the parser");
  });
});
