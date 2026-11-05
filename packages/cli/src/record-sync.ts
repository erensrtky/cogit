import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { rm, stat } from "node:fs/promises";
import { relative, sep } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { cogitIgnored, findGitRoot, gitUserEmail } from "./git.js";
import { atomicWrite, atomicWriteJson, readJson } from "./store/fs.js";
import { withLock } from "./store/lock.js";
import { projectPaths } from "./store/paths.js";
import { listSessionIds, loadConfig } from "./store/stores.js";

/**
 * The shared record: each session lives on its own ref in the project's own
 * repository, outside every branch, so a clone, a pull request and `git grep` see
 * only the code. The working files in `.cogit/` stay what cogit reads; these refs
 * are how they travel, and how an ignored file survives `git clean`.
 *
 * - `refs/cogit/…` is what this clone wrote; a remote holds the same names.
 * - `refs/cogit-remote/…` is what the remote last said, so a fetch never moves a
 *   ref this clone has not sent yet.
 *
 * One ref per session keeps two people's pushes from ever rejecting each other, and
 * each ref names a tree rather than a commit, so `git log --all` shows only code.
 */
const LOCAL = "refs/cogit";
const TRACKING = "refs/cogit-remote";
export const RECORD_REFSPEC = `+${LOCAL}/*:${TRACKING}/*`;

/** GitHub took 5,000 refs in one push; smaller parts lose less when a network drops. */
const PUSH_BATCH = 2000;
const IMPORT_BATCH = 500;

/** Session ids become file names, so a ref from a remote must look like one. */
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const SESSION_FILE = "session.json";
const EVENTS_FILE = "events.jsonl";
const CONVERSATION_FILE = "conversation.jsonl.gz";

const SyncState = z.object({
  /** When the records were first downloaded into this clone. */
  downloadedAt: z.string().optional(),
  downloadError: z.string().optional(),
  sendError: z.string().optional(),
  /** Refs the user's last push asked to send, with the tree each should reach. */
  pending: z.record(z.string(), z.string()).default({}),
  /** Each session's files as last seen, so an unchanged session costs one stat. */
  stamps: z.record(z.string(), z.string()).default({}),
  /** The remote tree each session's files were last written from. */
  imported: z.record(z.string(), z.string()).default({}),
  /** The HEAD last searched for commits that stopped tracking the record. */
  historyCheckedAt: z.string().optional(),
  /** Those commits, once their sessions were brought back. */
  restoredFrom: z.array(z.string()).default([]),
});
type SyncState = z.infer<typeof SyncState>;

interface GitResult {
  code: number;
  stdout: Buffer;
  stderr: string;
}

function runGit(
  root: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  input?: string,
): Promise<GitResult> {
  return new Promise((done) => {
    const child = spawn("git", ["-C", root, ...args], {
      env,
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", (error) => done({ code: 1, stdout: Buffer.alloc(0), stderr: error.message }));
    child.on("close", (code) =>
      done({
        code: code ?? 1,
        stdout: Buffer.concat(out),
        stderr: Buffer.concat(err).toString("utf8"),
      }),
    );
    if (input !== undefined) {
      child.stdin?.on("error", () => undefined);
      child.stdin?.end(input);
    }
  });
}

/** Git with the prompts off: nothing here runs where a person could answer one. */
function quietEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...env, GIT_TERMINAL_PROMPT: "0", SSH_ASKPASS_REQUIRE: "never" };
}

function gitError(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  // Git ends with advice or a usage list; the reason is the line it marks as fatal
  // or as an error.
  const reason =
    lines.find((line) => line.startsWith("fatal:")) ??
    lines.find((line) => line.startsWith("error:")) ??
    lines.at(-1) ??
    "git failed";
  return reason.slice(0, 300);
}

/** `git version 2.39.3 (Apple Git-146)`, `2.45.1.windows.1`: the first two numbers. */
export function parseGitVersion(text: string): [number, number] | undefined {
  const match = /(\d+)\.(\d+)/.exec(text);
  return match === null ? undefined : [Number(match[1]), Number(match[2])];
}

