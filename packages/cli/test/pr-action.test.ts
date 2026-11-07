import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { init } from "../src/commands/init.js";
import { installPrAction, PR_ACTION_WORKFLOW, prActionHint } from "../src/commands/pr-action.js";
import { createProgram } from "../src/program.js";
import { projectPaths } from "../src/store/paths.js";
import { envFor, type FakeIo, fakeIo, tempDir } from "./helpers.js";

const run = promisify(execFile);

/** `cogit pr --install-action` and the one-time tip that points at it. */
describe("the pull request Action", () => {
  let dir: string;
  let root: string;
  let env: NodeJS.ProcessEnv;
  let io: FakeIo;
  const workflow = (): string => join(root, ".github", "workflows", "cogit.yml");

  const setUp = async (git: "share" | "ignore"): Promise<void> => {
    await run("git", ["-C", root, "init", "-q", "-b", "main"], { env });
    await run("git", ["-C", root, "config", "user.email", "t@example.com"], { env });
    await run("git", ["-C", root, "config", "user.name", "Tester"], { env });
    await writeFile(join(root, "a.txt"), "a\n");
    await run("git", ["-C", root, "add", "a.txt"], { env });
    await run("git", ["-C", root, "commit", "-q", "-m", "base"], { env });
    await init(root, { name: "proj", git, retention: "keep", language: "auto" }, fakeIo(env));
  };

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
    env = { ...envFor(dir), HOME: dir, GIT_CONFIG_NOSYSTEM: "1" };
    io = fakeIo(env);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes the workflow once, and leaves a file already there alone", async () => {
    await setUp("share");
    await installPrAction(root, io);
    expect(await readFile(workflow(), "utf8")).toBe(PR_ACTION_WORKFLOW);
    expect(io.lines.join("\n")).toMatch(/Commit and push it/);

    await installPrAction(root, io);
    expect(io.lines.at(-1)).toBe(".github/workflows/cogit.yml is already there.");

    await writeFile(workflow(), "name: mine\n");
    await installPrAction(root, io);
    expect(io.lines.at(-1)).toMatch(/already exists and was left as it is/);
    expect(await readFile(workflow(), "utf8")).toBe("name: mine\n");
  });

  it("refuses in a project that keeps its record on this machine", async () => {
    await setUp("ignore");
    await expect(installPrAction(root, io)).rejects.toThrow(/cogit config git share/);
  });

  it("comments only on this repository's pull requests, once, and only with a thought", () => {
    expect(PR_ACTION_WORKFLOW).toContain(
      "if: github.event.pull_request.head.repo.full_name == github.repository",
    );
    expect(PR_ACTION_WORKFLOW).toContain("pull-requests: write");
    expect(PR_ACTION_WORKFLOW).toContain('pr "origin/$BASE"');
    expect(PR_ACTION_WORKFLOW).toContain("grep -q '^### ' cogit-pr.md || exit 0");
    expect(PR_ACTION_WORKFLOW).toContain('startswith("<!-- cogit-pr -->")');
  });

  it("tips a person once per clone, and not once the Action is there or nothing is shared", async () => {
    await setUp("share");
    expect(await prActionHint(root)).toMatch(/cogit pr --install-action/);
    expect(await prActionHint(root)).toBeUndefined();

    await writeFile(projectPaths(root).actionHint, "");
    const other = join(dir, "other");
    await mkdir(other);
    root = other;
    await setUp("ignore");
    expect(await prActionHint(root)).toBeUndefined();
  });

  it("stays quiet when the workflow is already in the repository", async () => {
    await setUp("share");
    await mkdir(join(root, ".github", "workflows"), { recursive: true });
    await writeFile(workflow(), PR_ACTION_WORKFLOW);
    expect(await prActionHint(root)).toBeUndefined();
  });

  it("runs from the command line, with the tip on stderr for a person only", async () => {
    await setUp("share");
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const cli = async (tty: boolean, ...args: string[]): Promise<void> => {
      await createProgram(() => io, { isTty: () => tty }).parseAsync(args, { from: "user" });
    };

    await cli(false, "pr", "-C", root);
    expect(stderr.mock.calls.flat().join("")).not.toContain("--install-action");
    await cli(true, "pr", "-C", root);
    expect(stderr.mock.calls.flat().join("")).toContain("--install-action");
    // The tip goes to stderr, so the Markdown a pipe reads stays clean.
    expect(io.lines.join("\n")).not.toContain("--install-action");

    await cli(true, "pr", "--install-action", "-C", root);
    expect(await readFile(workflow(), "utf8")).toBe(PR_ACTION_WORKFLOW);
  });
});
