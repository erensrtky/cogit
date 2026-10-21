import { Command, InvalidArgumentError, Option } from "commander";
import pkg from "../package.json" with { type: "json" };
import { configGet, configSet } from "./commands/config.js";
import { epochAdd } from "./commands/epoch.js";
import { type InitOptions, init } from "./commands/init.js";
import { CliError, type Io, processIo } from "./io.js";

export type IoFactory = (interactive: boolean) => Io;

function retention(value: string): number | "keep" {
  if (value === "keep") return value;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1) throw new InvalidArgumentError("days (>= 1) or keep");
  return days;
}

export function createProgram(makeIo: IoFactory = processIo): Command {
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
    .option("-y, --yes", "accept defaults for every question")
    .action(
      run(async (dir: string, opts: InitOptions & { yes?: boolean }) => {
        const { yes, ...rest } = opts;
        await init(dir, rest, makeIo(!yes && process.stdin.isTTY === true));
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

  return program;
}
