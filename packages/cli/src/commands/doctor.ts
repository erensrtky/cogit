import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import pkg from "../../package.json" with { type: "json" };
import type { AgentAdapter } from "../agents/index.js";
import { defaultAgent } from "../agents/index.js";
import { compareVersions, versionNotice } from "../cli-version.js";
import { cogitIgnored, findGitRoot, gitHooksDir, gitUserEmail, gitUserName } from "../git.js";
import { BLOCK_START, hookBlock } from "../git-hooks.js";
import type { Io } from "../io.js";
import { hashTurns, isRecorded, upgradeSessionIds } from "../messages.js";
import type { Session } from "../schema/session.js";
import { checkHealth } from "../server.js";
import { applyEvents, readEvents } from "../store/events.js";
import { projectPaths } from "../store/paths.js";
import { resolveProjectRoot } from "../store/root.js";
import { loadAllSessions, loadConfig, loadProject, loadSession } from "../store/stores.js";

/**
 * `cogit doctor` (Story 13.1): the one command to hand a user whose map stays
 * empty. Every check is read-only, runs in a fixed order and never stops the
 * others; one line says `ok`, `warn` or `fail`, the reason, and the fix.
 */

export type CheckStatus = "ok" | "warn" | "fail";

export interface DoctorCheck {
  /** Stable key for `--json`. */
  id: string;
  status: CheckStatus;
  /** Short reason, one line. */
  message: string;
  /** The exact command (or setting) that fixes a warn or fail. */
  fix?: string;
}

export interface DoctorReport {
  /** False when any check failed: the CLI exits 1. */
  ok: boolean;
  checks: DoctorCheck[];
}

export interface DoctorOptions {
  dir: string;
  io: Io;
  /** Print the report as JSON instead of lines. */
  json?: boolean;
}

/** The lowest Node this project supports, from `engines`. */
const MIN_NODE = "22.13.0";
/** Below this, old transcripts are gone before a record can be backfilled. */
const RETENTION_FLOOR = 90;

/** A promise computed once, shared by the checks that need the same read. */
function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | undefined;
  return () => (cached ??= fn());
}

interface DoctorContext {
  root: string;
  env: NodeJS.ProcessEnv;
  agent: AgentAdapter;
  gitRoot: () => Promise<string | undefined>;
  project: () => Promise<Awaited<ReturnType<typeof loadProject>>>;
  sessions: () => Promise<Session[]>;
  transcripts: () => Promise<Map<string, string>>;
  config: () => Promise<Awaited<ReturnType<typeof loadConfig>>>;
}

interface CheckSpec {
  id: string;
  run: (ctx: DoctorContext) => Promise<DoctorCheck>;
}

/** Claude Code's folder for a working directory: every non-alphanumeric becomes `-`. */
export function transcriptDirName(dir: string): string {
  return dir.replace(/[^a-zA-Z0-9]/g, "-");
}

/** This project's transcripts, by session id (the main checkout and a linked worktree). */
export async function projectTranscripts(
  root: string,
  worktree: string | undefined,
  agent: AgentAdapter,
  env: NodeJS.ProcessEnv,
): Promise<Map<string, string>> {
  const names = new Set([transcriptDirName(root)]);
  if (worktree !== undefined) names.add(transcriptDirName(worktree));
  const all = await agent.collectTranscripts(env);
  return new Map([...all].filter(([, file]) => names.has(basename(dirname(file)))));
}

/** The transcript with the latest modification time, if there is one. */
async function newestTranscript(
  transcripts: ReadonlyMap<string, string>,
): Promise<{ id: string; file: string } | undefined> {
  let newest: { id: string; file: string; mtime: number } | undefined;
  for (const [id, file] of transcripts) {
    const info = await stat(file).catch(() => undefined);
    if (info === undefined) continue;
    if (newest === undefined || info.mtimeMs > newest.mtime)
      newest = { id, file, mtime: info.mtimeMs };
  }
  return newest === undefined ? undefined : { id: newest.id, file: newest.file };
}

