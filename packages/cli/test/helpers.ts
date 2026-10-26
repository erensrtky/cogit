import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Io, Prompter } from "../src/io.js";

export const T0 = "2026-10-21T10:00:00.000Z";

export async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "cogit-"));
}

export interface FakeIo extends Io {
  lines: string[];
  warnings: string[];
  asked: string[];
}

/**
 * Answers questions in order from `answers`; an exhausted queue falls back to the
 * question's default. Pass `strict` to fail on any question at all.
 */
export function fakeIo(env: NodeJS.ProcessEnv, answers: string[] = [], strict = false): FakeIo {
  const asked: string[] = [];
  const next = <T>(message: string, fallback: T): T => {
    if (strict) throw new Error(`unexpected question: ${message}`);
    asked.push(message);
    const a = answers.shift();
    return (a === undefined ? fallback : a) as T;
  };
  const prompt: Prompter = {
    select: async (m, _c, f) => next(m, f),
    input: async (m, f) => next(m, f),
    confirm: async (m, f) => {
      const a = next<string | boolean>(m, f);
      return a === true || a === "yes";
    },
  };
  const io: FakeIo = {
    prompt,
    lines: [],
    warnings: [],
    asked,
    env,
    now: () => T0,
    out: (l) => io.lines.push(l),
    warn: (l) => io.warnings.push(l),
  };
  return io;
}

export function envFor(dir: string): NodeJS.ProcessEnv {
  return { COGIT_HOME: join(dir, "home"), CLAUDE_CONFIG_DIR: join(dir, "claude") };
}
