import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import { buildProject } from "../src/commands/build.js";
import type { Session } from "../src/schema/session.js";
import { readProjectChanges } from "../src/store/changes.js";
import { projectPaths } from "../src/store/paths.js";
import { projectJson } from "../src/store/stores.js";
import { attachChanges, messageChange } from "../src/view/change.js";
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
});