/** The user messages in this transcript that the record has no node for. */
async function unrecordedTail(
  root: string,
  sessionId: string,
  file: string,
  agent: AgentAdapter,
): Promise<number> {
  const turns = hashTurns(sessionId, await agent.readConversation(file));
  const loaded = await loadSession(root, sessionId);
  let recorded = new Set<string>();
  if (loaded.found && loaded.ok) {
    const upgraded = upgradeSessionIds(loaded.data, turns);
    const events = await readEvents(root, sessionId);
    recorded = new Set(applyEvents(upgraded.nodes, events).map((node) => node.id));
  }
  return turns.filter((turn) => !isRecorded(recorded, turn)).length;
}

/** The one line a check prints; the fix rides on the same line. */
export function formatCheck(check: DoctorCheck): string {
  const head = `${check.status.padEnd(5)}${check.message}`;
  return check.fix === undefined ? head : `${head} · fix: ${check.fix}`;
}

/** A detached-log section header and the lines under it. */
interface LogSection {
  header: string;
  body: string[];
}

/**
 * The last error from a close pass in the detached log, if any. The pass runs
 * as `backfill <id> --tail --close`; only its own last section matters, since a
 * build after it says nothing about the recording.
 */
export function closePassError(log: string): { sessionId?: string; line: string } | undefined {
  const sections: LogSection[] = [];
  for (const line of log.split("\n")) {
    if (line.startsWith("--- ")) sections.push({ header: line.slice(4), body: [] });
    else sections.at(-1)?.body.push(line);
  }
  const passes = sections.filter((section) => /\bbackfill\b/.test(section.header));
  const last = passes.at(-1);
  if (last === undefined) return undefined;
  const line = last.body.find((text) => /^\s*error:/i.test(text));
  if (line === undefined) return undefined;
  const id = last.header.split(/\s+/)[2];
  return { ...(id === undefined ? {} : { sessionId: id }), line: line.trim() };
}

/** Reads the bounded tail of the detached log; a missing log is an empty one. */
async function readDetachedLog(root: string): Promise<string> {
  const text = await readFile(projectPaths(root).detachedLog, "utf8").catch(() => "");
  return text.slice(-64 * 1024);
}

/** The Node check, pure so its too-old branch is testable on any machine. */
export function nodeCheck(node: string = process.versions.node): DoctorCheck {
  if (compareVersions(node, MIN_NODE) < 0)
    return {
      id: "node",
      status: "fail",
      message: `Node ${node} is older than ${MIN_NODE}`,
      fix: `install Node ${MIN_NODE} or newer (https://nodejs.org)`,
    };
  return { id: "node", status: "ok", message: `Node ${node}, cogit ${pkg.version}` };
}

