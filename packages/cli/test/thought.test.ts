import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import { blame } from "../src/commands/blame.js";
import { buildProject } from "../src/commands/build.js";
import { configSet } from "../src/commands/config.js";
import { hooksUninstall } from "../src/commands/hooks.js";
import { init } from "../src/commands/init.js";
import {
  type EffectiveSession,
  loadEffectiveSessions,
  resolveRef,
  show,
} from "../src/commands/log.js";
import { ensureGitignore } from "../src/git.js";
import {
  hookBlock,
  installGitHooks,
  runGitHook,
  uninstallGitHooks,
  withHookBlock,
  withoutHookBlock,
} from "../src/git-hooks.js";
import { messageHash } from "../src/messages.js";
import { createProgram } from "../src/program.js";
import type { Session } from "../src/schema/session.js";
import { projectPaths } from "../src/store/paths.js";
import { projectJson } from "../src/store/stores.js";
import {
  addThoughtTrailer,
  attachThoughtTrailers,
  earliestSessionStart,
  parseThoughtTrailers,
  readCommitThought,
  readThoughtTrailers,
} from "../src/thought.js";
import { buildMessages } from "../src/view/lineage.js";
import { DATA_ELEMENT_ID } from "../src/view/model.js";
import { envFor, type FakeIo, fakeIo, T0, tempDir } from "./helpers.js";

const run = promisify(execFile);

const NOW = new Date(T0);
const NEWEST_AT = "2026-10-21T10:05:00.000Z";

const TEMPLATE = `<!doctype html><html><body><div id="root"></div>
    <script id="${DATA_ELEMENT_ID}" type="application/json"></script></body></html>`;
const DATA_PREFIX = `<script id="${DATA_ELEMENT_ID}" type="application/json">`;

function embedded(html: string): {
  unassigned: { messages: { commits?: string[] }[] }[];
} {
  const start = html.indexOf(DATA_PREFIX);
  const end = html.indexOf("</script>", start);
  return JSON.parse(html.slice(start + DATA_PREFIX.length, end));
}

function session(nodes: Session["nodes"], id = "s1"): Session {
  return {
    schema: 1,
    sessionId: id,
    agent: "claude-code",
    title: "Ship it",
    epoch: null,
    startedAt: T0,
    updatedAt: T0,
    status: { goal: "", done: [], pending: [], next: "" },
    nodes,
  };
}

