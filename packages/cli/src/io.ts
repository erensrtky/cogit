import { confirm, input, select } from "@inquirer/prompts";

export class CliError extends Error {}

export interface Choice<T extends string> {
  value: T;
  name: string;
}

/** Interactive questions; tests and `--yes` swap in non-interactive versions. */
export interface Prompter {
  select<T extends string>(message: string, choices: Choice<T>[], fallback: T): Promise<T>;
  input(message: string, fallback: string): Promise<string>;
  confirm(message: string, fallback: boolean): Promise<boolean>;
}

export interface Io {
  prompt: Prompter;
  out: (line: string) => void;
  warn: (line: string) => void;
  env: NodeJS.ProcessEnv;
  now: () => string;
}

export const inquirerPrompter: Prompter = {
  select: (message, choices, fallback) => select({ message, choices, default: fallback }),
  input: (message, fallback) => input({ message, default: fallback }),
  confirm: (message, fallback) => confirm({ message, default: fallback }),
};

/** Answers every question with its default. */
export const defaultsPrompter: Prompter = {
  select: async (_m, _c, fallback) => fallback,
  input: async (_m, fallback) => fallback,
  confirm: async (_m, fallback) => fallback,
};

export function processIo(interactive: boolean): Io {
  return {
    prompt: interactive ? inquirerPrompter : defaultsPrompter,
    out: (line) => process.stdout.write(`${line}\n`),
    warn: (line) => process.stderr.write(`warning: ${line}\n`),
    env: process.env,
    now: () => new Date().toISOString(),
  };
}

/**
 * Ends the process quietly when the reader of stdout goes away (`cogit log | head`),
 * the way git does, instead of printing Node's EPIPE stack.
 */
export function exitOnClosedPipe(
  stream: NodeJS.EventEmitter = process.stdout,
  exit: (code: number) => void = process.exit,
): void {
  stream.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") exit(0);
    else throw err;
  });
}