const CHECK_SPECS: CheckSpec[] = [
  { id: "node", run: async () => nodeCheck() },

  {
    id: "plugin",
    run: async (ctx) => {
      const installed = await ctx.agent.readPluginInstalled(ctx.env);
      if (installed !== true)
        return {
          id: "plugin",
          status: "fail",
          message: "the Claude Code plugin is not installed, so nothing is recorded",
          fix: ctx.agent.installCommand,
        };
      const enabled = await ctx.agent.readPluginEnabled(ctx.env, ctx.root);
      if (enabled === undefined)
        return {
          id: "plugin",
          status: "warn",
          message: "could not read Claude Code's settings to see whether the plugin is enabled",
          fix: "check ~/.claude/settings.json is a valid JSON object",
        };
      if (!enabled)
        return {
          id: "plugin",
          status: "warn",
          message: "the plugin is installed but not enabled, so sessions here record nothing",
          fix: "cogit init --project-settings",
        };
      const version = await ctx.agent.readPluginVersion(ctx.env);
      if (version === undefined)
        return {
          id: "plugin",
          status: "warn",
          message: "the plugin is installed and enabled, but its version is unknown",
          fix: "claude plugin update cogit@cogit",
        };
      const notice = versionNotice(version, pkg.version);
      if (notice !== undefined) return { id: "plugin", status: "warn", message: notice };
      return {
        id: "plugin",
        status: "ok",
        message: `the plugin is installed, enabled and at the CLI's version (${version})`,
      };
    },
  },

  {
    id: "git",
    run: async (ctx) => {
      const gitRoot = await ctx.gitRoot();
      if (gitRoot === undefined)
        return {
          id: "git",
          status: "fail",
          message: `${ctx.root} is not inside a git repository`,
          fix: "git init",
        };
      const name = await gitUserName(ctx.root, ctx.env);
      const email = await gitUserEmail(ctx.root, ctx.env);
      if (name !== undefined && email !== undefined)
        return {
          id: "git",
          status: "ok",
          message: `git identity: ${name} <${email}>`,
        };
      const missing = [
        name === undefined ? "user.name" : "",
        email === undefined ? "user.email" : "",
      ]
        .filter((key) => key !== "")
        .join(" and ");
      const fix =
        (name === undefined ? 'git config --global user.name "Your Name"' : "") +
        (name === undefined && email === undefined ? " && " : "") +
        (email === undefined ? "git config --global user.email you@example.com" : "");
      return {
        id: "git",
        status: "warn",
        message: `git has no ${missing}; sessions are credited to the OS user and two people with one name read as one`,
        fix,
      };
    },
  },

  {
    id: "project",
    run: async (ctx) => {
      const project = await ctx.project();
      if (!project.found)
        return {
          id: "project",
          status: "fail",
          message: `${projectPaths(ctx.root).project} is missing`,
          fix: "cogit init",
        };
      if (!project.ok)
        return {
          id: "project",
          status: "fail",
          message: `${projectPaths(ctx.root).project}: ${project.error}`,
          fix: "fix or remove the file, then run `cogit init`",
        };
      const hooks = await hookProblems(ctx);
      if (hooks.length > 0)
        return {
          id: "project",
          status: "warn",
          message: `initialized, but ${hooks.join(", ")}`,
          fix: "cogit init",
        };
      return {
        id: "project",
        status: "ok",
        message: `initialized as "${project.data.name}"; the git hooks are current`,
      };
    },
  },

  {
    id: "skill",
    run: async (ctx) => {
      const allowed = await ctx.agent.readSkillAllowed(ctx.env);
      if (allowed === undefined)
        return {
          id: "skill",
          status: "warn",
          message: "could not read Claude Code's permissions",
          fix: `check ~/.claude/settings.json is valid, or add ${ctx.agent.skillRule} to permissions.allow`,
        };
      if (!allowed)
        return {
          id: "skill",
          status: "warn",
          message: `${ctx.agent.skillRule} is not allowed, so the agent asks before each record update`,
          fix: "cogit init --allow-skill",
        };
      return {
        id: "skill",
        status: "ok",
        message: `${ctx.agent.skillRule} is allowed`,
      };
    },
  },

  {
    id: "transcripts",
    run: async (ctx) => {
      const transcripts = await ctx.transcripts();
      const retention = await ctx.agent.readRetention(ctx.env);
      if (transcripts.size === 0)
        return {
          id: "transcripts",
          status: "warn",
          message: "no Claude Code transcripts for this project; start a session here",
          fix: "claude",
        };
      if (retention === undefined)
        return {
          id: "transcripts",
          status: "warn",
          message: `${transcripts.size} transcript(s) found, but Claude Code's retention could not be read`,
          fix: "cogit init --retention 90",
        };
      if (retention < RETENTION_FLOOR)
        return {
          id: "transcripts",
          status: "warn",
          message: `${transcripts.size} transcript(s) found; Claude Code deletes them after ${retention} days`,
          fix: "cogit init --retention 90",
        };
      return {
        id: "transcripts",
        status: "ok",
        message: `${transcripts.size} transcript(s) found; Claude Code keeps them ${retention} days`,
      };
    },
  },

  {
    id: "sessions",
    run: async (ctx) => {
      const sessions = await ctx.sessions();
      const transcripts = await ctx.transcripts();
      const newest = await newestTranscript(transcripts);
      const tail =
        newest === undefined
          ? undefined
          : await unrecordedTail(ctx.root, newest.id, newest.file, ctx.agent);
      const pending = newest !== undefined && tail !== undefined && tail > 0 ? newest : undefined;
      if (sessions.length === 0)
        return {
          id: "sessions",
          status: "warn",
          message:
            pending === undefined
              ? "no session recorded yet"
              : `no session recorded yet; transcript ${pending.id} has ${tail} message(s) with no node`,
          ...(pending === undefined ? {} : { fix: `cogit backfill ${pending.id} --tail` }),
        };
      const latest = sessions.reduce((a, b) => (a.updatedAt >= b.updatedAt ? a : b));
      if (pending !== undefined)
        return {
          id: "sessions",
          status: "warn",
          message: `${sessions.length} session(s) recorded, newest ${latest.updatedAt}; the newest transcript has ${tail} message(s) with no node yet`,
          fix: `cogit backfill ${pending.id} --tail`,
        };
      return {
        id: "sessions",
        status: "ok",
        message: `${sessions.length} session(s) recorded, newest ${latest.updatedAt}; the newest transcript is fully recorded`,
      };
    },
  },

  {
    id: "server",
    run: async (ctx) => {
      const port = (await ctx.config()).serverPort;
      const url = `http://127.0.0.1:${port}`;
      if (await checkHealth(url, ctx.env))
        return {
          id: "server",
          status: "ok",
          message: `the map server answers on ${url}`,
        };
      return {
        id: "server",
        status: "warn",
        message: `no map server on ${url} (the saved map file still opens)`,
        fix: "cogit open .",
      };
    },
  },

  {
    id: "detached",
    run: async (ctx) => {
      const error = closePassError(await readDetachedLog(ctx.root));
      if (error === undefined)
        return {
          id: "detached",
          status: "ok",
          message: "the last close pass left no error",
        };
      return {
        id: "detached",
        status: "warn",
        message: `the last close pass wrote: ${error.line}`,
        fix:
          error.sessionId === undefined
            ? "cogit backfill <session-id> --tail --close"
            : `cogit backfill ${error.sessionId} --tail --close`,
      };
    },
  },
];

