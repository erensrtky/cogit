import { Command, InvalidArgumentError, Option } from "commander";
import pkg from "../package.json" with { type: "json" };
import { buildProject } from "./commands/build.js";
import { configGet, configPrune, configSet } from "./commands/config.js";
import { epochAdd } from "./commands/epoch.js";
import { type InitOptions, init } from "./commands/init.js";
import { openPanel, openProject } from "./commands/open.js";
import { readStdin, sessionShow, sessionWrite } from "./commands/session.js";
import { runHook } from "./hooks/run.js";
import { CliError, type Io, processIo } from "./io.js";

export type IoFactory = (interactive: boolean) => Io;

/** Test seams for effects that would leave this process (opening a browser). */
export interface ProgramDeps {
  launch?: (file: string) => Promise<boolean>;
  /** Reads a hook's JSON input; tests pass it directly. */
  stdin?: () => Promise<string>;
}

function retention(value: string): number | "keep" {
  if (value === "keep") return value;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1) throw new InvalidArgumentError("days (>= 1) or keep");
  return days;
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
        await init(dir, rest, makeIo(!yes && process.stdin.isTTY === true));
      }),
    );

  program
    .command("build")
    .description("regenerate .codelineage/lineage.html")
    .argument("[dir]", "project directory", ".")
    .action(
      run(async (dir: string) => {
        await buildProject({ dir, io: makeIo(false) });
      }),
    );

  program
    .command("open")
    .description("build and open a project map, or the global panel without a directory")
    .argument("[dir]", "project directory; omit to open the global panel")
    .action(
      run(async (dir?: string) => {
        const io = makeIo(false);
        const launch = deps.launch === undefined ? {} : { launch: deps.launch };
        if (dir === undefined) {
          await openPanel({ io, ...launch });
          return;
        }
        await openProject({ dir, io, ...launch });
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
    .command("prune")
    .description("remove registered projects whose directory no longer exists")
    .option("--dry-run", "list what would be removed without changing the registry")
    .action(
      run(async (opts: { dryRun?: boolean }) =>
        configPrune({ dryRun: opts.dryRun === true }, makeIo(false)),
      ),
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
    .argument("<event>", "hook event, e.g. stop")
    .action(async (event: string) => {
      const io = makeIo(false);
      const input = await (deps.stdin ?? readStdin)();
      const out = await runHook(event, input, io.env, io.now(), io.warn);
      if (out !== undefined) io.out(out);
    });

  return program;
}
