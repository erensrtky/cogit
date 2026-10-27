import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DIFF_MAX_BYTES,
  diffTooLarge,
  isDiffSha,
  normalizeDiff,
  readCommitDiff,
} from "../src/diff.js";
import { noGitDir, tempDir } from "./helpers.js";

const run = promisify(execFile);

/**
 * Story 10.5: the diff the message details show comes from `git show`. The
 * endpoint's validation and the size/binary handling are pinned here; the
 * server tests cover its HTTP surface.
 */
describe("readCommitDiff", () => {
  let dir: string;
  let root: string;

  const git = async (...args: string[]): Promise<string> => {
    const { stdout } = await run("git", ["-C", root, ...args], {
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", HOME: dir },
    });
    return stdout;
  };

  const commit = async (message: string): Promise<string> => {
    await git("add", "-A");
    await git("commit", "-q", "-m", message);
    return (await git("rev-parse", "HEAD")).trim();
  };

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
    await git("init", "-q");
    await git("config", "user.email", "t@example.com");
    await git("config", "user.name", "Tester");
    await writeFile(join(root, "a.txt"), "one\n");
    await commit("feat: base");
  });

  it("answers no-git outside a repository", async () => {
    const plain = await noGitDir();
    expect(await readCommitDiff(plain, "abcdef0")).toEqual({
      ok: false,
      reason: "no-git",
    });
  });

  it("rejects anything that is not a hex hash before git sees it", async () => {
    expect(await readCommitDiff(root, "--help")).toEqual({
      ok: false,
      reason: "unknown-commit",
    });
    expect(await readCommitDiff(root, "abc")).toEqual({ ok: false, reason: "unknown-commit" });
    expect(await readCommitDiff(root, "a".repeat(41))).toEqual({
      ok: false,
      reason: "unknown-commit",
    });
  });

  it("answers an unknown commit instead of a git error", async () => {
    expect(await readCommitDiff(root, "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef")).toEqual({
      ok: false,
      reason: "unknown-commit",
    });
  });

  it("returns the commit's patch, also for a short hash", async () => {
    await writeFile(join(root, "a.txt"), "two\n");
    const sha = await commit("fix: two");
    const full = await readCommitDiff(root, sha);
    expect(full.ok).toBe(true);
    if (full.ok) {
      expect(full.text).toContain("diff --git a/a.txt b/a.txt");
      expect(full.text).toContain("-one");
      expect(full.text).toContain("+two");
    }
    const short = await readCommitDiff(root, sha.slice(0, 7).toUpperCase());
    expect(short).toEqual(full);
  });

  it("limits the patch to a file the commit touched", async () => {
    await writeFile(join(root, "a.txt"), "two\n");
    await writeFile(join(root, "b.txt"), "b\n");
    const sha = await commit("feat: both");
    const only = await readCommitDiff(root, sha, "a.txt");
    expect(only.ok).toBe(true);
    if (only.ok) {
      expect(only.text).toContain("a/a.txt");
      expect(only.text).not.toContain("b/b.txt");
    }
  });

  it("rejects a file the commit did not touch", async () => {
    await writeFile(join(root, "b.txt"), "b\n");
    const sha = await commit("feat: b only");
    expect(await readCommitDiff(root, sha, "a.txt")).toEqual({
      ok: false,
      reason: "file-not-in-commit",
    });
    expect(await readCommitDiff(root, sha, "../outside.txt")).toEqual({
      ok: false,
      reason: "file-not-in-commit",
    });
  });

  it("turns git's binary marker into one readable line", async () => {
    await writeFile(join(root, "img.bin"), Buffer.from([0, 1, 2, 0, 3]));
    const sha = await commit("feat: image");
    const result = await readCommitDiff(root, sha);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain("binary file changed");
      expect(result.text).not.toContain("Binary files");
    }
  });

  it("caps a patch past the size limit", async () => {
    const line = "x".repeat(100);
    await writeFile(
      join(root, "big.txt"),
      `${Array.from({ length: 5000 }, () => line).join("\n")}\n`,
    );
    const sha = await commit("feat: big");
    expect(await readCommitDiff(root, sha)).toEqual({ ok: false, reason: "too-large" });
    expect(DIFF_MAX_BYTES).toBe(400 * 1024);
  });

  it("caps a patch past the read buffer without crashing", async () => {
    await writeFile(join(root, "huge.txt"), `${"y".repeat(DIFF_MAX_BYTES * 9)}\n`);
    const sha = await commit("feat: huge");
    expect(await readCommitDiff(root, sha)).toEqual({ ok: false, reason: "too-large" });
  });
});

describe("diff helpers", () => {
  it("accepts 7–40 hex characters only", () => {
    expect(isDiffSha("abcdef0")).toBe(true);
    expect(isDiffSha("A".repeat(40))).toBe(true);
    expect(isDiffSha("abcdef")).toBe(false);
    expect(isDiffSha("a".repeat(41))).toBe(false);
    expect(isDiffSha("main")).toBe(false);
  });

  it("normalizes binary markers and reports whether one was seen", () => {
    expect(normalizeDiff("diff --git a/x b/x\nBinary files a/x and b/x differ\n")).toEqual({
      text: "diff --git a/x b/x\nbinary file changed\n",
      binary: true,
    });
    expect(normalizeDiff("plain\n")).toEqual({ text: "plain\n", binary: false });
  });

  it("names the command to run past the cap", () => {
    expect(diffTooLarge("abcdef0")).toContain("git show abcdef0");
  });
});