/** Hook files that are missing or carry a block an earlier CLI wrote. */
async function hookProblems(ctx: DoctorContext): Promise<string[]> {
  const gitRoot = await ctx.gitRoot();
  if (gitRoot === undefined) return ["the git hooks are not installed"];
  const dir = await gitHooksDir(gitRoot);
  if (dir === undefined) return ["the git hooks directory could not be found"];
  const problems: string[] = [];
  for (const event of ["prepare-commit-msg", "pre-commit", "post-commit"] as const) {
    const text = await readFile(join(dir, event), "utf8").catch(() => undefined);
    if (text === undefined || !text.includes(BLOCK_START)) {
      problems.push(`the ${event} hook is missing`);
      continue;
    }
    const block = /# >>> cogit[\s\S]*?# <<< cogit/.exec(text)?.[0];
    if (block !== hookBlock(event, ctx.root)) problems.push(`the ${event} hook is outdated`);
  }
  return problems;
}

/**
 * Runs every check in order and prints one line each (or the JSON report).
 * Returns the report; the caller sets the exit code from `ok`.
 */
export async function doctor(opts: DoctorOptions): Promise<DoctorReport> {
  const { io } = opts;
  const agent = defaultAgent();
  const resolved = await resolveProjectRoot(opts.dir);
  const root = resolved.root;

  const ctx: DoctorContext = {
    root,
    env: io.env,
    agent,
    gitRoot: once(() => findGitRoot(root)),
    project: once(() => loadProject(root)),
    sessions: once(() => loadAllSessions(root, io.warn)),
    transcripts: once(() => projectTranscripts(root, resolved.worktree?.path, agent, io.env)),
    config: once(() => loadConfig(io.env)),
  };

  const checks: DoctorCheck[] = [];
  for (const spec of CHECK_SPECS) {
    try {
      checks.push(await spec.run(ctx));
    } catch (err) {
      checks.push({
        id: spec.id,
        status: "fail",
        message: `the check could not run: ${(err as Error).message}`,
      });
    }
  }

  const report: DoctorReport = {
    ok: checks.every((check) => check.status !== "fail"),
    checks,
  };
  if (opts.json === true) {
    io.out(JSON.stringify(report, null, 2));
  } else {
    for (const check of checks) io.out(formatCheck(check));
  }
  return report;
}
