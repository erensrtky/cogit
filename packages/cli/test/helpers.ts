import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { init } from "../src/commands/init.js";
import type { Io, Prompter } from "../src/io.js";

export const T0 = "2026-10-21T10:00:00.000Z";

/**
 * Writes a stand-in `claude` that runs this node script. Windows cannot start a
 * #! script, so there it is a `claude.cmd` shim, the way npm installs claude,
 * which also takes cogit's own fallback to the shim (issue #2).
 */
export async function writeFakeClaude(bin: string, script: string): Promise<void> {
  await mkdir(bin, { recursive: true });
  if (process.platform === "win32") {
    await writeFile(join(bin, "claude.cjs"), script);
    await writeFile(join(bin, "claude.cmd"), `@"${process.execPath}" "%~dp0claude.cjs" %*\r\n`);
    return;
  }
  await writeFile(join(bin, "claude"), `#!/usr/bin/env node\n${script}`);
  await chmod(join(bin, "claude"), 0o755);
}

/** PATH with `bin` in front, joined the way this system joins it. */
export function pathWith(bin: string): string {
  return `${bin}${delimiter}${process.env.PATH ?? ""}`;
}

export async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "cogit-"));
}

/** A directory outside every git repository (the temp dir itself is one; see global-setup). */
export async function noGitDir(): Promise<string> {
  return mkdtemp(join(process.env.COGIT_TEST_NO_GIT ?? tmpdir(), "cogit-"));
}

/**
 * An initialized project whose repository is gone: `init` needs git, so it runs
 * in a repository that is removed afterwards. Covers the no-git answers of the
 * commands that read git.
 */
export async function noGitProject(env: NodeJS.ProcessEnv, name = "plain"): Promise<string> {
  const dir = join(await noGitDir(), name);
  await mkdir(join(dir, ".git"), { recursive: true });
  const options = { name, git: "share", retention: "keep", language: "auto" } as const;
  await init(dir, { ...options, allowSkill: false, projectSettings: false }, fakeIo(env));
  await rm(join(dir, ".git"), { recursive: true, force: true });
  return dir;
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
