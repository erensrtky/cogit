import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import {
  knownCommits,
  readCommitChanges,
  readCommitFiles,
  readCommitSubjects,
} from "../src/git.js";
import { tempDir } from "./helpers.js";

const run = promisify(execFile);
const GONE = "0123456789abcdef0123456789abcdef01234567";

let repo: string;
let first: string;
let second: string;

async function git(...args: string[]): Promise<string> {
  return (await run("git", ["-C", repo, ...args])).stdout.trim();
}

beforeEach(async () => {
  repo = join(await tempDir(), "repo");
  await mkdir(repo, { recursive: true });
  await git("init", "-q");
  await git("config", "user.email", "t@example.com");
  await git("config", "user.name", "T");
  await writeFile(join(repo, "a.txt"), "one\n");
  await git("add", ".");
  await git("commit", "-q", "-m", "First");
  first = await git("rev-parse", "HEAD");
  await writeFile(join(repo, "b.txt"), "two\nlines\n");
  await git("add", ".");
  await git("commit", "-q", "-m", "Second");
  second = await git("rev-parse", "HEAD");
});

describe("reading recorded commits", () => {
  it("sorts out the hashes git no longer knows in one call", async () => {
    const known = await knownCommits(repo, [first, second.slice(0, 7), GONE]);
    expect(known).toEqual(new Set([first, second.slice(0, 7)]));
    expect(await knownCommits(join(repo, "nope"), [first])).toBeUndefined();
  });

  it("still reads every known commit when the record names one that is gone", async () => {
    const short = second.slice(0, 7);
    const hashes = [first, short, GONE];
    expect(await readCommitSubjects(repo, hashes)).toEqual(
      new Map([
        [first, "First"],
        [short, "Second"],
      ]),
    );
    expect(await readCommitFiles(repo, hashes)).toEqual(
      new Map([
        [first, ["a.txt"]],
        [short, ["b.txt"]],
      ]),
    );
    const changes = await readCommitChanges(repo, hashes);
    expect(changes.get(short)).toMatchObject({ full: second, added: 2, removed: 0 });
    expect(changes.has(GONE)).toBe(false);
  });

  it("reads nothing when every hash is gone", async () => {
    expect((await readCommitSubjects(repo, [GONE])).size).toBe(0);
    expect((await readCommitFiles(repo, [GONE])).size).toBe(0);
    expect((await readCommitChanges(repo, [GONE])).size).toBe(0);
  });
});