/** True when git is at least this version, or when its version cannot be read. */
async function gitVersionAtLeast(
  root: string,
  env: NodeJS.ProcessEnv,
  major: number,
  minor: number,
): Promise<boolean> {
  const version = parseGitVersion((await runGit(root, ["version"], env)).stdout.toString("utf8"));
  if (version === undefined) return true;
  return version[0] > major || (version[0] === major && version[1] >= minor);
}

/** True when this project's record is shared: in a repository, and not kept private. */
export async function isSharing(root: string): Promise<boolean> {
  if (!existsSync(projectPaths(root).project)) return false;
  if ((await findGitRoot(root)) === undefined) return false;
  return !(await cogitIgnored(root));
}

/** `origin`, or the only remote there is. With several and no origin, none is assumed. */
export async function syncRemote(
  root: string,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const result = await runGit(root, ["remote"], env);
  if (result.code !== 0) return undefined;
  const remotes = result.stdout.toString("utf8").split("\n").filter(Boolean);
  if (remotes.includes("origin")) return "origin";
  return remotes.length === 1 ? remotes[0] : undefined;
}

/**
 * A project inside a repository subdirectory gets its own part of the namespace,
 * so two projects in one monorepo never read each other's sessions.
 */
async function sessionScope(root: string): Promise<string> {
  const gitRoot = await findGitRoot(root);
  const prefix = gitRoot === undefined ? "" : relative(gitRoot, root).split(sep).join("/");
  if (prefix === "") return "sessions";
  return `projects/${createHash("sha256").update(prefix).digest("hex").slice(0, 16)}/sessions`;
}

async function listRefs(
  root: string,
  base: string,
  scope: string,
  env: NodeJS.ProcessEnv,
): Promise<Map<string, string>> {
  const result = await runGit(
    root,
    ["for-each-ref", "--format=%(objectname) %(refname)", `${base}/${scope}/`],
    env,
  );
  const refs = new Map<string, string>();
  if (result.code !== 0) return refs;
  const start = `${base}/${scope}/`.length;
  for (const line of result.stdout.toString("utf8").split("\n")) {
    const space = line.indexOf(" ");
    if (space < 0) continue;
    const id = line.slice(space + 1 + start);
    if (SESSION_ID.test(id)) refs.set(id, line.slice(0, space));
  }
  return refs;
}

async function readState(root: string): Promise<SyncState> {
  const read = await readJson(projectPaths(root).recordSync).catch(() => ({
    found: false as const,
  }));
  if (read.found && "value" in read) {
    const parsed = SyncState.safeParse(read.value);
    if (parsed.success) return parsed.data;
  }
  return SyncState.parse({});
}

/** The state is derived: losing it costs a re-hash, never a record. */
async function updateState(
  root: string,
  fn: (state: SyncState) => SyncState | Promise<SyncState>,
): Promise<SyncState> {
  const paths = projectPaths(root);
  return withLock(paths.lock("record-sync"), async () => {
    const current = await readState(root);
    const next = await fn(current);
    // Most looks change nothing; every turn's build should not rewrite the file.
    if (next !== current) await atomicWriteJson(paths.recordSync, next);
    return next;
  });
}

async function sessionFiles(
  root: string,
  id: string,
  conversations: boolean,
): Promise<[name: string, path: string][]> {
  const paths = projectPaths(root);
  const all: [string, string][] = [
    [SESSION_FILE, paths.session(id)],
    [EVENTS_FILE, paths.events(id)],
    ...(conversations ? ([[CONVERSATION_FILE, paths.conversation(id)]] as [string, string][]) : []),
  ];
  return all.filter(([, path]) => existsSync(path));
}

async function stampOf(files: [string, string][], conversations: boolean): Promise<string> {
  const parts = [conversations ? "c" : "-"];
  for (const [name, path] of files) {
    const info = await stat(path);
    parts.push(`${name}:${info.mtimeMs}:${info.size}`);
  }
  return parts.join("|");
}

/** A session stamped with someone else's email is theirs to send, never this clone's. */
async function isOwnSession(root: string, id: string, me: string | undefined): Promise<boolean> {
  const read = await readJson(projectPaths(root).session(id));
  if (!read.found || !("value" in read)) return false;
  const author = (read.value as { authorEmail?: unknown }).authorEmail;
  return typeof author !== "string" || me === undefined || author === me;
}

