import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { readCommitThought, readThoughtTrailers } from "../src/thought.js";

const run = promisify(execFile);

const ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "T",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "T",
  GIT_COMMITTER_EMAIL: "t@example.com",
};

const FIRST = "h111111111111";
const SECOND = "h222222222222";

/**
 * The link is a trailer in the commit message naming a *message*, never a
 * commit hash, so it has to survive the rewrites that change commit hashes.
 */
describe("the Thought link across history rewrites", () => {
  const git = async (dir: string, ...args: string[]): Promise<string> =>
    (await run("git", ["-C", dir, ...args], { env: ENV })).stdout;

  async function repo(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "cogit-rebase-"));
    await git(dir, "init", "-q", "-b", "main");
    await git(dir, "commit", "-q", "--allow-empty", "-m", "base");
    return dir;
  }

  it("follows the message through a rebase, though the hash changes", async () => {
    const dir = await repo();
    await git(dir, "checkout", "-q", "-b", "feature");
    await git(dir, "commit", "-q", "--allow-empty", "-m", "one", "-m", `Thought: ${FIRST}`);
    const before = (await git(dir, "rev-parse", "HEAD")).trim();

    await git(dir, "checkout", "-q", "main");
    await git(dir, "commit", "-q", "--allow-empty", "-m", "main moves on");
    await git(dir, "checkout", "-q", "feature");
    await git(dir, "rebase", "-q", "main");

    const after = (await git(dir, "rev-parse", "HEAD")).trim();
    expect(after).not.toBe(before);
    await expect(readCommitThought(dir, "HEAD")).resolves.toBe(FIRST);
  });

  /** One commit that changes a file, so a squash has something to carry. */
  const commitFile = async (dir: string, name: string, message: string, thought: string) => {
    await writeFile(join(dir, name), message);
    await git(dir, "add", name);
    await git(dir, "commit", "-q", "-m", message, "-m", `Thought: ${thought}`);
  };

  it("keeps both links through a squash merge, whose message quotes the commits", async () => {
    const dir = await repo();
    await git(dir, "checkout", "-q", "-b", "feature");
    await commitFile(dir, "one.txt", "one", FIRST);
    await commitFile(dir, "two.txt", "two", SECOND);
    await git(dir, "checkout", "-q", "main");
    await git(dir, "merge", "-q", "--squash", "feature");
    // Git's own squash message: the commits quoted, their trailers indented
    // inside the body, so git reads no trailer at the end of the message.
    await git(dir, "commit", "-q", "--no-edit");

    const head = (await git(dir, "rev-parse", "HEAD")).trim();
    const links = await readThoughtTrailers(dir, { env: ENV });
    expect(links.get(head)).toEqual([SECOND, FIRST]);
    // The squash was not made for one message, so no Shape is drawn from it.
    await expect(readCommitThought(dir, "HEAD")).resolves.toBeUndefined();
  });

  it("keeps both links through an interactive squash, which leaves two blocks", async () => {
    const dir = await repo();
    await commitFile(dir, "one.txt", "one", FIRST);
    await commitFile(dir, "two.txt", "two", SECOND);
    await run("git", ["-C", dir, "rebase", "-q", "-i", "HEAD~2"], {
      env: { ...ENV, GIT_SEQUENCE_EDITOR: "sed -i.bak '2s/^pick/squash/'", GIT_EDITOR: "true" },
    });

    const head = (await git(dir, "rev-parse", "HEAD")).trim();
    expect((await readThoughtTrailers(dir, { env: ENV })).get(head)).toEqual([FIRST, SECOND]);
  });

  it("finds no link in a squash that keeps only a title", async () => {
    const dir = await repo();
    await git(dir, "checkout", "-q", "-b", "feature");
    await commitFile(dir, "one.txt", "one", FIRST);
    await git(dir, "checkout", "-q", "main");
    await git(dir, "merge", "-q", "--squash", "feature");
    await git(dir, "commit", "-q", "-m", "PR title (#1)");

    const head = (await git(dir, "rev-parse", "HEAD")).trim();
    expect((await readThoughtTrailers(dir, { env: ENV })).has(head)).toBe(false);
  });

  /** What git shows the hook while it replays: `addThoughtTrailer` relies on this. */
  it("marks a rebase and a cherry-pick where the commit hook can see them", async () => {
    const dir = await repo();
    await git(dir, "checkout", "-q", "-b", "feature");
    await commitFile(dir, "one.txt", "one", FIRST);
    await git(dir, "checkout", "-q", "-b", "other", "main");
    await commitFile(dir, "two.txt", "two", SECOND);
    const picked = (await git(dir, "rev-parse", "HEAD")).trim();
    await git(dir, "checkout", "-q", "main");

    const log = join(dir, ".git", "hook.log");
    const hook = join(dir, ".git", "hooks", "prepare-commit-msg");
    await writeFile(
      hook,
      `#!/bin/sh\nfor s in rebase-merge rebase-apply CHERRY_PICK_HEAD; do [ -e "$(git rev-parse --absolute-git-dir)/$s" ] && echo "$s" >> "${log}"; done; exit 0\n`,
    );
    await chmod(hook, 0o755);

    await git(dir, "cherry-pick", picked);
    expect(await readFile(log, "utf8")).toContain("CHERRY_PICK_HEAD");
    await writeFile(log, "");
    await git(dir, "checkout", "-q", "feature");
    await git(dir, "rebase", "-q", "main");
    expect(await readFile(log, "utf8")).toContain("rebase-merge");
  });

  it("keeps the link a rewritten message ends with on purpose", async () => {
    const dir = await repo();
    await git(dir, "checkout", "-q", "-b", "feature");
    await commitFile(dir, "one.txt", "one", FIRST);
    await git(dir, "checkout", "-q", "main");
    await git(dir, "merge", "-q", "--squash", "feature");
    // The escape hatch: write the trailer back as the message's last block.
    await git(dir, "commit", "-q", "-m", "squashed", "-m", `Thought: ${FIRST}`);

    await expect(readCommitThought(dir, "HEAD")).resolves.toBe(FIRST);
  });
});
