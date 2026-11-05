import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Command, InvalidArgumentError, Option } from "commander";
import pkg from "../package.json" with { type: "json" };
import { backfillTail } from "./commands/backfill.js";
import { blame } from "./commands/blame.js";
import { buildProject } from "./commands/build.js";
import { captures, distill, setCapture } from "./commands/captures.js";
import {
  configGet,
  configGit,
  configGitShow,
  configHintOff,
  configHintOn,
  configPrune,
  configSet,
} from "./commands/config.js";
import { doctor } from "./commands/doctor.js";
import { hooksInstall, hooksUninstall } from "./commands/hooks.js";
import { type InitOptions, init } from "./commands/init.js";
import { formatShow, log, logFile, show } from "./commands/log.js";
import { migrateIds } from "./commands/migrate.js";
import { openPanel, openProject } from "./commands/open.js";
import { pr } from "./commands/pr.js";
import { pruneRecords } from "./commands/prune.js";
import { search } from "./commands/search.js";
import { readStdin, sessionShow, sessionWrite } from "./commands/session.js";
import { shapeMessage } from "./commands/shape.js";
import { why } from "./commands/why.js";
import { isGitHookEvent, runGitHook } from "./git-hooks.js";
import { runHook } from "./hooks/run.js";
import { CliError, type Io, processIo } from "./io.js";
import { prepareRecords } from "./record-prepare.js";
import { downloadRecords, reconcileRecords, sendAfterPush, sendRecords } from "./record-sync.js";
import { startMapServer } from "./server.js";
import { takeMigrationWarnings } from "./store/migrate.js";
import { projectPaths } from "./store/paths.js";
import { resolveProjectRoot } from "./store/root.js";
import { loadConfig } from "./store/stores.js";
import { configHelpLines } from "./view/settings.js";

export type IoFactory = (interactive: boolean) => Io;

/** Test seams for effects that would leave this process (opening a browser). */
export interface ProgramDeps {
  launch?: (target: string) => Promise<boolean>;
  /** Replaces the local map server; resolves its base URL, or null. */
  server?: (env: NodeJS.ProcessEnv) => Promise<string | null>;
  /** Reads a hook's JSON input; tests pass it directly. */
  stdin?: () => Promise<string>;
  /** Sets the process exit code; tests observe it. */
  exitCode?: (code: number) => void;
}

function retention(value: string): number | "keep" {
  if (value === "keep") return value;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1) throw new InvalidArgumentError("days (>= 1) or keep");
  return days;
}

/** `-n` for `log`: a positive whole number, or Commander's error message. */
export function positiveCount(value: string): number {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1)
    throw new InvalidArgumentError("a positive whole number");
  return count;
}

/** The `Examples:` block every user-facing command carries in `--help` (Story 10.2). */
function examples(...commands: string[]): string {
  return `\nExamples:\n${commands.map((command) => `  $ ${command}`).join("\n")}\n`;
}

/**
 * Before a command reads the record: in a clone of a shared project this is what
 * brings the team's sessions in. Walks up like `why` does, since a command may run
 * from a subfolder; outside a project it does nothing and the command reports that.
 */
async function readyToRead(dir: string, io: Io): Promise<void> {
  for (let cur = resolve(dir); ; cur = dirname(cur)) {
    const { root } = await resolveProjectRoot(cur);
    if (existsSync(projectPaths(root).project)) {
      await prepareRecords(root, io.env, io.warn);
      return;
    }
    if (dirname(cur) === cur) return;
  }
}