/**
 * Writes the sessions that changed since the last look onto their local refs,
 * without touching the index or the working tree. Nothing leaves the machine.
 * Returns how many refs moved.
 */
export async function snapshotRecords(root: string, env: NodeJS.ProcessEnv): Promise<number> {
  if (!(await isSharing(root))) return 0;
  const conversations = (await loadConfig(env)).shareConversations;
  const me = await gitUserEmail(root, env);
  const scope = await sessionScope(root);
  let moved = 0;
  await updateState(root, async (state) => {
    const stamps = { ...state.stamps };
    let touched = false;
    const changed: { id: string; files: [string, string][] }[] = [];
    for (const id of await listSessionIds(projectPaths(root).sessions)) {
      if (!SESSION_ID.test(id)) continue;
      const files = await sessionFiles(root, id, conversations);
      const stamp = await stampOf(files, conversations);
      if (stamps[id] === stamp) continue;
      stamps[id] = stamp;
      touched = true;
      if (await isOwnSession(root, id, me)) changed.push({ id, files });
    }
    if (!touched) return state;
    if (changed.length === 0) return { ...state, stamps };

    const paths = changed.flatMap(({ files }) => files.map(([, path]) => path));
    const hashed = await runGit(
      root,
      ["hash-object", "-w", "--stdin-paths"],
      env,
      `${paths.join("\n")}\n`,
    );
    if (hashed.code !== 0) throw new Error(gitError(hashed.stderr));
    const blobs = hashed.stdout.toString("utf8").trim().split("\n");
    let next = 0;
    const listing = changed
      .map(({ files }) =>
        files.map(([name]) => `100644 blob ${blobs[next++] as string}\t${name}\n`).join(""),
      )
      .join("\n");
    const made = await runGit(root, ["mktree", "--batch"], env, `${listing}\n`);
    if (made.code !== 0) throw new Error(gitError(made.stderr));
    const trees = made.stdout.toString("utf8").trim().split("\n");

    const local = await listRefs(root, LOCAL, scope, env);
    const tracking = await listRefs(root, TRACKING, scope, env);
    const commands: string[] = [];
    changed.forEach(({ id }, index) => {
      const tree = trees[index] as string;
      if (local.get(id) === tree) return;
      // Already what the remote holds and never changed here: not this clone's to send.
      if (!local.has(id) && tracking.get(id) === tree) return;
      commands.push(`update ${LOCAL}/${scope}/${id} ${tree}\n`);
    });
    if (commands.length > 0) {
      const updated = await runGit(root, ["update-ref", "--stdin"], env, commands.join(""));
      if (updated.code !== 0) throw new Error(gitError(updated.stderr));
      moved = commands.length;
    }
    return { ...state, stamps };
  });
  return moved;
}

/** Reads many blobs in one process; `<tree>:<name>` that does not exist comes back absent. */
async function readBlobs(
  root: string,
  specs: string[],
  env: NodeJS.ProcessEnv,
): Promise<Map<string, Buffer>> {
  const result = await runGit(root, ["cat-file", "--batch"], env, `${specs.join("\n")}\n`);
  const blobs = new Map<string, Buffer>();
  if (result.code !== 0) throw new Error(gitError(result.stderr));
  const out = result.stdout;
  let at = 0;
  for (const spec of specs) {
    const end = out.indexOf(0x0a, at);
    if (end < 0) break;
    const header = out.subarray(at, end).toString("utf8");
    at = end + 1;
    const match = /^[0-9a-f]+ blob (\d+)$/.exec(header);
    if (match === null) continue;
    const size = Number(match[1]);
    blobs.set(spec, out.subarray(at, at + size));
    at += size + 1;
  }
  return blobs;
}

/**
 * Brings the working files up to date with the refs: what a pull brought in, and
 * whatever `git clean` removed. A session with changes this clone has not sent
 * keeps them. Returns how many sessions were written.
 */
