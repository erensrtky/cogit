import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import { doctor } from "../src/commands/doctor.js";
import { init } from "../src/commands/init.js";
import { pruneCutoff, pruneRecords } from "../src/commands/prune.js";
import { installGitHooks, runGitHook } from "../src/git-hooks.js";
import { runHook } from "../src/hooks/run.js";
import { prepareRecords } from "../src/record-prepare.js";
import {
  addRecordRefspec,
  countUnsentRecords,
  deleteRecords,
  downloadRecords,
  importRecords,
  isSharing,
  pushLanded,
  queueRecords,
  RECORD_REFSPEC,
  reconcileRecords,
  recordSyncStatus,
  restoreCommittedRecords,
  sendAfterPush,
  sendRecords,
  snapshotRecords,
  syncRemote,
  trackedRecordFiles,
} from "../src/record-sync.js";
import type { Session } from "../src/schema/session.js";
import { projectPaths } from "../src/store/paths.js";
import { resolveProjectRoot } from "../src/store/root.js";
import { loadSession, updateConfig } from "../src/store/stores.js";
import { envFor, fakeIo, T0, tempDir } from "./helpers.js";

const run = promisify(execFile);
const TEMPLATE =
  '<!doctype html><html><head><script id="cogit-data" type="application/json"></script></head></html>';

