import { Command, InvalidArgumentError, Option } from "commander";
import pkg from "../package.json" with { type: "json" };
import { backfillTail } from "./commands/backfill.js";
import { blame } from "./commands/blame.js";
import { buildProject } from "./commands/build.js";
import {
  configGet,
  configGit,
  configGitShow,
  configHintOff,
  configHintOn,
  configPrune,
  configSet,
} from "./commands/config.js";
import { epochAdd } from "./commands/epoch.js";
import { hooksInstall, hooksUninstall } from "./commands/hooks.js";
import { type InitOptions, init } from "./commands/init.js";
import { formatShow, log, logFile, logUnread, show } from "./commands/log.js";
import { migrateIds } from "./commands/migrate.js";
import { openPanel, openProject } from "./commands/open.js";
import { pr } from "./commands/pr.js";
import { search } from "./commands/search.js";
import { readStdin, sessionShow, sessionWrite } from "./commands/session.js";
import { why } from "./commands/why.js";
import { isGitHookEvent, runGitHook } from "./git-hooks.js";
import { runHook } from "./hooks/run.js";
import { CliError, type Io, processIo } from "./io.js";
import { startMapServer } from "./server.js";
import { maybeAutoCommit } from "./session-git.js";
import { takeMigrationWarnings } from "./store/migrate.js";
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
        await blame({ dir: opts.dir ?? dir, target, io: makeIo(false) });
      }),
    );

  program
    .command("why")
    .description("show the decisions and rejected options behind a file")
    .helpGroup("Read:")
    .argument("<file>", "file to look up, relative to where you are (or to [dir])")
    .argument("[dir]", "project directory; by default the nearest one above you")
    .option("-C, --dir <dir>", "project directory (same as the positional)")
    .addHelpText("after", examples("cogit why src/auth.ts", "cogit why src/auth.ts ../my-app"))
    .action(
      run(async (file: string, dir: string | undefined, opts: { dir?: string }) => {
        const project = opts.dir ?? dir;
        await why({
          ...(project === undefined ? { cwd: process.cwd() } : { dir: project }),
          file,
          io: makeIo(false),
        });
      }),
    );

  program
    .command("log")
    .description("print the recorded lineage, newest first")
    .helpGroup("Read:")
    .argument("[dir]", "project directory", ".")
    .option("-C, --dir <dir>", "project directory (same as the positional)")
    .option("--session <id>", "only this session (id or prefix)")
    .option("-n, --number <count>", "at most this many messages", positiveCount)
    .option("--branches", "only the branch summaries (the compressed view)")
    .option("--file <path>", "only messages that touched this file (its history)")
    .option("--unread", "unread messages with commits, most code first")
    .option("--json", "print JSON instead of text")
    .addHelpText(
      "after",
      examples("cogit log -n 10", "cogit log --file src/auth.ts", "cogit log --unread"),
    )
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
            unread?: boolean;
            json?: boolean;
          },
        ) => {
          const target = opts.dir ?? dir;
          if (opts.unread === true) {
            await logUnread({ dir: target, io: makeIo(false), json: opts.json === true });
            return;
          }
          if (opts.file !== undefined) {
            await logFile({
              dir: target,
              file: opts.file,
              io: makeIo(false),
              json: opts.json === true,
            });
            return;
          }
          await log({
            dir: target,
            io: makeIo(false),
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
          const model = await show({ dir: opts.dir ?? dir, ref, io, chat: opts.chat !== false });
          if (opts.json === true) io.out(JSON.stringify(model, null, 2));
          else for (const line of formatShow(model)) io.out(line);
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
          await search({
            dir: opts.dir ?? dir,
            io: makeIo(false),
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
          await pr({
            dir: opts.dir,
            base,
            io: makeIo(false),
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
      new Option("--git <policy>", "commit or ignore .cogit/").choices(["ignore", "commit"]),
    )
    .option("--language <lang>", 'summary language: "auto" or a language')
    .option("--retention <days>", 'Claude Code transcript retention, or "keep"', retention)
    .option("--allow-skill", "let the agent run the lineage skill without asking")
    .option("--no-allow-skill", "leave Claude Code's permissions unchanged")
    .option(
      "--project-settings",
      "enable the plugin for this project and stop sessions that start without it",
    )
    .option("--no-project-settings", "leave the project's .claude/settings.json unchanged")
    .option("-y, --yes", "accept defaults for every question")
    .addHelpText("after", examples("cogit init", "cogit init ../my-app --git commit --yes"))
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
    .command("build")
    .description("regenerate .cogit/map.html")
    .helpGroup("Map:")
    .argument("[dir]", "project directory", ".")
    .option("--quiet", "write the map without printing a success line")
    .addHelpText("after", examples("cogit build", "cogit build ../my-app --quiet"))
    .action(
      run(async (dir: string, opts: { quiet?: boolean }) => {
        await buildProject({ dir, io: makeIo(false), quiet: opts.quiet === true });
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
    .description("show, or switch to commit or ignore, this project's session records (story 9.3)")
    .argument("[policy]", "commit or ignore; without it, shows the current policy")
    .argument("[dir]", "project directory", ".")
    .action(
      run(async (policy: string | undefined, dir: string) => {
        if (policy === undefined) return configGitShow(dir, makeIo(false));
        if (policy !== "commit" && policy !== "ignore")
          throw new CliError(`invalid git policy "${policy}"; use commit or ignore`);
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
    .command("backfill")
    .description("record the user messages a session has not summarized yet")
    .helpGroup("Agent:")
    .argument("<session-id>", "session id")
    .option("-C, --dir <dir>", "project directory", ".")
    .option("--tail", "only this session's messages that have no node yet")
    .addHelpText("after", examples("cogit backfill 9c32ab18 --tail"))
    .action(
      run(async (sessionId: string, opts: { dir: string; tail?: boolean }) => {
        if (opts.tail !== true)
          throw new CliError(
            "backfill of past sessions is not available yet; run `cogit backfill <session-id> --tail`",
          );
        await backfillTail(opts.dir, sessionId, makeIo(false));
      }),
    );

  const epoch = program
    .command("epoch")
    .description("manage epochs (features, epics)")
    .helpGroup("Set up:")
    .addHelpText("after", examples('cogit epoch add e2e "End-to-end"'));
  epoch
    .command("add")
    .argument("<id>", "short id, e.g. e2e")
    .argument("<title>")
    .option("-C, --dir <dir>", "project directory", ".")
    .action(
      run(async (id: string, title: string, opts: { dir: string }) =>
        epochAdd(opts.dir, id, title, makeIo(false)),
      ),
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
    .addHelpText("after", examples("cogit hook stop", "cogit hook pre-commit --dir ../my-app"))
    .action(async (event: string, args: string[], opts: { dir?: string }) => {
      const io = makeIo(false);
      if (isGitHookEvent(event)) {
        try {
          await runGitHook(event, opts.dir ?? process.cwd(), io.env, args, new Date(io.now()));
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

  // Started detached by the SessionEnd hook when `recordCommit` is `auto`.
  program
    .command("record-commit", { hidden: true })
    .description("commit the session record files without touching other staged changes")
    .argument("<session-id>", "session id")
    .option("-C, --dir <dir>", "project directory", ".")
    .action(
      run(async (sessionId: string, opts: { dir: string }) => {
        await maybeAutoCommit(opts.dir, sessionId, makeIo(false).env);
      }),
    );

  program.addHelpText("after", "\nDocs: https://github.com/erensrtky/cogit#readme\n");

  return program;
}