describe("the thought behind a commit (Story 9.4)", () => {
  let dir: string;
  let root: string;
  let env: NodeJS.ProcessEnv;
  let io: FakeIo;
  let transcript: string;

  const git = async (...args: string[]): Promise<string> =>
    (
      await run("git", ["-C", root, ...args], {
        env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", HOME: dir },
      })
    ).stdout;

  const writeProject = async (nodes: Session["nodes"]): Promise<void> => {
    const paths = projectPaths(root);
    await mkdir(paths.sessions, { recursive: true });
    await writeFile(paths.project, projectJson({ schema: 1, name: "proj", epochs: [] }));
    await writeFile(paths.session("s1"), JSON.stringify(session(nodes)));
  };

  const writeTranscript = async (id = "s1", text = "second"): Promise<string> => {
    const file = join(dir, "claude", "projects", "proj", `${id}.jsonl`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(
      file,
      [
        { type: "user", uuid: "u1", timestamp: T0, message: { content: "first" } },
        { type: "user", uuid: "u2", timestamp: NEWEST_AT, message: { content: text } },
      ]
        .map((line) => JSON.stringify(line))
        .join("\n") + "\n",
    );
    return file;
  };

  const thoughtOf = (text = "second", id = "s1"): string =>
    messageHash(id, { uuid: "u2", at: NEWEST_AT, text });

  const writeHead = async (at = T0, path: string | undefined = transcript): Promise<void> => {
    await writeFile(
      projectPaths(root).head,
      JSON.stringify({
        sessionId: "s1",
        ...(path === undefined ? {} : { transcriptPath: path }),
        at,
      }),
    );
  };

  /** A message file git would hand `prepare-commit-msg`; returns its path. */
  const messageFile = async (body = "feat: change the code\n"): Promise<string> => {
    const file = join(dir, "COMMIT_EDITMSG");
    await writeFile(file, body);
    return file;
  };

  const readMessage = (file: string): Promise<string> => readFile(file, "utf8");

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
    await mkdir(projectPaths(root).base, { recursive: true });
    env = envFor(dir);
    io = fakeIo(env);
    transcript = await writeTranscript();
    await git("init", "-q");
    await git("config", "user.email", "t@example.com");
    await git("config", "user.name", "Tester");
    await writeFile(join(root, "a.txt"), "one\n");
    await git("add", "a.txt");
    await git("commit", "-q", "-m", "feat: base");
  });

  describe("addThoughtTrailer", () => {
    it("writes the newest message's id as the Thought trailer, once", async () => {
      await writeHead();
      const file = await messageFile();
      expect(
        await addThoughtTrailer({ dir: root, messageFile: file, source: "message", env, now: NOW }),
      ).toBe(true);
      expect(await readMessage(file)).toContain(`Thought: ${thoughtOf()}`);

      // Running the hook twice (a hook re-run, an amend) never duplicates it.
      await addThoughtTrailer({ dir: root, messageFile: file, source: "message", env, now: NOW });
      const text = await readMessage(file);
      expect(text.match(/^Thought:/gm)).toHaveLength(1);
    });

    it("resolves a message file relative to git's working directory", async () => {
      await writeHead();
      const file = await messageFile();
      const rel = relative(process.cwd(), file);
      expect(
        await addThoughtTrailer({ dir: root, messageFile: rel, source: "message", env, now: NOW }),
      ).toBe(true);
      expect(await readMessage(file)).toContain(`Thought: ${thoughtOf()}`);
    });

    it("keeps a trailer the amended message already carried", async () => {
      await writeHead();
      const file = await messageFile(`feat: change\n\nThought: h999999999999\n`);
      await addThoughtTrailer({ dir: root, messageFile: file, source: "commit", env, now: NOW });
      const text = await readMessage(file);
      expect(text).toContain("Thought: h999999999999");
      expect(text).not.toContain(thoughtOf());
    });

    it("skips merges, squashes and an empty message-file argument", async () => {
      await writeHead();
      for (const source of ["merge", "squash"]) {
        const file = await messageFile();
        expect(
          await addThoughtTrailer({ dir: root, messageFile: file, source, env, now: NOW }),
        ).toBe(false);
        expect(await readMessage(file)).toBe("feat: change the code\n");
      }
      await expect(runGitHook("prepare-commit-msg", root, env, [], NOW)).resolves.toBeUndefined();
    });

    it("skips a stale HEAD and honours trailerMaxAgeHours", async () => {
      await writeHead();
      const stale = new Date(NOW.getTime() + 7 * 3_600_000);
      const file = await messageFile();
      expect(
        await addThoughtTrailer({
          dir: root,
          messageFile: file,
          source: "message",
          env,
          now: stale,
        }),
      ).toBe(false);

      await configSet("trailerMaxAgeHours", "12", io);
      expect(
        await addThoughtTrailer({
          dir: root,
          messageFile: file,
          source: "message",
          env,
          now: stale,
        }),
      ).toBe(true);
      expect(await readMessage(file)).toContain(`Thought: ${thoughtOf()}`);
    });

    it("skips a HEAD without a time, in the future, or with no readable transcript", async () => {
      const file = await messageFile();
      await writeFile(projectPaths(root).head, JSON.stringify({ sessionId: "s1" }));
      expect(
        await addThoughtTrailer({ dir: root, messageFile: file, source: "message", env, now: NOW }),
      ).toBe(false);

      await writeHead("not a date");
      expect(
        await addThoughtTrailer({ dir: root, messageFile: file, source: "message", env, now: NOW }),
      ).toBe(false);

      // Far enough ahead that a little clock skew no longer explains it.
      await writeHead(new Date(NOW.getTime() + 3_600_000).toISOString());
      expect(
        await addThoughtTrailer({ dir: root, messageFile: file, source: "message", env, now: NOW }),
      ).toBe(false);

      // Another session with no transcript anywhere: there is no message to name.
      await writeFile(
        projectPaths(root).head,
        JSON.stringify({ sessionId: "s2", transcriptPath: join(dir, "missing.jsonl"), at: T0 }),
      );
      expect(
        await addThoughtTrailer({ dir: root, messageFile: file, source: "message", env, now: NOW }),
      ).toBe(false);
      expect(await readMessage(file)).toBe("feat: change the code\n");
    });

    it("finds the transcript through CLAUDE_CONFIG_DIR when HEAD has no path", async () => {
      await writeHead(T0, undefined);
      const file = await messageFile();
      expect(
        await addThoughtTrailer({ dir: root, messageFile: file, source: "message", env, now: NOW }),
      ).toBe(true);
      expect(await readMessage(file)).toContain(`Thought: ${thoughtOf()}`);
    });

    it("skips an empty transcript and a disabled capture, not the ignore policy", async () => {
      await writeHead();
      await writeFile(transcript, "");
      const file = await messageFile();
      expect(
        await addThoughtTrailer({ dir: root, messageFile: file, source: "message", env, now: NOW }),
      ).toBe(false);

      // The record stays local, but the link still serves `blame` and `show` here.
      await writeTranscript();
      await ensureGitignore(root, "ignore");
      expect(
        await addThoughtTrailer({ dir: root, messageFile: file, source: "message", env, now: NOW }),
      ).toBe(true);
      await writeFile(file, "feat: change\n");

      expect(
        await addThoughtTrailer({
          dir: root,
          messageFile: file,
          source: "message",
          env: { ...env, COGIT_DISABLE: "1" },
          now: NOW,
        }),
      ).toBe(false);
    });

    it("runs through the CLI's prepare-commit-msg hook", async () => {
      await writeHead();
      const file = await messageFile();
      const program = createProgram(() => io);
      program.exitOverride().configureOutput({ writeOut: () => {}, writeErr: () => {} });
      await program.parseAsync(["hook", "prepare-commit-msg", "--dir", root, file, "message"], {
        from: "user",
      });
      expect(await readMessage(file)).toContain(`Thought: ${thoughtOf()}`);
    });
  });

  describe("reading trailers", () => {
    it("parses one commit line per commit, keeping the first valid id", () => {
      const a = "a".repeat(40);
      const b = "b".repeat(40);
      const parsed = parseThoughtTrailers(
        [
          `${a}\0h111111111111, h222222222222`,
          `${b}\0not-a-thought`,
          "no separator",
          `${a}\0`,
        ].join("\n"),
      );
      expect(parsed.get(a)).toBe("h111111111111");
      expect(parsed.has(b)).toBe(false);
    });

    it("reads the trailers git holds, and only since a date", async () => {
      await writeProject([]);
      const thought = thoughtOf();
      await git(
        "commit",
        "-q",
        "--allow-empty",
        "-m",
        "feat: code",
        "--trailer",
        `Thought: ${thought}`,
      );
      const full = (await git("rev-parse", "HEAD")).trim();
      expect((await readThoughtTrailers(root, { env })).get(full)).toBe(thought);
      expect(await readThoughtTrailers(root, { env, since: "2030-01-01T00:00:00.000Z" })).toEqual(
        new Map(),
      );
      // Outside a repository, or with a git that cannot run: no links, no error.
      expect(await readThoughtTrailers(dir)).toEqual(new Map());
      expect(await readThoughtTrailers(root, { env: { PATH: "/nonexistent" } })).toEqual(new Map());
    });

    it("unions trailer commits with the record and lets the trailer win a conflict", () => {
      const conflict = "a".repeat(40);
      const attached = "b".repeat(40);
      const untrailed = "f".repeat(40);
      const sessions = [
        session([
          {
            id: "h111111111111",
            parent: null,
            kind: "message",
            title: "A",
            commits: [conflict, untrailed],
          },
          { id: "h222222222222", parent: null, kind: "message", title: "B", commits: [] },
          { id: "phase", parent: null, kind: "phase", title: "Not a message", commits: [conflict] },
        ]),
      ];
      const [next] = attachThoughtTrailers(
        sessions,
        new Map([
          [conflict, "h222222222222"],
          [attached, "h222222222222"],
          ["c".repeat(40), "h999999999999"],
        ]),
      );
      const [a, b, phase] = next?.nodes ?? [];
      // The conflict moves to B; the commit no trailer names stays where it was.
      expect(a?.commits).toEqual([untrailed]);
      expect(b?.commits).toEqual([conflict, attached]);
      // Non-message nodes are not touched, and an unknown message is ignored.
      expect(phase?.commits).toEqual([conflict]);
      expect(attachThoughtTrailers(sessions, new Map())[0]).toBe(sessions[0]);
      expect(earliestSessionStart(sessions)).toBe(T0);
      expect(earliestSessionStart([])).toBeUndefined();
    });
  });

  describe("hook installation", () => {
    const userHook = "#!/bin/sh\necho user-hook\n";

    it("installs both events, keeps the user's lines, and uninstalls only its block", async () => {
      const preCommit = join(root, ".git", "hooks", "pre-commit");
      await writeFile(preCommit, userHook);
      await chmod(preCommit, 0o755);
      expect(await installGitHooks(root)).toEqual(["pre-commit", "prepare-commit-msg"]);
      expect(await readFile(preCommit, "utf8")).toBe(
        `${userHook}\n${hookBlock("pre-commit", root)}\n`,
      );
      expect(await readFile(join(root, ".git", "hooks", "prepare-commit-msg"), "utf8")).toContain(
        "cogit hook prepare-commit-msg",
      );
      expect(await installGitHooks(root)).toEqual([]);

      expect(await uninstallGitHooks(root)).toEqual(["pre-commit", "prepare-commit-msg"]);
      expect(await readFile(preCommit, "utf8")).toBe(userHook);
      // The file held nothing but cogit's shebang and block, so it is gone.
      expect(existsSync(join(root, ".git", "hooks", "prepare-commit-msg"))).toBe(false);
      expect(await uninstallGitHooks(root)).toEqual([]);
    });

    it("follows core.hooksPath and leaves a hook without the block alone", async () => {
      await git("config", "core.hooksPath", ".husky");
      await mkdir(join(root, ".husky"), { recursive: true });
      await writeFile(join(root, ".husky", "pre-commit"), userHook);
      await installGitHooks(root);
      expect(await readFile(join(root, ".husky", "prepare-commit-msg"), "utf8")).toContain(
        "cogit hook prepare-commit-msg",
      );
      expect(await uninstallGitHooks(root)).toEqual(["pre-commit", "prepare-commit-msg"]);
      expect(await readFile(join(root, ".husky", "pre-commit"), "utf8")).toBe(userHook);

      // No repository and no block: nothing to do.
      expect(await uninstallGitHooks(dir)).toEqual([]);
      expect(await uninstallGitHooks(root)).toEqual([]);
    });

    it("keeps the repository's own Conventional Commits hook intact", () => {
      // A copy of `.git/hooks/commit-msg` in this repository (the start-project one).
      const own =
        "#!/bin/sh\n# >>> start-project: commit-msg (Conventional Commits) >>>\n" +
        '_first="$(grep -vE \'^#\' "$1" | head -1)"\n' +
        'case "$_first" in\n    ""|"Merge "*) exit 0 ;;\nesac\nexit 0\n';
      const installed = withHookBlock(own, hookBlock("prepare-commit-msg", "/p"));
      expect(installed).toContain("start-project: commit-msg");
      expect(installed).toContain("cogit hook prepare-commit-msg");
      expect(withoutHookBlock(installed)).toBe(own);
    });

    it("removes nothing from a user hook without a block", () => {
      expect(withoutHookBlock("#!/bin/sh\necho mine\n")).toBe("#!/bin/sh\necho mine\n");
    });

    it("uninstalls through the CLI", async () => {
      await writeProject([]);
      await installGitHooks(root);
      const program = createProgram(() => io);
      program.exitOverride().configureOutput({ writeOut: () => {}, writeErr: () => {} });
      await program.parseAsync(["hooks", "uninstall", root], { from: "user" });
      expect(io.lines.at(-1)).toBe("Removed the cogit block from: pre-commit, prepare-commit-msg");

      await program.parseAsync(["hooks", "uninstall", root], { from: "user" });
      expect(io.lines.at(-1)).toBe("No cogit hook blocks to remove.");

      await hooksUninstall(root, io);
      expect(io.lines.at(-1)).toBe("No cogit hook blocks to remove.");
    });
  });

  it("init installs both hooks under the commit policy", async () => {
    await init(
      root,
      { name: "proj", retention: "keep", language: "auto", git: "commit" },
      fakeIo(env),
    );
    expect(await readFile(join(root, ".git", "hooks", "pre-commit"), "utf8")).toContain(
      "cogit hook pre-commit",
    );
    expect(await readFile(join(root, ".git", "hooks", "prepare-commit-msg"), "utf8")).toContain(
      "cogit hook prepare-commit-msg",
    );
  });

  it("attaches a trailer commit at build time, in log and in blame", async () => {
    const thought = thoughtOf();
    await writeProject([
      { id: thought, parent: null, kind: "message", title: "Ship the parser", at: T0 },
    ]);
    await writeFile(join(root, "a.txt"), "two\n");
    await git("add", "a.txt");
    await git("commit", "-q", "-m", "feat: parser", "--trailer", `Thought: ${thought}`);
    const full = (await git("rev-parse", "HEAD")).trim();

    await buildProject({ dir: root, io, templateHtml: TEMPLATE });
    const html = await readFile(projectPaths(root).html, "utf8");
    expect(embedded(html).unassigned[0]?.messages[0]?.commits).toContain(full);

    const effective = await loadEffectiveSessions(root, io);
    const commits = effective[0]?.messages[0]?.commits ?? [];
    expect(commits).toContain(full);

    // The read verb from code back to the why, by short hash.
    const model = await show({ dir: root, ref: full.slice(0, 7), io, chat: false });
    expect(model.title).toBe("Ship the parser");

    const hits = await blame({ dir: root, target: "a.txt", io });
    expect(hits.map((hit) => hit.messageId)).toEqual([thought]);
  });

  it("names the thought behind a commit that is not recorded yet", async () => {
    await writeProject([]);
    const thought = thoughtOf();
    await writeFile(join(root, "a.txt"), "two\n");
    await git("add", "a.txt");
    await git("commit", "-q", "-m", "feat: early", "--trailer", `Thought: ${thought}`);
    const short = (await git("rev-parse", "--short", "HEAD")).trim();
    expect(await readCommitThought(root, short)).toBe(thought);
    await expect(show({ dir: root, ref: short, io, chat: false })).rejects.toThrow(
      `commit ${short} comes from thought ${thought}, which is not recorded yet`,
    );

    // No trailer, an unknown ref or no repository: nothing to name.
    await git("commit", "-q", "--allow-empty", "-m", "chore: plain");
    const plain = (await git("rev-parse", "--short", "HEAD")).trim();
    expect(await readCommitThought(root, plain)).toBeUndefined();
    await expect(show({ dir: root, ref: plain, io, chat: false })).rejects.toThrow(
      `no recorded thought for commit ${plain}`,
    );
    expect(await readCommitThought(root, "f".repeat(7))).toBeUndefined();
    expect(await readCommitThought(dir, plain)).toBeUndefined();
  });

  it("resolves a commit ref and reports one it cannot place", () => {
    const commit = "d".repeat(40);
    const nodes = buildMessages([
      { id: "h111111111111", parent: null, kind: "message", title: "One", commits: [commit] },
      { id: "h222222222222", parent: null, kind: "message", title: "Two", commits: [commit] },
    ]);
    const entry: EffectiveSession = {
      session: session([]),
      messages: nodes,
      turns: null,
    };
    expect(resolveRef([entry], "d".repeat(7))).toMatchObject({ kind: "ambiguous" });
    expect(resolveRef([entry], "e".repeat(7))).toMatchObject({
      kind: "unknown",
      reason: "no recorded thought for commit eeeeeee",
    });
    expect(
      resolveRef([{ ...entry, messages: [nodes[0] as (typeof nodes)[number]] }], "d".repeat(7)),
    ).toMatchObject({ kind: "ok" });
  });
});
