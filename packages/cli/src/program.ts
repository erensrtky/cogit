import { Command, InvalidArgumentError, Option } from "commander";
import pkg from "../package.json" with { type: "json" };
import { backfillTail } from "./commands/backfill.js";
import { blame } from "./commands/blame.js";
import { buildProject } from "./commands/build.js";
import {
  configGet,
  configHintOff,
  configHintOn,
  configPrune,
  configSet,
} from "./commands/config.js";
import { epochAdd } from "./commands/epoch.js";
import { type InitOptions, init } from "./commands/init.js";
import { formatShow, log, show } from "./commands/log.js";
import { migrateIds } from "./commands/migrate.js";
import { openPanel, openProject } from "./commands/open.js";
import { search } from "./commands/search.js";
import { readStdin, sessionShow, sessionWrite } from "./commands/session.js";
import { runHook } from "./hooks/run.js";
import { CliError, type Io, processIo } from "./io.js";
import { startMapServer } from "./server.js";
import { loadConfig } from "./store/stores.js";

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

export function createProgram(makeIo: IoFactory = processIo, deps: ProgramDeps = {}): Command {
  const program = new Command()
    .name("codelineage")
    .description(pkg.description)
    .version(pkg.version);

  /** Errors meant for the user print as one line and set exit code 1. */
  const run =
    <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
    async (...args: A) => {
      try {
        await fn(...args);
      } catch (err) {
        if (!(err instanceof CliError)) throw err;
        program.error(`error: ${err.message}`, { exitCode: 1 });
      }
    };

  program
    .command("init")
    .description("set up .codelineage/ in a project and register it")
    .argument("[dir]", "project directory", ".")
    .option("--name <name>", "project name")
    .addOption(
      new Option("--git <policy>", "commit or ignore .codelineage/").choices(["ignore", "commit"]),
    )
    .option("--language <lang>", 'summary language: "auto" or a language')
    .option("--retention <days>", 'Claude Code transcript retention, or "keep"', retention)
    .option("--allow-skill", "let the agent run the lineage skill without asking")
    .option("--no-allow-skill", "leave Claude Code's permissions unchanged")
    .option("-y, --yes", "accept defaults for every question")
    .action(
      run(async (dir: string, opts: InitOptions & { yes?: boolean }) => {
        const { yes, ...rest } = opts;
        // --yes never changes Claude Code's permissions on its own
        if (yes) rest.allowSkill ??= false;
        await init(dir, rest, makeIo(!yes && process.stdin.isTTY === true));
      }),
    );

  program
    .command("build")
    .description("regenerate .codelineage/lineage.html")
    .argument("[dir]", "project directory", ".")
    .option("--quiet", "write the map without printing a success line")
    .action(
      run(async (dir: string, opts: { quiet?: boolean }) => {
        await buildProject({ dir, io: makeIo(false), quiet: opts.quiet === true });
      }),
    );

  program
    .command("blame")
    .description("show which recorded messages produced the code in a file or line")
    .argument("<target>", "file, or file:line")
    .option("-C, --dir <dir>", "project directory", ".")
    .action(
      run(async (target: string, opts: { dir: string }) => {
        await blame({ dir: opts.dir, target, io: makeIo(false) });
      }),
    );

  program
    .command("log")
    .description("print the recorded lineage, newest first")
    .argument("[dir]", "project directory", ".")
    .option("-C, --dir <dir>", "project directory (same as the positional)")
    .option("--session <id>", "only this session (id or prefix)")
    .option("-n, --number <count>", "at most this many messages", positiveCount)
    .option("--branches", "only the branch summaries (the compressed view)")
    .option("--json", "print JSON instead of text")
    .action(
      run(
        async (
          dir: string,
          opts: {
            dir?: string;
            session?: string;
            number?: number;
            branches?: boolean;
            json?: boolean;
          },
        ) => {
          await log({
            dir: opts.dir ?? dir,
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
    .description("print one recorded message by hash or <session-id>:mN")
    .argument("<ref>", "message hash or <session-id-prefix>:mN")
    .argument("[dir]", "project directory", ".")
    .option("-C, --dir <dir>", "project directory (same as the positional)")
    .option("--no-chat", "leave out the conversation turn")
    .option("--json", "print JSON instead of text")
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
    .argument("<text>", "text to look for")
    .argument("[dir]", "project directory", ".")
    .option("-C, --dir <dir>", "project directory (same as the positional)")
    .option("--session <id>", "only this session (id or prefix)")
    .option("-n, --number <count>", "at most this many hits", positiveCount)
    .option("--json", "print JSON instead of text")
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
    .command("open")
    .description("build and open a project map, or the global panel without a directory")
    .argument("[dir]", "project directory; omit to open the global panel")
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

  const config = program.command("config").description("read or change global settings");
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
    .argument("<session-id>", "session id")
    .option("-C, --dir <dir>", "project directory", ".")
    .option("--tail", "only this session's messages that have no node yet")
    .action(
      run(async (sessionId: string, opts: { dir: string; tail?: boolean }) => {
        if (opts.tail !== true)
          throw new CliError(
            "backfill of past sessions is not available yet; run `codelineage backfill <session-id> --tail`",
          );
        await backfillTail(opts.dir, sessionId, makeIo(false));
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

  const epoch = program.command("epoch").description("manage epochs (features, epics)");
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
    .description("session records (used by the agent skill)");
  session
    .command("write")
    .description("merge session JSON from stdin into .codelineage/sessions/")
    .option("-C, --dir <dir>", "project directory", ".")
    .option("-f, --file <file>", "read JSON from a file instead of stdin")
    .option("--consume", "delete the file once the record is saved")
    .action(
      run(async (opts: { dir: string; file?: string; consume?: boolean }) =>
        sessionWrite(opts, makeIo(false)),
      ),
    );
  session
    .command("show")
    .description("print the compact record the agent skill updates, as JSON")
    .argument("<id>", "session id")
    .option("-C, --dir <dir>", "project directory", ".")
    .action(
      run(async (id: string, opts: { dir: string }) => sessionShow(opts.dir, id, makeIo(false))),
    );

  // Called by the plugin's hooks.json with the hook input on stdin. Never fails.
  program
    .command("hook", { hidden: true })
    .argument("<event>", "hook event, e.g. stop or sessionstart")
    .action(async (event: string) => {
      const io = makeIo(false);
      const input = await (deps.stdin ?? readStdin)();
      const out = await runHook(event, input, io.env, io.now(), io.warn);
      if (out !== undefined) io.out(out);
    });

  return program;
}