export async function importRecords(root: string, env: NodeJS.ProcessEnv): Promise<number> {
  if (!(await isSharing(root))) return 0;
  const scope = await sessionScope(root);
  const local = await listRefs(root, LOCAL, scope, env);
  const tracking = await listRefs(root, TRACKING, scope, env);
  if (local.size === 0 && tracking.size === 0) return 0;
  const paths = projectPaths(root);
  const conversations = (await loadConfig(env)).shareConversations;
  let written = 0;
  await updateState(root, async (state) => {
    const imported = { ...state.imported };
    const stamps = { ...state.stamps };
    const wanted = new Map<string, string>();
    for (const [id, tree] of tracking) {
      const mine = local.get(id);
      const missing = !existsSync(paths.session(id));
      if (missing) wanted.set(id, mine ?? tree);
      else if (mine !== undefined) {
        // The local ref is the newer word; once sent, the two simply agree.
        if (mine === tree) imported[id] = tree;
      } else if (imported[id] !== tree) wanted.set(id, tree);
    }
    for (const [id, tree] of local) {
      if (!tracking.has(id) && !existsSync(paths.session(id))) wanted.set(id, tree);
    }

    const ids = [...wanted.keys()];
    const agreed = Object.keys(imported).length !== Object.keys(state.imported).length;
    if (ids.length === 0 && !agreed) return state;
    for (let start = 0; start < ids.length; start += IMPORT_BATCH) {
      const part = ids.slice(start, start + IMPORT_BATCH);
      const specs = part.flatMap((id) => {
        const tree = wanted.get(id) as string;
        return [SESSION_FILE, EVENTS_FILE, CONVERSATION_FILE].map((name) => `${tree}:${name}`);
      });
      const blobs = await readBlobs(root, specs, env);
      for (const id of part) {
        const tree = wanted.get(id) as string;
        const session = blobs.get(`${tree}:${SESSION_FILE}`);
        if (session === undefined) continue;
        await atomicWrite(paths.session(id), session);
        const events = blobs.get(`${tree}:${EVENTS_FILE}`);
        if (events !== undefined) await atomicWrite(paths.events(id), events);
        const conversation = blobs.get(`${tree}:${CONVERSATION_FILE}`);
        if (conversation !== undefined) await atomicWrite(paths.conversation(id), conversation);
        if (tracking.get(id) === tree) imported[id] = tree;
        stamps[id] = await stampOf(await sessionFiles(root, id, conversations), conversations);
        written++;
      }
    }
    return { ...state, imported, stamps };
  });
  return written;
}

/**
 * Older versions committed the record, so the commit that stopped tracking it makes
 * every `git pull` delete those files from a teammate's disk, and a new clone never
 * gets them. They are still in history: this brings back what such a commit
 * removed. They count as seen, so old sessions are not sent again. A later prune
 * stays a prune here, since a commit is only read once. Returns how many came back.
 */
export async function restoreCommittedRecords(
  root: string,
  env: NodeJS.ProcessEnv,
): Promise<number> {
  if (!(await isSharing(root))) return 0;
  const head = (await runGit(root, ["rev-parse", "HEAD"], env)).stdout.toString("utf8").trim();
  if (head === "" || (await readState(root)).historyCheckedAt === head) return 0;
  const log = await runGit(
    root,
    [
      "log",
      "--diff-filter=D",
      "--format=commit %H",
      "--name-only",
      "--relative",
      "--",
      ".cogit/sessions",
    ],
    env,
  );
  let restored = 0;
  const conversations = (await loadConfig(env)).shareConversations;
  await updateState(root, async (state) => {
    const done = new Set(state.restoredFrom);
    const newest = new Map<string, string>();
    let commit = "";
    for (const line of log.stdout.toString("utf8").split("\n")) {
      if (line.startsWith("commit ")) commit = line.slice("commit ".length);
      else if (line !== "" && !done.has(commit) && !newest.has(line)) newest.set(line, commit);
    }
    const paths = projectPaths(root);
    const wanted = [...newest].flatMap(([file, from]) => {
      const name = /^\.cogit\/sessions\/([^/]+?)(\.events\.jsonl|\.json)$/.exec(file);
      if (name === null || !SESSION_ID.test(name[1] as string)) return [];
      const id = name[1] as string;
      const target = name[2] === ".json" ? paths.session(id) : paths.events(id);
      return existsSync(target) ? [] : [{ id, target, spec: `${from}^:./${file}` }];
    });
    const blobs =
      wanted.length === 0
        ? new Map<string, Buffer>()
        : await readBlobs(
            root,
            wanted.map((item) => item.spec),
            env,
          );
    const stamps = { ...state.stamps };
    const ids = new Set<string>();
    for (const { id, target, spec } of wanted) {
      const blob = blobs.get(spec);
      if (blob === undefined) continue;
      await atomicWrite(target, blob);
      ids.add(id);
    }
    for (const id of ids) {
      stamps[id] = await stampOf(await sessionFiles(root, id, conversations), conversations);
    }
    restored = ids.size;
    return {
      ...state,
      stamps,
      historyCheckedAt: head,
      restoredFrom: [...done, ...new Set(newest.values())],
    };
  });
  return restored;
}