export function createProgram(makeIo: IoFactory = processIo, deps: ProgramDeps = {}): Command {
  const program = new Command().name("cogit").description(pkg.description).version(pkg.version);

  /** Errors meant for the user print as one line and set exit code 1. */
  const run =
    <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
    async (...args: A) => {
      try {
        await fn(...args);
      } catch (err) {
        if (!(err instanceof CliError)) throw err;
        program.error(`error: ${err.message}`, { exitCode: 1 });
      } finally {
        // The 9.1 migration is silent; only a two-directory conflict speaks.
        for (const line of takeMigrationWarnings()) makeIo(false).warn(line);
      }
    };

  program
    .command("blame")
    .description("show which recorded messages produced the code in a file or line")
    .helpGroup("Read:")
    .argument("<target>", "file, or file:line")
    .argument("[dir]", "project directory", ".")
    .option("-C, --dir <dir>", "project directory (same as the positional)")
    .addHelpText("after", examples("cogit blame src/auth.ts:42", "cogit blame src/auth.ts"))
    .action(
      run(async (target: string, dir: string, opts: { dir?: string }) => {
        const io = makeIo(false);
        await readyToRead(opts.dir ?? dir, io);
        await blame({ dir: opts.dir ?? dir, target, io });
      }),
    );

  program
    .command("why")
    .description("show the decisions and rejected options behind a file or a line")
    .helpGroup("Read:")
    .argument("<file>", "file (or file:line) to look up, relative to where you are (or to [dir])")
    .argument("[dir]", "project directory; by default the nearest one above you")
    .option("-C, --dir <dir>", "project directory (same as the positional)")
    .option("--line <n>", "the line to look up (same as file:line)", positiveCount)
    .addHelpText(
      "after",
      examples(
        "cogit why src/auth.ts",
        "cogit why src/auth.ts:42",
        "cogit why src/auth.ts ../my-app",
      ),
    )
    .action(
      run(async (file: string, dir: string | undefined, opts: { dir?: string; line?: number }) => {
        const project = opts.dir ?? dir;
        const io = makeIo(false);
        await readyToRead(project ?? process.cwd(), io);
        await why({
          ...(project === undefined ? { cwd: process.cwd() } : { dir: project }),
          file,
          ...(opts.line === undefined ? {} : { line: opts.line }),
          io,
        });
      }),
    );

  program
    .command("log")
    .description("print the recorded sessions, newest first")
    .helpGroup("Read:")
    .argument("[dir]", "project directory", ".")
    .option("-C, --dir <dir>", "project directory (same as the positional)")
    .option("--session <id>", "only this session (id or prefix)")
    .option("-n, --number <count>", "at most this many messages", positiveCount)
    .option("--branches", "only the branch summaries (the compressed view)")
    .option("--file <path>", "only messages that touched this file (its history)")
    .option("--json", "print JSON instead of text")
    .addHelpText("after", examples("cogit log -n 10", "cogit log --file src/auth.ts"))
    .action(
      run(
        async (
          dir: string,
          opts: {
            dir?: string;
            session?: string;
            number?: number;
            branches?: boolean;
            file?: string;
            json?: boolean;
          },
        ) => {
          const target = opts.dir ?? dir;
          const io = makeIo(false);
          await readyToRead(target, io);
          if (opts.file !== undefined) {
            await logFile({
              dir: target,
              file: opts.file,
              io,
              json: opts.json === true,
            });
            return;
          }
          await log({
            dir: target,
            io,
            session: opts.session,
            limit: opts.number,
            branchesOnly: opts.branches === true,
            json: opts.json === true,
          });
        },
      ),
    );

  program
    .command("show")
    .description("print one recorded message by hash, <session-id>:mN or commit hash")
    .helpGroup("Read:")
    .argument("<ref>", "message hash, <session-id-prefix>:mN, or a commit hash")
    .argument("[dir]", "project directory", ".")
    .option("-C, --dir <dir>", "project directory (same as the positional)")
    .option("--no-chat", "leave out the conversation turn")
    .option("--json", "print JSON instead of text")
    .addHelpText("after", examples("cogit show h3f9c2a1b4d6e", "cogit show a1b2c3d"))
    .action(
      run(
        async (
          ref: string,
          dir: string,
          opts: { dir?: string; chat?: boolean; json?: boolean },
        ) => {
          const io = makeIo(false);
          await readyToRead(opts.dir ?? dir, io);
          const model = await show({ dir: opts.dir ?? dir, ref, io, chat: opts.chat !== false });
          if (opts.json === true) io.out(JSON.stringify(model, null, 2));
          else for (const line of formatShow(model)) io.out(line);
        },
      ),
    );

  const capturesCommand = program
    .command("captures")
    .description("the curated list of work the sessions left open (not a plan)")
    .helpGroup("Read:")
    .argument("[dir]", "project directory", ".")
    .option("-C, --dir <dir>", "project directory (same as the positional)")
    .option("--json", "print the store as JSON")
    .addHelpText(
      "after",
      examples(
        "cogit captures",
        "cogit captures accept c1a2b3c4",
        "cogit captures distill --dry-run",
        "cogit captures distill --all",
      ),
    )
    .action(
      run(async (dir: string, opts: { dir?: string; json?: boolean }) => {
        await captures({ dir: opts.dir ?? dir, io: makeIo(false), json: opts.json === true });
      }),
    );

  for (const verb of ["accept", "dismiss", "done"] as const) {
    capturesCommand
      .command(verb)
      .description(
        verb === "accept"
          ? "accept a suggested item and keep it open"
          : verb === "dismiss"
            ? "dismiss a suggested item; it leaves the list"
            : "close an open item",
      )
      .argument("<id>", "the item's id (c…, as `cogit captures` prints it)")
      .option("-C, --dir <dir>", "project directory")
      .action(
        run(async (id: string, opts: { dir?: string }, command: Command) => {
          // Commander hands a `--dir` that the parent also defines to the
          // parent's opts, so both are read.
          await setCapture(
            opts.dir ?? command.parent?.opts<{ dir?: string }>().dir ?? ".",
            verb,
            id,
            makeIo(false),
          );
        }),
      );
  }

  capturesCommand
    .command("distill")
    .description("draft items from a session's leftover work, by hand")
    .option("-C, --dir <dir>", "project directory")
    .option("--session <id>", "only this session (id or prefix)")
    .option("--all", "every session with something left open")
    .option("--dry-run", "print the proposals and write nothing")
    .action(
      run(
        async (
          opts: { dir?: string; session?: string; all?: boolean; dryRun?: boolean },
          command: Command,
        ) => {
          await distill({
            dir: opts.dir ?? command.parent?.opts<{ dir?: string }>().dir ?? ".",
            io: makeIo(false),
            session: opts.session,
            all: opts.all === true,
            dryRun: opts.dryRun === true,
          });
        },
      ),
    );

  program
    .command("search")
    .description("find recorded messages, branch summaries and conversation text")
    .helpGroup("Read:")
    .argument("<text>", "text to look for")
    .argument("[dir]", "project directory", ".")
    .option("-C, --dir <dir>", "project directory (same as the positional)")
    .option("--session <id>", "only this session (id or prefix)")
    .option("-n, --number <count>", "at most this many hits", positiveCount)
    .option("--json", "print JSON instead of text")
    .addHelpText(
      "after",
      examples('cogit search "refresh token"', "cogit search auth --session 9c32ab18"),
    )
    .action(
      run(
        async (
          text: string,
          dir: string,
          opts: { dir?: string; session?: string; number?: number; json?: boolean },
        ) => {
          const io = makeIo(false);
          await readyToRead(opts.dir ?? dir, io);
          await search({
            dir: opts.dir ?? dir,
            io,
            text,
            session: opts.session,
            limit: opts.number,
            json: opts.json === true,
          });
        },
      ),
    );

  program
    .command("pr")
    .description("print a review-ready description of a branch from the thoughts behind it")
    .helpGroup("Read:")
    .argument("[base]", "base ref; default: the upstream's merge base, else main, else master")
    .option("-C, --dir <dir>", "project directory", ".")
    .option("--json", "print JSON instead of Markdown")
    .option("--copy", "also copy the Markdown to the clipboard")
    .addHelpText(
      "after",
      "\nExamples:\n" +
        "  $ cogit pr\n" +
        "  $ cogit pr main --copy\n" +
        "  $ cogit pr origin/main --json\n\n" +
        "Prints only the record's titles, summaries and decisions — never the conversation\n" +
        "text or your raw prompts, because the PR may be public.\n",
    )
    .action(
      run(
        async (base: string | undefined, opts: { dir: string; json?: boolean; copy?: boolean }) => {
          const io = makeIo(false);
          await readyToRead(opts.dir, io);
          await pr({
            dir: opts.dir,
            base,
            io,
            json: opts.json === true,
            copy: opts.copy === true,
          });
        },
      ),
    );

  program
    .command("open")
    .description("build and open a project map, or the global panel without a directory")
    .helpGroup("Map:")
    .argument("[dir]", "project directory; omit to open the global panel")
    .addHelpText("after", examples("cogit open", "cogit open ../my-app"))
    .action(
      run(async (dir?: string) => {
        const io = makeIo(false);
        const launch = deps.launch === undefined ? {} : { launch: deps.launch };
        const server = deps.server === undefined ? {} : { server: deps.server };
        if (dir === undefined) {
          await openPanel({ io, ...launch, ...server });
          return;
        }
        await openProject({ dir, io, ...launch, ...server });
      }),
    );

  program
    .command("init")
    .description("set up .cogit/ in a project and register it")
    .helpGroup("Set up:")
    .argument("[dir]", "project directory", ".")
    .option("--name <name>", "project name")
    .addOption(
      new Option(
        "--git <policy>",
        "share the session records with `git push`, or keep them here",
      ).choices(["ignore", "share"]),
    )
    .option("--language <lang>", 'summary language: "auto" or a language')
    .option("--retention <days>", 'Claude Code transcript retention, or "keep"', retention)
    .option("--allow-skill", "let the agent run the cogit skill without asking")
    .option("--no-allow-skill", "leave Claude Code's permissions unchanged")
    .option(
      "--project-settings",
      "enable the plugin for this project and stop sessions that start without it",
    )
    .option("--no-project-settings", "leave the project's .claude/settings.json unchanged")
    .option("-y, --yes", "accept defaults for every question")
    .addHelpText("after", examples("cogit init", "cogit init ../my-app --git share --yes"))
    .action(
      run(async (dir: string, opts: InitOptions & { yes?: boolean }) => {
        const { yes, ...rest } = opts;
        // --yes never changes Claude Code's permissions on its own
        if (yes) rest.allowSkill ??= false;
        // nor the project's shared settings
        if (yes) rest.projectSettings ??= false;
        await init(dir, rest, makeIo(!yes && process.stdin.isTTY === true));
      }),
    );

  program
    .command("doctor")
    .description("check why the map may be empty; one line per check, with the fix")
    .helpGroup("Set up:")
    .argument("[dir]", "project directory", ".")
    .option("-C, --dir <dir>", "project directory (same as the positional)")
    .option("--json", "print the checks as JSON")
    .addHelpText("after", examples("cogit doctor", "cogit doctor ../my-app --json"))
    .action(async (dir: string, opts: { dir?: string; json?: boolean }) => {
      const report = await doctor({
        dir: opts.dir ?? dir,
        io: makeIo(false),
        json: opts.json === true,
      });
      if (!report.ok) {
        const setCode =
          deps.exitCode ??
          ((code: number) => {
            process.exitCode = code;
          });
        setCode(1);
      }
    });

  program
    .command("build")
    .description("regenerate .cogit/map.html")
    .helpGroup("Map:")
    .argument("[dir]", "project directory", ".")
    .option("--quiet", "write the map without printing a success line")
    .addHelpText("after", examples("cogit build", "cogit build ../my-app --quiet"))
    .action(
      run(async (dir: string, opts: { quiet?: boolean }) => {
        const io = makeIo(false);
        // A person in a fresh clone gets the team's sessions, not an empty map; the
        // quiet build after every turn stays local.
        if (opts.quiet !== true) await readyToRead(dir, io);
        await buildProject({ dir, io, quiet: opts.quiet === true });
      }),
    );

  const config = program
    .command("config")
    .description("read or change global settings")
    .helpGroup("Set up:")
    .addHelpText(
      "after",
      `${examples(
        "cogit config get language",
        "cogit config set recorder mixed",
        "cogit config set sideEveryTurns 3",
      )}\n\nSettings (the same explanations the panel's ? shows):\n${configHelpLines().join("\n")}`,
    );
  config
    .command("get")
    .argument("[key]")
    .action(run(async (key?: string) => configGet(key, makeIo(false))));
  config
    .command("set")
    .argument("<key>")
    .argument("<value>")
    .action(run(async (key: string, value: string) => configSet(key, value, makeIo(false))));
  config
    .command("git")
    .description("show, or switch to share or ignore, this project's session records")
    .argument("[policy]", "share or ignore; without it, shows the current policy")
    .argument("[dir]", "project directory", ".")
    .action(
      run(async (policy: string | undefined, dir: string) => {
        if (policy === undefined) return configGitShow(dir, makeIo(false));
        if (policy !== "share" && policy !== "ignore")
          throw new CliError(`invalid git policy "${policy}"; use share or ignore`);
        await configGit(dir, policy, makeIo(false));
      }),
    );
  config
    .command("hint-off")
    .description("stop the SessionStart setup hint in a project")
    .argument("[dir]", "project directory", ".")
    .action(run(async (dir: string) => configHintOff(dir, makeIo(false))));
  config
    .command("hint-on")
    .description("show the SessionStart setup hint again in a project, or everywhere")
    .argument("[dir]", "project directory", ".")
    .option("--all", "turn the hint back on for every project")
    .action(
      run(async (dir: string, opts: { all?: boolean }) =>
        configHintOn(dir, { all: opts.all === true }, makeIo(false)),
      ),
    );
  config
    .command("prune")
    .description("remove registered projects whose directory no longer exists")
    .option("--dry-run", "list what would be removed without changing the registry")
    .action(
      run(async (opts: { dryRun?: boolean }) =>
        configPrune({ dryRun: opts.dryRun === true }, makeIo(false)),
      ),
    );

  program
    .command("prune")
    .description("delete old sessions for good, here and in the repository")
    .helpGroup("Map:")
    .requiredOption("--older-than <age>", "how old a session must be: 30d, 2w, 6m, 1y")
    .option("--all", "teammates' sessions too, not only your own")
    .option("--dry-run", "list what would be deleted without deleting")
    .option("-y, --yes", "do not ask for confirmation")
    .option("-C, --dir <dir>", "project directory", ".")
    .addHelpText(
      "after",
      examples("cogit prune --older-than 1y --dry-run", "cogit prune --older-than 6m"),
    )
    .action(
      run(
        async (opts: {
          olderThan: string;
          all?: boolean;
          dryRun?: boolean;
          yes?: boolean;
          dir: string;
        }) => {
          await pruneRecords({
            dir: opts.dir,
            olderThan: opts.olderThan,
            all: opts.all === true,
            dryRun: opts.dryRun === true,
            yes: opts.yes === true,
            io: makeIo(process.stdin.isTTY === true),
          });
        },
      ),
    );

  program
    .command("shape")
    .description("write the Shape of the newest message that landed commits (side model)")
    .helpGroup("Agent:")
    .argument("[session-id]", "session id; defaults to the session in .cogit/HEAD")
    .option("--commit <sha>", "shape the message this commit's Thought trailer names")
    .option("--dry-run", "with --commit: print the Shape instead of saving it")
    .option("-C, --dir <dir>", "project directory", ".")
    .addHelpText(
      "after",
      examples("cogit shape", "cogit shape 9c32ab18", "cogit shape --commit HEAD"),
    )
    .action(
      run(
        async (
          sessionId: string | undefined,
          opts: { dir: string; commit?: string; dryRun?: boolean },
        ) =>
          shapeMessage(opts.dir, sessionId, makeIo(false), {
            commit: opts.commit,
            dryRun: opts.dryRun,
          }),
      ),
    );

  program
    .command("backfill")
    .description("record the user messages a session has not summarized yet")
    .helpGroup("Agent:")
    .argument("<session-id>", "session id")
    .option("-C, --dir <dir>", "project directory", ".")
    .option("--tail", "only this session's messages that have no node yet")
    .option(
      "--close",
      "then run the session-end pass: threads, parents, branch summaries and where it left off",
    )
    .addHelpText(
      "after",
      examples("cogit backfill 9c32ab18 --tail", "cogit backfill 9c32ab18 --tail --close"),
    )
    .action(
      run(async (sessionId: string, opts: { dir: string; tail?: boolean; close?: boolean }) => {
        if (opts.tail !== true)
          throw new CliError(
            "backfill of past sessions is not available yet; run `cogit backfill <session-id> --tail`",
          );
        await backfillTail(opts.dir, sessionId, makeIo(false), { close: opts.close === true });
      }),
    );

  const session = program
    .command("session")
    .description("session records (used by the agent skill)")
    .helpGroup("Agent:")
    .addHelpText(
      "after",
      examples("cogit session show 9c32ab18", "cogit session write --file inbox.json"),
    );
  session
    .command("write")
    .description("merge session JSON from stdin into .cogit/sessions/")
    .option("-C, --dir <dir>", "project directory", ".")
    .option("-f, --file <file>", "read JSON from a file instead of stdin")
    .option("--consume", "delete the file once the record is saved")
    .option("--by <who>", "who writes: agent (default) or side (fills only empty fields)")
    .action(
      run(async (opts: { dir: string; file?: string; consume?: boolean; by?: string }) => {
        if (opts.by !== undefined && opts.by !== "agent" && opts.by !== "side")
          throw new CliError('--by must be "agent" or "side"');
        const { by, ...rest } = opts;
        await sessionWrite({ ...rest, ...(by === undefined ? {} : { by }) }, makeIo(false));
      }),
    );
  session
    .command("show")
    .description("print the compact record the agent skill updates, as JSON")
    .argument("<id>", "session id")
    .option("-C, --dir <dir>", "project directory", ".")
    .option("--full", "print every recorded message and the parent candidates")
    .action(
      run(async (id: string, opts: { dir: string; full?: boolean }) =>
        sessionShow(opts.dir, id, makeIo(false), { full: opts.full === true }),
      ),
    );

  const hooks = program
    .command("hooks")
    .description("manage the git hooks cogit adds to a project")
    .helpGroup("Set up:")
    .addHelpText("after", examples("cogit hooks install", "cogit hooks uninstall"));
  hooks
    .command("install")
    .description("add or refresh the cogit block in this project's git hooks")
    .argument("[dir]", "project directory", ".")
    .action(run(async (dir: string) => hooksInstall(dir, makeIo(false))));
  hooks
    .command("uninstall")
    .description("remove only the cogit block from the git hooks it installed")
    .argument("[dir]", "project directory", ".")
    .action(run(async (dir: string) => hooksUninstall(dir, makeIo(false))));

  // Called by the plugin's hooks.json with the hook input on stdin, and by the
  // git hooks cogit installs (Stories 9.3, 9.4) with git's arguments. Never fails.
  program
    .command("hook")
    .description("run one of the plugin or git hooks cogit installs (never blocks)")
    .helpGroup("Agent:")
    .argument("<event>", "hook event, e.g. stop, sessionstart, pre-commit")
    .argument("[args...]", "arguments git passed to its hook: $1, $2, …")
    .option("-C, --dir <dir>", "project directory (git hooks pass theirs)")
    .allowExcessArguments(true)
    .addHelpText("after", examples("cogit hook stop", "cogit hook pre-push --dir ../my-app"))
    .action(async (event: string, args: string[], opts: { dir?: string }) => {
      const io = makeIo(false);
      // A block a past version left in a hook it has since retired: quiet until refreshed.
      if (event === "pre-commit") return;
      if (isGitHookEvent(event)) {
        try {
          await runGitHook(
            event,
            opts.dir ?? process.cwd(),
            io.env,
            args,
            new Date(io.now()),
            undefined,
            deps.stdin ?? readStdin,
          );
        } catch {
          // A hook must never block the commit or the session.
        }
        return;
      }
      const input = await (deps.stdin ?? readStdin)();
      const out = await runHook(event, input, io.env, io.now(), io.warn);
      if (out !== undefined) io.out(out);
    });

  // Hidden commands are registered last so `help` stays at the end of the
  // top-level list: commander places a group where its first command appears.

  // Started detached by `open`; also useful on its own when the port is known.
  program
    .command("serve", { hidden: true })
    .description("run the local map server that `open` uses")
    .option("--port <port>", "port to bind (default: serverPort from config)")
    .action(
      run(async (opts: { port?: string }) => {
        const io = makeIo(false);
        const port =
          opts.port === undefined ? (await loadConfig(io.env)).serverPort : Number(opts.port);
        if (!Number.isInteger(port) || port < 1 || port > 65535)
          throw new CliError(`invalid port: ${String(opts.port)}`);
        try {
          await startMapServer({ env: io.env, port });
        } catch (err) {
          throw new CliError(`could not start the map server: ${(err as Error).message}`);
        }
      }),
    );

  // One-time data upgrade for records written before stable message ids (8.5).
  program
    .command("migrate", { hidden: true })
    .description("give old records stable message ids and an events file")
    .argument("[dir]", "project directory", ".")
    .action(
      run(async (dir: string) => {
        const io = makeIo(false);
        const result = await migrateIds(dir, io);
        io.out(
          `Migrated ${result.migrated} session(s); ${result.skipped} skipped (already migrated or unmappable).`,
        );
      }),
    );

  // Started detached by the pre-push hook and by SessionStart.
  program
    .command("record-sync", { hidden: true })
    .description("send the queued session records, or download the team's")
    .argument("<action>", "send, send-pushed or download")
    .option("--after <ref=sha>", "with send-pushed: wait until the remote holds this")
    .option("-C, --dir <dir>", "project directory", ".")
    .action(
      run(async (action: string, opts: { dir: string; after?: string }) => {
        const io = makeIo(false);
        const { root } = await resolveProjectRoot(opts.dir);
        if (action === "send") await sendRecords(root, io.env);
        else if (action === "send-pushed") await sendAfterPush(root, io.env, opts.after);
        else if (action === "download") {
          await downloadRecords(root, io.env);
          await reconcileRecords(root, io.env);
        } else throw new CliError(`unknown record-sync action "${action}"`);
      }),
    );

  program.addHelpText("after", "\nDocs: https://github.com/erensrtky/cogit#readme\n");

  return program;
}