describe("the record on its own refs", () => {
  let dir: string;
  let remote: string;
  let alice: string;
  let env: NodeJS.ProcessEnv;
  let gitEnv: NodeJS.ProcessEnv;

  const git = async (cwd: string, ...args: string[]): Promise<string> => {
    const { stdout } = await run("git", ["-C", cwd, ...args], { env: gitEnv });
    return stdout;
  };

  const session = (id: string, title: string, email: string, updatedAt = T0): Session => ({
    schema: 1,
    sessionId: id,
    agent: "claude-code",
    title,
    startedAt: T0,
    updatedAt,
    authorEmail: email,
    status: { goal: "", done: [], pending: [], next: "" },
    nodes: [],
  });

  const record = async (root: string, id: string, title: string, email: string): Promise<void> => {
    const paths = projectPaths(root);
    await mkdir(paths.sessions, { recursive: true });
    await writeFile(paths.session(id), JSON.stringify(session(id, title, email)));
    await writeFile(paths.events(id), `{"event":"${title}"}\n`);
  };

  const title = async (root: string, id: string): Promise<string | undefined> => {
    const loaded = await loadSession(root, id);
    return loaded.found && loaded.ok ? loaded.data.title : undefined;
  };

  const refs = async (cwd: string, base = "refs/cogit"): Promise<string[]> =>
    (await git(cwd, "for-each-ref", "--format=%(refname)", base)).split("\n").filter(Boolean);

  /** A second person's clone, as `git clone` leaves it: no refspec, no hooks, no record. */
  const cloneAs = async (name: string): Promise<string> => {
    const target = join(dir, name);
    await run("git", ["clone", "-q", remote, target], { env: gitEnv });
    await git(target, "config", "user.email", `${name}@example.com`);
    await git(target, "config", "user.name", name);
    return target;
  };

  const initShared = async (root: string): Promise<void> => {
    await init(
      root,
      { name: "proj", git: "share", retention: "keep", allowSkill: false, projectSettings: false },
      fakeIo(env),
    );
  };

  const push = async (root: string): Promise<number> => {
    const queued = await queueRecords(root, env);
    if (queued > 0) await sendRecords(root, env);
    return queued;
  };

  beforeEach(async () => {
    dir = await tempDir();
    env = envFor(dir);
    gitEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", HOME: dir };
    env = { ...env, GIT_CONFIG_NOSYSTEM: "1", HOME: dir };
    remote = join(dir, "remote.git");
    await run("git", ["init", "-q", "--bare", "-b", "main", remote], { env: gitEnv });
    alice = join(dir, "alice");
    await mkdir(alice);
    await git(alice, "init", "-q", "-b", "main");
    await git(alice, "config", "user.email", "alice@example.com");
    await git(alice, "config", "user.name", "alice");
    await git(alice, "remote", "add", "origin", remote);
    await writeFile(join(alice, "a.txt"), "one\n");
    await initShared(alice);
    await git(alice, "add", "-A");
    await git(alice, "commit", "-q", "-m", "feat: base");
    await git(alice, "push", "-q", "-u", "origin", "main");
  });

  it("keeps the record out of git: only the marker is tracked", async () => {
    await record(alice, "s1", "First", "alice@example.com");
    const tracked = (await git(alice, "ls-files")).split("\n").filter(Boolean);
    expect(tracked).toEqual(
      expect.arrayContaining([".cogit/.gitignore", ".cogit/project.json", "a.txt"]),
    );
    expect(tracked.some((file) => file.includes("sessions"))).toBe(false);
    expect(await git(alice, "status", "--short")).toBe("");
  });

  it("carries a session between two clones without a new command", async () => {
    await record(alice, "s1", "First", "alice@example.com");
    expect(await push(alice)).toBe(1);
    expect(await git(alice, "status", "--short")).toBe("");

    const bob = await cloneAs("bob");
    expect(existsSync(projectPaths(bob).session("s1"))).toBe(false);
    expect(await git(bob, "for-each-ref", "refs/cogit", "refs/cogit-remote")).toBe("");

    await prepareRecords(bob, env, () => {});
    expect(await title(bob, "s1")).toBe("First");
    expect(await readFile(projectPaths(bob).events("s1"), "utf8")).toContain("First");

    // From now on a plain `git pull` brings records, even with no new code.
    await record(alice, "s2", "Second", "alice@example.com");
    await push(alice);
    await git(bob, "pull", "-q");
    await reconcileRecords(bob, env);
    expect(await title(bob, "s2")).toBe("Second");
    expect(await git(bob, "status", "--short")).toBe("");
  });

  it("stays out of branches and git log --all", async () => {
    await record(alice, "s1", "First", "alice@example.com");
    await push(alice);
    expect((await git(alice, "log", "--all", "--oneline")).trim().split("\n")).toHaveLength(1);
    expect(await git(alice, "branch", "-a")).not.toContain("cogit");
  });

  it("sends only when the person pushes, and only to the sync remote", async () => {
    await record(alice, "s1", "First", "alice@example.com");
    await snapshotRecords(alice, env);
    expect(await git(alice, "ls-remote", remote, "refs/cogit/*")).toBe("");
    expect(await countUnsentRecords(alice, env, "deploy")).toBe(0);
    expect(await countUnsentRecords(alice, env, "origin")).toBe(1);
    expect(await sendRecords(alice, env)).toBe(0);
    expect(await git(alice, "ls-remote", remote, "refs/cogit/*")).toBe("");
    await push(alice);
    expect(await git(alice, "ls-remote", remote, "refs/cogit/*")).toContain("s1");
  });

  it("lets a session update reach a teammate, and keeps two people's refs apart", async () => {
    await record(alice, "s1", "First", "alice@example.com");
    await push(alice);
    const bob = await cloneAs("bob");
    await prepareRecords(bob, env, () => {});

    await record(alice, "s1", "First, longer", "alice@example.com");
    await record(bob, "b1", "Bob's", "bob@example.com");
    await Promise.all([push(alice), push(bob)]);
    await git(alice, "pull", "-q");
    await git(bob, "pull", "-q");
    await reconcileRecords(alice, env);
    await reconcileRecords(bob, env);
    expect(await title(bob, "s1")).toBe("First, longer");
    expect(await title(alice, "b1")).toBe("Bob's");
  });

  it("never lets a fetch overwrite what this clone has not sent", async () => {
    await record(alice, "s1", "Sent", "alice@example.com");
    await push(alice);
    await record(alice, "s1", "Not sent yet", "alice@example.com");
    await snapshotRecords(alice, env);
    await downloadRecords(alice, env);
    await importRecords(alice, env);
    expect(await title(alice, "s1")).toBe("Not sent yet");
    expect(await git(alice, "rev-parse", "refs/cogit/sessions/s1")).not.toBe(
      await git(alice, "rev-parse", "refs/cogit-remote/sessions/s1"),
    );
  });

  it("does not send a teammate's session as its own", async () => {
    await record(alice, "s1", "First", "alice@example.com");
    await push(alice);
    const bob = await cloneAs("bob");
    await prepareRecords(bob, env, () => {});
    expect(await queueRecords(bob, env)).toBe(0);
    // A stale or hand-edited copy of Alice's session is still hers to send.
    await record(bob, "s1", "Edited by accident", "alice@example.com");
    expect(await queueRecords(bob, env)).toBe(0);
    expect(await refs(bob)).toEqual([]);
  });

  it("brings the files back after git clean", async () => {
    await record(alice, "s1", "Survives", "alice@example.com");
    await snapshotRecords(alice, env);
    await git(alice, "clean", "-fdxq");
    expect(existsSync(projectPaths(alice).session("s1"))).toBe(false);
    await reconcileRecords(alice, env);
    expect(await title(alice, "s1")).toBe("Survives");
    expect(await readFile(projectPaths(alice).events("s1"), "utf8")).toContain("Survives");
  });

  it("keeps the raw chat local unless shareConversations is on", async () => {
    const conversation = projectPaths(alice).conversation("s1");
    await mkdir(join(alice, ".cogit", "conversations"), { recursive: true });
    await writeFile(conversation, "chat");
    await record(alice, "s1", "First", "alice@example.com");
    await push(alice);
    const names = async (): Promise<string> =>
      git(alice, "ls-tree", "--name-only", "refs/cogit/sessions/s1");
    expect(await names()).not.toContain("conversation");

    await updateConfig((config) => ({ ...config, shareConversations: true }), env);
    await push(alice);
    expect(await names()).toContain("conversation");
    const bob = await cloneAs("bob");
    await prepareRecords(bob, env, () => {});
    expect(await readFile(projectPaths(bob).conversation("s1"), "utf8")).toBe("chat");
  });

  it("does nothing at all for a project that keeps its record private", async () => {
    await init(
      alice,
      { name: "proj", retention: "keep", allowSkill: false, projectSettings: false },
      fakeIo(env),
    );
    const privateRoot = join(dir, "private");
    await mkdir(privateRoot);
    await git(privateRoot, "init", "-q", "-b", "main");
    await git(privateRoot, "remote", "add", "origin", remote);
    const io = fakeIo(env);
    await init(privateRoot, { name: "p", retention: "keep", allowSkill: false }, io);
    expect(io.asked[0]).toMatch(/Share the session records/);
    expect(await isSharing(privateRoot)).toBe(false);
    await record(privateRoot, "s1", "Private", "alice@example.com");
    expect(await snapshotRecords(privateRoot, env)).toBe(0);
    expect(await queueRecords(privateRoot, env)).toBe(0);
    expect(await countUnsentRecords(privateRoot, env, "origin")).toBe(0);
    expect(await refs(privateRoot)).toEqual([]);
    expect(await git(privateRoot, "config", "--get-all", "remote.origin.fetch")).not.toContain(
      "cogit",
    );
  });

  it("works with no remote, and with an unusable one reports it", async () => {
    await git(alice, "remote", "remove", "origin");
    await record(alice, "s1", "First", "alice@example.com");
    expect(await syncRemote(alice, env)).toBeUndefined();
    expect(await addRecordRefspec(alice, env)).toBe(false);
    expect(await queueRecords(alice, env)).toBe(0);
    expect(await sendRecords(alice, env)).toBe(0);
    expect(await downloadRecords(alice, env)).toBe(false);
    expect((await recordSyncStatus(alice, env)).remote).toBeUndefined();

    await git(alice, "remote", "add", "upstream", join(dir, "nowhere.git"));
    expect(await syncRemote(alice, env)).toBe("upstream");
    await queueRecords(alice, env);
    expect(await sendRecords(alice, env)).toBe(0);
    const failed = await recordSyncStatus(alice, env);
    expect(failed.pending).toBe(1);
    expect(failed.sendError).toBeTruthy();

    // Kept for the next try, and sent once the remote works.
    await git(alice, "remote", "set-url", "upstream", remote);
    expect(await sendRecords(alice, env)).toBe(1);
    const sent = await recordSyncStatus(alice, env);
    expect(sent.pending).toBe(0);
    expect(sent.sendError).toBeUndefined();
  });

  it("says why when the first download fails", async () => {
    await record(alice, "s1", "First", "alice@example.com");
    await push(alice);
    const bob = await cloneAs("bob");
    await git(bob, "remote", "set-url", "origin", join(dir, "nowhere.git"));
    const warnings: string[] = [];
    await prepareRecords(bob, env, (line) => warnings.push(line));
    expect(warnings.join()).toMatch(/could not download/);
    const status = await recordSyncStatus(bob, env);
    expect(status.downloaded).toBe(false);
    expect(status.downloadError).toBeTruthy();

    await git(bob, "remote", "set-url", "origin", remote);
    await prepareRecords(bob, env, () => {});
    expect(await title(bob, "s1")).toBe("First");
    expect((await recordSyncStatus(bob, env)).downloadError).toBeUndefined();
  });

  it("adds the refspec once, in this clone's config only", async () => {
    const bob = await cloneAs("bob");
    expect(await addRecordRefspec(bob, env)).toBe(true);
    expect(await addRecordRefspec(bob, env)).toBe(false);
    expect(await git(bob, "config", "--local", "--get-all", "remote.origin.fetch")).toContain(
      RECORD_REFSPEC,
    );
    await expect(
      run("git", ["config", "--global", "--get-all", "remote.origin.fetch"], { env: gitEnv }),
    ).rejects.toThrow();
  });

  it("sets up hooks in a clone on cogit's first run", async () => {
    const bob = await cloneAs("bob");
    expect(existsSync(join(bob, ".git", "hooks", "pre-push"))).toBe(false);
    await prepareRecords(bob, env, () => {});
    expect(await readFile(join(bob, ".git", "hooks", "pre-push"), "utf8")).toContain(
      "cogit hook pre-push",
    );
  });

  it("announces in the pre-push hook and hands the send to the background", async () => {
    await record(alice, "s1", "First", "alice@example.com");
    const started: string[][] = [];
    const spawned = ((_cli: string, args: string[]) => {
      started.push(args);
    }) as never;
    const stderr = process.stderr.write;
    const printed: string[] = [];
    process.stderr.write = ((text: string) => {
      printed.push(text);
      return true;
    }) as typeof process.stderr.write;
    const sha = "a".repeat(40);
    const zero = "0".repeat(40);
    const hook = (remoteName: string, refs: string): Promise<void> =>
      runGitHook(
        "pre-push",
        alice,
        env,
        [remoteName, remote],
        new Date(T0),
        spawned,
        async () => refs,
      );
    try {
      await hook("origin", `refs/heads/main ${sha} refs/heads/main ${zero}\n`);
      await hook("deploy", `refs/heads/main ${sha} refs/heads/main ${zero}\n`);
      await hook("origin", `(delete) ${zero} refs/heads/old ${sha}\n`);
      await hook("origin", "");
      await runGitHook("pre-push", alice, env, ["deploy", remote], new Date(T0), spawned);
    } finally {
      process.stderr.write = stderr;
    }
    expect(started).toHaveLength(2);
    expect(started[0]?.slice(0, 4)).toEqual([
      "record-sync",
      "send-pushed",
      "--after",
      `refs/heads/main=${sha}`,
    ]);
    expect(started[1]?.slice(0, 3)).toEqual(["record-sync", "send-pushed", "-C"]);
    expect(printed.join("")).toContain("1 session record will follow this push to origin");
    // Nothing is queued until the push has landed.
    expect((await recordSyncStatus(alice, env)).pending).toBe(0);
  });

  it("sends only after the code has landed", async () => {
    const quick = { intervalMs: 1, timeoutMs: 30 };
    await record(alice, "s1", "First", "alice@example.com");
    const head = (await git(alice, "rev-parse", "HEAD")).trim();
    const unpushed = "b".repeat(40);

    // A dry run or a rejected push: the remote never holds it, so nothing goes.
    expect(await sendAfterPush(alice, env, `refs/heads/main=${unpushed}`, quick)).toBe(0);
    expect(await git(alice, "ls-remote", remote, "refs/cogit/*")).toBe("");
    expect((await recordSyncStatus(alice, env)).pending).toBe(0);

    expect(await sendAfterPush(alice, env, `refs/heads/main=${head}`, quick)).toBe(1);
    expect(await git(alice, "ls-remote", remote, "refs/cogit/*")).toContain("s1");

    // Nothing to land: `git push` with the code already there still sends.
    await record(alice, "s2", "Second", "alice@example.com");
    expect(await sendAfterPush(alice, env)).toBe(1);

    await git(alice, "remote", "remove", "origin");
    expect(await pushLanded(alice, env, "refs/heads/main", head, quick)).toBe(false);
  });

  describe("a project that used to commit its record", () => {
    /** Alice committed sessions under an older version; Bob has them, and one of his own. */
    const committed = async (): Promise<string> => {
      await record(alice, "old1", "Alice old", "alice@example.com");
      await git(
        alice,
        "add",
        "-f",
        projectPaths(alice).session("old1"),
        projectPaths(alice).events("old1"),
      );
      await git(alice, "commit", "-qm", "chore: record");
      await git(alice, "push", "-q");
      const bob = await cloneAs("bob");
      await record(bob, "old2", "Bob old", "bob@example.com");
      await git(bob, "add", "-f", projectPaths(bob).session("old2"));
      await git(bob, "commit", "-qm", "chore: record");
      await git(bob, "push", "-q");
      await git(alice, "pull", "-q");
      await git(alice, "rm", "-rq", "--cached", ".cogit/sessions");
      await git(alice, "commit", "-qm", "chore: stop tracking the cogit record");
      await git(alice, "push", "-q");
      return bob;
    };

    it("brings back what the pull deleted from a teammate's disk", async () => {
      const bob = await committed();
      await git(bob, "pull", "-q");
      expect(existsSync(projectPaths(bob).session("old2"))).toBe(false);
      await prepareRecords(bob, env, () => {});
      expect(await title(bob, "old1")).toBe("Alice old");
      expect(await title(bob, "old2")).toBe("Bob old");
      expect(await readFile(projectPaths(bob).events("old1"), "utf8")).toContain("Alice old");
      // Already public in history: nothing goes out again.
      expect(await countUnsentRecords(bob, env, "origin")).toBe(0);
      expect(await git(bob, "status", "--short")).toBe("");
    });

    it("gives a new clone the old sessions too", async () => {
      await committed();
      const carol = await cloneAs("carol");
      await prepareRecords(carol, env, () => {});
      expect(await title(carol, "old1")).toBe("Alice old");
      expect(await title(carol, "old2")).toBe("Bob old");
    });

    it("reads a commit once, so a later prune stays deleted", async () => {
      const bob = await committed();
      await git(bob, "pull", "-q");
      expect(await restoreCommittedRecords(bob, env)).toBe(2);
      expect(await restoreCommittedRecords(bob, env)).toBe(0);
      await deleteRecords(bob, ["old2"], env);
      await writeFile(join(bob, "a.txt"), "new\n");
      await git(bob, "commit", "-qam", "feat: later");
      expect(await restoreCommittedRecords(bob, env)).toBe(0);
      expect(existsSync(projectPaths(bob).session("old2"))).toBe(false);
    });

    it("ignores other deleted files, and does nothing without history or sharing", async () => {
      await writeFile(join(alice, ".cogit", "sessions-note"), "x");
      const empty = join(dir, "empty");
      await mkdir(empty);
      await git(empty, "init", "-q", "-b", "main");
      await initShared(empty);
      expect(await restoreCommittedRecords(empty, env)).toBe(0);
      await mkdir(projectPaths(alice).sessions, { recursive: true });
      await writeFile(join(alice, ".cogit", "sessions", "bad name.json"), "{}");
      await git(alice, "add", "-f", join(alice, ".cogit", "sessions", "bad name.json"));
      await git(alice, "commit", "-qm", "chore: odd file");
      await git(alice, "rm", "-q", "--cached", join(alice, ".cogit", "sessions", "bad name.json"));
      await git(alice, "commit", "-qm", "chore: drop it");
      await rm(join(alice, ".cogit", "sessions", "bad name.json"));
      expect(await restoreCommittedRecords(alice, env)).toBe(0);
      await writeFile(join(alice, ".gitignore"), "/.cogit/\n");
      expect(await restoreCommittedRecords(alice, env)).toBe(0);
    });
  });

  it("a real git push fires the hook and never fails because of it", async () => {
    await installGitHooks(alice);
    await record(alice, "s1", "First", "alice@example.com");
    await writeFile(join(alice, "a.txt"), "two\n");
    await git(alice, "commit", "-qam", "feat: more");
    await git(alice, "remote", "set-url", "--push", "origin", remote);
    await expect(git(alice, "push", "-q", "origin", "main")).resolves.toBe("");
    expect(await git(alice, "ls-remote", remote, "refs/heads/main")).toContain("main");
  });

  it("deletes from the remote first, and from nowhere when that fails", async () => {
    await record(alice, "s1", "First", "alice@example.com");
    await push(alice);
    await git(alice, "remote", "set-url", "origin", join(dir, "nowhere.git"));
    await expect(deleteRecords(alice, ["s1"], env)).rejects.toThrow();
    expect(existsSync(projectPaths(alice).session("s1"))).toBe(true);
    expect(await refs(alice)).toHaveLength(1);

    await git(alice, "remote", "set-url", "origin", remote);
    await deleteRecords(alice, ["s1"], env);
    expect(existsSync(projectPaths(alice).session("s1"))).toBe(false);
    expect(await refs(alice)).toEqual([]);
    expect(await refs(alice, "refs/cogit-remote")).toEqual([]);
    expect(await git(alice, "ls-remote", remote, "refs/cogit/*")).toBe("");
    // Nothing comes back on the next look.
    await reconcileRecords(alice, env);
    expect(existsSync(projectPaths(alice).session("s1"))).toBe(false);
  });

  it("gives a monorepo's projects separate namespaces", async () => {
    const sub = join(alice, "packages", "app");
    await mkdir(sub, { recursive: true });
    await initShared(sub);
    await record(sub, "app1", "App session", "alice@example.com");
    await record(alice, "root1", "Root session", "alice@example.com");
    await snapshotRecords(sub, env);
    await snapshotRecords(alice, env);
    const names = await refs(alice);
    expect(names).toContain("refs/cogit/sessions/root1");
    expect(
      names.some((name) => /refs\/cogit\/projects\/[0-9a-f]+\/sessions\/app1/.test(name)),
    ).toBe(true);
  });

  it("ignores a ref whose name could not be a session file", async () => {
    const tree = (
      await run("sh", ["-c", `git -C "${alice}" mktree </dev/null`], { env: gitEnv })
    ).stdout.trim();
    await git(alice, "update-ref", "refs/cogit-remote/sessions/nested/evil", tree);
    expect(await importRecords(alice, env)).toBe(0);
    expect(existsSync(join(alice, ".cogit", "sessions", "nested"))).toBe(false);
  });

  it("uses the main checkout's record from a worktree, though the marker is tracked", async () => {
    const worktree = join(dir, "wt");
    await git(alice, "worktree", "add", "-q", "-b", "wt", worktree);
    expect(existsSync(projectPaths(worktree).project)).toBe(true);
    const resolved = await resolveProjectRoot(worktree);
    expect(resolved.root).toBe(alice);
  });

  it("tells an old project what to do about its tracked sessions", async () => {
    await git(alice, "config", "user.name", "alice");
    await record(alice, "old", "Old", "alice@example.com");
    await git(alice, "add", "-f", projectPaths(alice).session("old"));
    expect(await trackedRecordFiles(alice, env)).toBe(1);
    const report = await doctor({ dir: alice, io: fakeIo(env), json: false } as never);
    const check = report.checks.find((item) => item.id === "record");
    expect(check?.status).toBe("warn");
    expect(check?.fix).toContain("git rm -r --cached .cogit/sessions");
  });

  it("reports a failed send and a failed download in doctor", async () => {
    const check = async (root: string) => {
      const report = await doctor({ dir: root, io: fakeIo(env), json: false } as never);
      return report.checks.find((item) => item.id === "record");
    };
    expect((await check(alice))?.message).toContain("shared through origin");

    await record(alice, "s1", "First", "alice@example.com");
    await queueRecords(alice, env);
    await git(alice, "remote", "set-url", "origin", join(dir, "nowhere.git"));
    await sendRecords(alice, env);
    expect((await check(alice))?.message).toMatch(/1 session record could not be sent/);

    await git(alice, "remote", "set-url", "origin", remote);
    await sendRecords(alice, env);
    const bob = await cloneAs("bob");
    await git(bob, "remote", "set-url", "origin", join(dir, "nowhere.git"));
    await downloadRecords(bob, env);
    const failed = await check(bob);
    expect(failed?.message).toMatch(/could not be downloaded/);
    expect(failed?.message).toContain("fatal:");

    await git(alice, "remote", "remove", "origin");
    expect((await check(alice))?.message).toContain("no remote yet");
  });

  it("shows git's own progress to a person, and says when it failed", async () => {
    expect(await downloadRecords(alice, env, true)).toBe(true);
    await git(alice, "remote", "set-url", "origin", join(dir, "nowhere.git"));
    expect(await downloadRecords(alice, env, true)).toBe(false);
    expect((await recordSyncStatus(alice, env)).downloaded).toBe(true);
  });

  it("warns instead of failing the command when the record cannot be updated", async () => {
    await rm(join(alice, ".cogit", "state"), { recursive: true, force: true });
    await writeFile(join(alice, ".cogit", "state"), "in the way");
    const warnings: string[] = [];
    await prepareRecords(alice, env, (line) => warnings.push(line));
    expect(warnings.join()).toMatch(/could not update the session records/);
  });

  describe("at session start", () => {
    const start = async (root: string): Promise<string[][]> => {
      const spawned: string[][] = [];
      await runHook(
        "sessionstart",
        JSON.stringify({ session_id: "live", cwd: root, source: "startup" }),
        env,
        T0,
        () => {},
        { spawnDetached: (_cli, args) => spawned.push(args) },
      );
      return spawned;
    };

    it("sets a new clone up and downloads in the background", async () => {
      await record(alice, "s1", "First", "alice@example.com");
      await push(alice);
      const bob = await cloneAs("bob");
      const started = await start(bob);
      expect(started.some((args) => args.join(" ").startsWith("record-sync download"))).toBe(true);
      expect(await git(bob, "config", "--get-all", "remote.origin.fetch")).toContain(
        RECORD_REFSPEC,
      );
      expect(existsSync(join(bob, ".git", "hooks", "pre-push"))).toBe(true);
    });

    it("reads what a pull brought, and retries only what a push queued", async () => {
      await record(alice, "s1", "First", "alice@example.com");
      await push(alice);
      const bob = await cloneAs("bob");
      await prepareRecords(bob, env, () => {});
      await record(alice, "s2", "Second", "alice@example.com");
      await push(alice);
      await git(bob, "pull", "-q");
      const quiet = await start(bob);
      expect(await title(bob, "s2")).toBe("Second");
      expect(quiet.some((args) => args[0] === "record-sync")).toBe(false);

      // A session nobody pushed stays home: starting a chat sends nothing new.
      await record(bob, "b1", "Unpushed", "bob@example.com");
      expect((await start(bob)).some((args) => args[0] === "record-sync")).toBe(false);

      await queueRecords(bob, env);
      const retried = await start(bob);
      expect(retried.some((args) => args.join(" ").startsWith("record-sync send"))).toBe(true);
    });

    it("leaves a private project alone", async () => {
      await rm(join(alice, ".cogit", ".gitignore"), { force: true });
      await writeFile(join(alice, ".gitignore"), "/.cogit/\n");
      expect((await start(alice)).some((args) => args[0] === "record-sync")).toBe(false);
    });
  });

  describe("cogit prune", () => {
    const old = "2020-01-01T00:00:00.000Z";
    const write = async (id: string, email: string, updatedAt: string): Promise<void> => {
      const paths = projectPaths(alice);
      await mkdir(paths.sessions, { recursive: true });
      await writeFile(paths.session(id), JSON.stringify(session(id, id, email, updatedAt)));
    };
    const template = TEMPLATE;

    it("reads an age or refuses it", () => {
      expect(pruneCutoff("1y", T0).slice(0, 4)).toBe("2025");
      expect(pruneCutoff("30d", T0).slice(0, 10)).toBe("2026-09-21");
      expect(pruneCutoff("2w", T0).slice(0, 10)).toBe("2026-10-07");
      expect(pruneCutoff("6m", T0).slice(0, 7)).toBe("2026-04");
      expect(() => pruneCutoff("soon", T0)).toThrow(/invalid age/);
    });

    it("deletes only your own old sessions, after asking", async () => {
      await write("mine", "alice@example.com", old);
      await write("theirs", "bob@example.com", old);
      await write("fresh", "alice@example.com", "2100-01-01T00:00:00.000Z");
      await push(alice);

      const declined = fakeIo(env);
      await pruneRecords({ dir: alice, olderThan: "1y", io: declined, templateHtml: template });
      expect(declined.asked[0]).toMatch(/Delete 1 session from this machine and the repository/);
      expect(declined.lines).toContain("Nothing deleted.");
      expect(existsSync(projectPaths(alice).session("mine"))).toBe(true);

      const io = fakeIo(env, ["true"]);
      io.prompt.confirm = async (): Promise<boolean> => true;
      await pruneRecords({ dir: alice, olderThan: "1y", io, templateHtml: template });
      expect(existsSync(projectPaths(alice).session("mine"))).toBe(false);
      expect(existsSync(projectPaths(alice).session("theirs"))).toBe(true);
      expect(existsSync(projectPaths(alice).session("fresh"))).toBe(true);
      expect(await git(alice, "ls-remote", remote, "refs/cogit/sessions/mine")).toBe("");
    });

    it("lists without deleting on a dry run, and includes teammates with --all", async () => {
      await write("mine", "alice@example.com", old);
      await write("theirs", "bob@example.com", old);
      const io = fakeIo(env, [], true);
      await pruneRecords({ dir: alice, olderThan: "1y", all: true, dryRun: true, io });
      expect(io.lines.at(-1)).toBe("Would delete 2 sessions.");
      expect(existsSync(projectPaths(alice).session("theirs"))).toBe(true);

      await pruneRecords({
        dir: alice,
        olderThan: "1y",
        all: true,
        yes: true,
        io,
        templateHtml: template,
      });
      expect(existsSync(projectPaths(alice).session("theirs"))).toBe(false);
    });

    it("reports nothing to do, an uninitialized directory and a failed remote", async () => {
      const io = fakeIo(env, [], true);
      await pruneRecords({ dir: alice, olderThan: "1y", io });
      expect(io.lines).toContain("No sessions older than 1y.");
      await expect(
        pruneRecords({ dir: join(dir, "nowhere"), olderThan: "1y", io }),
      ).rejects.toThrow(/not initialized/);

      await write("mine", "alice@example.com", old);
      await push(alice);
      await git(alice, "remote", "set-url", "origin", join(dir, "nowhere.git"));
      await expect(pruneRecords({ dir: alice, olderThan: "1y", yes: true, io })).rejects.toThrow(
        /nothing was deleted/,
      );
      expect(existsSync(projectPaths(alice).session("mine"))).toBe(true);
    });

    it("works without a repository remote in a private project", async () => {
      await rm(join(alice, ".cogit", ".gitignore"), { force: true });
      await writeFile(join(alice, ".gitignore"), "/.cogit/\n");
      await write("mine", "alice@example.com", old);
      const io = fakeIo(env, [], true);
      await pruneRecords({ dir: alice, olderThan: "1y", yes: true, io, templateHtml: template });
      expect(existsSync(projectPaths(alice).session("mine"))).toBe(false);
    });
  });
});