/** Local writes first, so a session this clone just changed is never overwritten. */
export async function reconcileRecords(root: string, env: NodeJS.ProcessEnv): Promise<void> {
  await snapshotRecords(root, env);
  await importRecords(root, env);
}

/**
 * The refspec that makes a plain `git fetch` and `git pull` bring the records,
 * in this clone's config only. Git never applies a repository's settings on clone,
 * so cogit's first run here has to add it. Returns true when it was added.
 */
export async function addRecordRefspec(root: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  const remote = await syncRemote(root, env);
  if (remote === undefined) return false;
  const key = `remote.${remote}.fetch`;
  const current = await runGit(root, ["config", "--get-all", key], env);
  if (current.stdout.toString("utf8").split("\n").includes(RECORD_REFSPEC)) return false;
  return (await runGit(root, ["config", "--add", key, RECORD_REFSPEC], env)).code === 0;
}

/**
 * Downloads the records. Only the record refs move: the user's remote-tracking
 * branches stay where their last fetch left them. With `showProgress` git's own
 * progress goes to the terminal, and a person can answer an SSH passphrase.
 */
export async function downloadRecords(
  root: string,
  env: NodeJS.ProcessEnv,
  showProgress = false,
): Promise<boolean> {
  const remote = await syncRemote(root, env);
  if (remote === undefined) return false;
  // Keeps FETCH_HEAD for the user's own fetches; git before 2.29 does not know the flag.
  const fetchHead = (await gitVersionAtLeast(root, env, 2, 29)) ? ["--no-write-fetch-head"] : [];
  const args = ["fetch", "--no-tags", ...fetchHead, remote, RECORD_REFSPEC];
  const result = showProgress
    ? await fetchWithProgress(root, [...args.slice(0, 1), "--progress", ...args.slice(1)], env)
    : await runGit(root, [...args.slice(0, 1), "--quiet", ...args.slice(1)], quietEnv(env));
  await updateState(root, (state) => {
    if (result.code === 0) {
      const { downloadError: _cleared, ...rest } = state;
      return { ...rest, downloadedAt: new Date().toISOString() };
    }
    return { ...state, downloadError: gitError(result.stderr) };
  });
  return result.code === 0;
}

/** One `* [new ref] a -> b` line per session, and the `From <url>` above them. */
const REF_LINE = /^(From | .* -> )/;

/**
 * A fetch a person watches: git's progress meter goes to the terminal as it
 * comes (its `\r` redraws included), but the one line per session ref is
 * dropped, so a first download of 300 sessions does not print 300 lines. The
 * text is also kept, so a failure can say why. Prompts (an SSH passphrase) use
 * the terminal directly and are not affected.
 */
