import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { readCommitThought } from "../src/thought.js";

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
describe("the Thought trailer across history rewrites", () => {
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

  it("loses the link in a squash, whose message quotes the commits indented", async () => {
    const dir = await repo();
    await git(dir, "checkout", "-q", "-b", "feature");
    await commitFile(dir, "one.txt", "one", FIRST);
    await commitFile(dir, "two.txt", "two", SECOND);
    await git(dir, "checkout", "-q", "main");
    await git(dir, "merge", "-q", "--squash", "feature");
    // Git's own squash message: the commits quoted, their trailers indented
    // inside the body, so git reads no trailer at the end of the message.
    await git(dir, "commit", "-q", "--no-edit");

    await expect(readCommitThought(dir, "HEAD")).resolves.toBeUndefined();
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