function fetchWithProgress(
  root: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<GitResult> {
  return new Promise((done) => {
    const child = spawn("git", ["-C", root, ...args], {
      env,
      stdio: ["inherit", "inherit", "pipe"],
    });
    const err: string[] = [];
    let rest = "";
    const show = (part: string): void => {
      err.push(part);
      if (!REF_LINE.test(part)) process.stderr.write(part);
    };
    child.stderr?.on("data", (chunk: Buffer) => {
      const parts = (rest + chunk.toString("utf8")).split(/(?<=[\r\n])/);
      rest = /[\r\n]$/.test(parts.at(-1) ?? "") ? "" : (parts.pop() ?? "");
      for (const part of parts) show(part);
    });
    child.on("error", (error) => done({ code: 1, stdout: Buffer.alloc(0), stderr: error.message }));
    child.on("close", (code) => {
      if (rest !== "") show(rest);
      done({ code: code ?? 1, stdout: Buffer.alloc(0), stderr: err.join("") });
    });
  });
}

/**
 * What the `pre-push` hook announces: how many sessions this push would take along,
 * without any network. Pushes to other remotes take none, so a deploy remote or a
 * fork never receives the record.
 */
export async function countUnsentRecords(
  root: string,
  env: NodeJS.ProcessEnv,
  pushedRemote: string | undefined,
): Promise<number> {
  if (!(await isSharing(root))) return 0;
  if (pushedRemote !== (await syncRemote(root, env))) return 0;
  await snapshotRecords(root, env);
  const scope = await sessionScope(root);
  const local = await listRefs(root, LOCAL, scope, env);
  const tracking = await listRefs(root, TRACKING, scope, env);
  return [...local].filter(([id, tree]) => tracking.get(id) !== tree).length;
}

/**
 * Whether the remote now holds what the hook saw going out. `pre-push` runs before
 * the push, and also for `--dry-run` and for a push the remote goes on to reject;
 * git has no hook for "it worked", so this asks the remote.
 */
export async function pushLanded(
  root: string,
  env: NodeJS.ProcessEnv,
  ref: string,
  sha: string,
  wait: { intervalMs: number; timeoutMs: number } = { intervalMs: 3000, timeoutMs: 600_000 },
): Promise<boolean> {
  const remote = await syncRemote(root, env);
  if (remote === undefined) return false;
  const deadline = Date.now() + wait.timeoutMs;
  for (;;) {
    const seen = await runGit(root, ["ls-remote", remote, ref], quietEnv(env));
    if (
      seen.stdout
        .toString("utf8")
        .split("\n")
        .some((line) => line.startsWith(`${sha}\t`))
    )
      return true;
    if (Date.now() >= deadline) return false;
    await sleep(wait.intervalMs);
  }
}

/**
 * The background half of `git push`: once the code has landed (`after` names the
 * ref and hash the hook saw; a push with nothing to send has none), queues what the
 * remote does not have and sends it. A dry run or a rejected push queues nothing.
 */
export async function sendAfterPush(
  root: string,
  env: NodeJS.ProcessEnv,
  after?: string,
  wait?: { intervalMs: number; timeoutMs: number },
): Promise<number> {
  if (after !== undefined) {
    const split = after.lastIndexOf("=");
    if (!(await pushLanded(root, env, after.slice(0, split), after.slice(split + 1), wait)))
      return 0;
  }
  await queueRecords(root, env);
  return sendRecords(root, env);
}

/** Writes what changed and queues every session the remote does not have. Returns its size. */
export async function queueRecords(root: string, env: NodeJS.ProcessEnv): Promise<number> {
  if (!(await isSharing(root))) return 0;
  if ((await syncRemote(root, env)) === undefined) return 0;
  await snapshotRecords(root, env);
  const scope = await sessionScope(root);
  const local = await listRefs(root, LOCAL, scope, env);
  const tracking = await listRefs(root, TRACKING, scope, env);
  const state = await updateState(root, (cur) => {
    const pending = { ...cur.pending };
    for (const [id, tree] of local) {
      const ref = `${LOCAL}/${scope}/${id}`;
      if (tracking.get(id) === tree) delete pending[ref];
      else pending[ref] = tree;
    }
    return { ...cur, pending };
  });
  return Object.keys(state.pending).length;
}

/**
 * Sends the queue, in the background of the user's push: no prompt can appear
 * and nothing here reaches their exit code. What fails stays queued; the next
 * session start tries it again. `--no-verify` keeps this push from firing the
 * hook that started it. Returns how many were sent.
 */
export async function sendRecords(root: string, env: NodeJS.ProcessEnv): Promise<number> {
  const remote = await syncRemote(root, env);
  if (remote === undefined) return 0;
  const queue = Object.entries((await readState(root)).pending);
  let sent = 0;
  for (let start = 0; start < queue.length; start += PUSH_BATCH) {
    const part = queue.slice(start, start + PUSH_BATCH);
    const specs = part.map(([ref, tree]) => `+${tree}:${ref}`);
    const pushed = await runGit(
      root,
      ["push", "--no-verify", "--quiet", remote, ...specs],
      quietEnv(env),
    );
    if (pushed.code !== 0) {
      const error = gitError(pushed.stderr);
      await updateState(root, (state) => ({ ...state, sendError: error }));
      return sent;
    }
    const commands = part
      .map(([ref, tree]) => `update ${TRACKING}${ref.slice(LOCAL.length)} ${tree}\n`)
      .join("");
    await runGit(root, ["update-ref", "--stdin"], env, commands);
    await updateState(root, (state) => {
      const pending = { ...state.pending };
      for (const [ref, tree] of part) if (pending[ref] === tree) delete pending[ref];
      const { sendError: _cleared, ...rest } = state;
      return { ...rest, pending };
    });
    sent += part.length;
  }
  return sent;
}

/** Session files an older version committed; they stay tracked until the user removes them. */
export async function trackedRecordFiles(root: string, env: NodeJS.ProcessEnv): Promise<number> {
  const result = await runGit(root, ["ls-files", "--", ".cogit/sessions"], env);
  return result.stdout.toString("utf8").split("\n").filter(Boolean).length;
}

/**
 * True when the committed `.cogit/.gitignore` is older than the one here (an
 * upgrade rewrote it): until it is committed, teammates and new clones see
 * `.cogit/sessions/` as untracked, and one `git add -A` commits the record again.
 */
export async function cogitGitignoreChanged(
  root: string,
  env: NodeJS.ProcessEnv,
): Promise<boolean> {
  const result = await runGit(root, ["status", "--porcelain", "--", ".cogit/.gitignore"], env);
  const line = result.stdout.toString("utf8").split("\n")[0] ?? "";
  return line !== "" && !line.startsWith("??");
}

export interface RecordSyncStatus {
  sharing: boolean;
  remote?: string;
  downloaded: boolean;
  downloadError?: string;
  pending: number;
  sendError?: string;
}

export async function recordSyncStatus(
  root: string,
  env: NodeJS.ProcessEnv,
): Promise<RecordSyncStatus> {
  const sharing = await isSharing(root);
  if (!sharing) return { sharing, downloaded: false, pending: 0 };
  const remote = await syncRemote(root, env);
  const state = await readState(root);
  return {
    sharing,
    ...(remote === undefined ? {} : { remote }),
    downloaded: state.downloadedAt !== undefined,
    ...(state.downloadError === undefined ? {} : { downloadError: state.downloadError }),
    pending: Object.keys(state.pending).length,
    ...(state.sendError === undefined ? {} : { sendError: state.sendError }),
  };
}

/**
 * Deletes sessions from the remote first and only then from this machine: a
 * failed push leaves everything in place instead of a local copy the next import
 * would bring back. Throws the reason. The caller has already asked the user.
 */
export async function deleteRecords(
  root: string,
  ids: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const paths = projectPaths(root);
  if (await isSharing(root)) {
    const scope = await sessionScope(root);
    const tracking = await listRefs(root, TRACKING, scope, env);
    const remote = await syncRemote(root, env);
    const published = ids.filter((id) => tracking.has(id));
    if (remote !== undefined) {
      for (let start = 0; start < published.length; start += PUSH_BATCH) {
        const part = published.slice(start, start + PUSH_BATCH);
        const specs = part.map((id) => `:${LOCAL}/${scope}/${id}`);
        const pushed = await runGit(
          root,
          ["push", "--no-verify", "--quiet", remote, ...specs],
          quietEnv(env),
        );
        if (pushed.code !== 0) throw new Error(gitError(pushed.stderr));
      }
    }
    const commands = ids
      .flatMap((id) => [`delete ${LOCAL}/${scope}/${id}\n`, `delete ${TRACKING}/${scope}/${id}\n`])
      .join("");
    await runGit(root, ["update-ref", "--stdin"], env, commands);
    await updateState(root, (state) => {
      const pending = { ...state.pending };
      const imported = { ...state.imported };
      const stamps = { ...state.stamps };
      for (const id of ids) {
        delete pending[`${LOCAL}/${scope}/${id}`];
        delete imported[id];
        delete stamps[id];
      }
      return { ...state, pending, imported, stamps };
    });
  }
  for (const id of ids) {
    await rm(paths.session(id), { force: true });
    await rm(paths.events(id), { force: true });
    await rm(paths.conversation(id), { force: true });
    await rm(paths.state(id), { force: true });
  }
}
