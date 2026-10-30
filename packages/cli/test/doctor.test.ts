import { execFile } from "node:child_process";
import { mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { SKILL_RULE } from "../src/agents/claude/settings.js";
import { defaultAgent } from "../src/agents/index.js";
import {
  closePassError,
  type DoctorCheck,
  doctor,
  formatCheck,
  nodeCheck,
  transcriptDirName,
} from "../src/commands/doctor.js";
import { init } from "../src/commands/init.js";
import { hookBlock } from "../src/git-hooks.js";
import { hashTurns } from "../src/messages.js";
import { createProgram } from "../src/program.js";
import { startMapServer } from "../src/server.js";
import { updateConfig } from "../src/store/stores.js";
import { envFor, type FakeIo, fakeIo, noGitDir, T0, tempDir } from "./helpers.js";

const run = promisify(execFile);

let dir: string;
let env: NodeJS.ProcessEnv;
let io: FakeIo;
beforeEach(async () => {
  dir = await tempDir();
  env = envFor(dir);
  io = fakeIo(env);
});

const claudeDir = () => join(dir, "claude");
const settingsFile = () => join(claudeDir(), "settings.json");

/** An initialized project in its own git repository, so its hooks are isolated. */
async function project(name = "proj"): Promise<string> {
  const root = join(dir, name);
  await mkdir(root);
  await run("git", ["init", "-q", root]);
  await init(
    root,
    {
      name,
      git: "commit",
      retention: "keep",
      allowSkill: false,
      projectSettings: false,
      language: "auto",
    },
    fakeIo(env),
  );
  return root;
}

async function settings(value: Record<string, unknown>): Promise<void> {
  await mkdir(claudeDir(), { recursive: true });
  await writeFile(settingsFile(), JSON.stringify(value));
}

/** Claude Code's plugin list, as `claude plugin install` writes it. */
async function installPlugin(version: string): Promise<void> {
  await mkdir(join(claudeDir(), "plugins"), { recursive: true });
  await writeFile(
    join(claudeDir(), "plugins", "installed_plugins.json"),
    JSON.stringify({ version: 2, plugins: { "cogit@cogit": [{ scope: "user", version }] } }),
  );
}

const at = (m: number) => `2026-10-23T10:${String(m).padStart(2, "0")}:00.000Z`;

/** One transcript for this project; returns its path. */
async function transcript(root: string, id = "s1", texts = ["first"]): Promise<string> {
  const folder = join(claudeDir(), "projects", transcriptDirName(root));
  await mkdir(folder, { recursive: true });
  const file = join(folder, `${id}.jsonl`);
  const lines = texts.map((text, index) =>
    JSON.stringify({
      type: "user",
      timestamp: at(index + 1),
      message: { role: "user", content: text },
      origin: { kind: "human" },
    }),
  );
  await writeFile(file, `${lines.join("\n")}\n`);
  return file;
}

/** A session record whose nodes are the given message hashes. */
async function record(root: string, id: string, hashes: string[]): Promise<void> {
  await writeFile(
    join(root, ".cogit", "sessions", `${id}.json`),
    JSON.stringify({
      schema: 1,
      sessionId: id,
      agent: "claude-code",
      title: "Recorded",
      startedAt: T0,
      updatedAt: T0,
      status: { goal: "", done: [], pending: [], next: "" },
      nodes: hashes.map((hash) => ({
        id: hash,
        parent: null,
        kind: "message",
        title: "One",
        at: T0,
      })),
    }),
  );
}

async function check(root: string, id: string): Promise<DoctorCheck> {
  const report = await doctor({ dir: root, io: fakeIo(env) });
  const found = report.checks.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no check ${id}`);
  return found;
}

describe("doctor's building blocks", () => {
  it("names a project's transcript folder the way Claude Code does", () => {
    expect(transcriptDirName("/home/me/my.app")).toBe("-home-me-my-app");
    expect(transcriptDirName("/home/me/.claude/worktrees/x")).toBe("-home-me--claude-worktrees-x");
  });

  it("prints the status, the reason and the fix on one line", () => {
    expect(formatCheck({ id: "x", status: "ok", message: "fine" })).toBe("ok   fine");
    expect(formatCheck({ id: "x", status: "fail", message: "bad", fix: "cogit init" })).toBe(
      "fail bad · fix: cogit init",
    );
  });

  it("tells a headless transcript by its entrypoint", async () => {
    const file = join(dir, "t.jsonl");
    const agent = defaultAgent();
    await writeFile(file, '{"type":"user","entrypoint":"sdk-cli"}\n');
    expect(await agent.isHeadlessTranscript(file)).toBe(true);
    await writeFile(file, '{"type":"system"}\n{"type":"user","entrypoint":"cli"}\n');
    expect(await agent.isHeadlessTranscript(file)).toBe(false);
    // Only the first lines are read; a file that names no entrypoint is a person's.
    await writeFile(file, `${'{"type":"system"}\n'.repeat(60)}{"entrypoint":"sdk-cli"}\n`);
    expect(await agent.isHeadlessTranscript(file)).toBe(false);
    await writeFile(file, "");
    expect(await agent.isHeadlessTranscript(file)).toBe(false);
  });

  it("finds an error only in the last close pass", () => {
    const log = [
      "--- 2026-10-30T10:00:00.000Z backfill s1 --tail -C /p",
      "error: could not run claude: not found",
      "--- 2026-10-30T10:01:00.000Z backfill s1 --tail -C /p",
      "Saved session s1 (2 nodes)",
      "--- 2026-10-30T10:02:00.000Z build /p --quiet",
      "",
    ].join("\n");
    expect(closePassError(log)).toBeUndefined();
    expect(closePassError("--- t backfill s9 --tail\nerror: boom\n")).toEqual({
      sessionId: "s9",
      line: "error: boom",
    });
    expect(closePassError("")).toBeUndefined();
  });
});

describe("doctor", () => {
  it("passes the Node and CLI version check", async () => {
    const root = await project();
    const result = await check(root, "node");
    expect(result.status).toBe("ok");
    expect(result.message).toContain(pkg.version);
    expect(nodeCheck("22.12.0").status).toBe("fail");
    expect(nodeCheck("22.12.0").fix).toContain("22.13");
  });

  it("fails when the plugin is not installed and passes when it is enabled", async () => {
    const root = await project();
    expect((await check(root, "plugin")).status).toBe("fail");

    await installPlugin(pkg.version);
    expect((await check(root, "plugin")).status).toBe("warn");

    await settings({ enabledPlugins: { "cogit@cogit": true } });
    const ok = await check(root, "plugin");
    expect(ok.status).toBe("ok");
    expect(ok.message).toContain(pkg.version);
  });

  it("warns when the plugin's version is unknown or Claude Code's settings are unreadable", async () => {
    const root = await project();
    await mkdir(join(claudeDir(), "plugins"), { recursive: true });
    await writeFile(
      join(claudeDir(), "plugins", "installed_plugins.json"),
      JSON.stringify({ plugins: { "cogit@cogit": [{ scope: "user" }] } }),
    );
    await settings({ enabledPlugins: { "cogit@cogit": true } });
    expect((await check(root, "plugin")).status).toBe("warn");

    await transcript(root);
    await writeFile(settingsFile(), "{ not json");
    expect((await check(root, "plugin")).message).toContain("could not read");
    expect((await check(root, "skill")).message).toContain("could not read");
    expect((await check(root, "transcripts")).message).toContain("retention could not be read");
  });

  it("warns when the plugin and the CLI are at different versions", async () => {
    const root = await project();
    await installPlugin("0.0.9");
    await settings({ enabledPlugins: { "cogit@cogit": true } });
    const result = await check(root, "plugin");
    expect(result.status).toBe("warn");
    expect(result.message).toContain("claude plugin update cogit@cogit");
  });

  it("fails outside git and warns without a git email", async () => {
    const outside = await noGitDir();
    expect((await check(outside, "git")).status).toBe("fail");

    const root = await project();
    await run("git", ["-C", root, "config", "user.email", ""]);
    const warn = await check(root, "git");
    expect(warn.status).toBe("warn");
    expect(warn.fix).toContain("git config --global user.email");

    await run("git", ["-C", root, "config", "user.email", "me@example.com"]);
    await run("git", ["-C", root, "config", "user.name", "Me"]);
    const ok = await check(root, "git");
    expect(ok.status).toBe("ok");
    expect(ok.message).toContain("me@example.com");
  });

  it("fails an uninitialized project and warns about hooks that are missing or outdated", async () => {
    const plain = join(dir, "plain");
    await mkdir(plain);
    await run("git", ["init", "-q", plain]);
    expect((await check(plain, "project")).status).toBe("fail");

    const root = await project();
    expect((await check(root, "project")).status).toBe("ok");

    await rm(join(root, ".git", "hooks", "prepare-commit-msg"));
    expect((await check(root, "project")).message).toContain("prepare-commit-msg hook is missing");

    await writeFile(
      join(root, ".git", "hooks", "prepare-commit-msg"),
      "#!/bin/sh\n\n# >>> cogit\ncogit hook prepare-commit-msg\n# <<< cogit\n",
    );
    const stale = await check(root, "project");
    expect(stale.status).toBe("warn");
    expect(stale.message).toContain("prepare-commit-msg hook is outdated");
    expect(stale.fix).toBe("cogit hooks install");

    // A block another CLI installed (the plugin cache, a global install) is current.
    await writeFile(
      join(root, ".git", "hooks", "prepare-commit-msg"),
      `#!/bin/sh\n\n${hookBlock("prepare-commit-msg", root, "/elsewhere/cogit/dist/cli.js")}\n`,
    );
    expect((await check(root, "project")).status).toBe("ok");

    await writeFile(join(root, ".cogit", "project.json"), "{ not json");
    const broken = await check(root, "project");
    expect(broken.status).toBe("fail");
    expect(broken.message).toContain("invalid JSON");
  });

  it("warns until the record skill is allowed", async () => {
    const root = await project();
    expect((await check(root, "skill")).status).toBe("warn");
    await settings({ permissions: { allow: [SKILL_RULE] } });
    expect((await check(root, "skill")).status).toBe("ok");
  });

  it("warns without a transcript and when retention is short", async () => {
    const root = await project();
    expect((await check(root, "transcripts")).status).toBe("warn");

    await transcript(root);
    expect((await check(root, "transcripts")).status).toBe("warn"); // no settings: 30 days

    await settings({ cleanupPeriodDays: 120 });
    const ok = await check(root, "transcripts");
    expect(ok.status).toBe("ok");
    expect(ok.message).toContain("120 days");
  });

  it("reports the recorded sessions and the unrecorded tail", async () => {
    const root = await project();
    const file = await transcript(root);
    expect((await check(root, "sessions")).status).toBe("warn");

    const turns = hashTurns("s1", await defaultAgent().readConversation(file));
    await record(root, "s1", [turns[0]?.hash ?? ""]);
    const ok = await check(root, "sessions");
    expect(ok.status).toBe("ok");
    expect(ok.message).toContain("1 session(s) recorded");

    // A headless run (Ralph, `claude -p`) is newer, but nobody records it.
    const headless = await transcript(root, "h1", ["ralph"]);
    await writeFile(
      headless,
      `{"type":"system","entrypoint":"sdk-cli"}\n${await readFile(headless, "utf8")}`,
    );
    const later = new Date(Date.now() + 60_000);
    await utimes(headless, later, later);
    expect((await check(root, "sessions")).status).toBe("ok");
    await updateConfig((config) => ({ ...config, recordHeadless: true }), env);
    expect((await check(root, "sessions")).fix).toBe("cogit backfill h1 --tail");
    await updateConfig((config) => ({ ...config, recordHeadless: false }), env);

    await transcript(root, "s2", ["new one"]);
    const newer = await check(root, "sessions");
    expect(newer.status).toBe("warn");
    expect(newer.fix).toBe("cogit backfill s2 --tail");
  });

  it("warns when the map server is down and passes when it answers", async () => {
    const root = await project();
    expect((await check(root, "server")).status).toBe("warn");

    const server = await startMapServer({ env, port: 0 });
    try {
      await updateConfig((config) => ({ ...config, serverPort: server.port }), env);
      const ok = await check(root, "server");
      expect(ok.status).toBe("ok");
      expect(ok.message).toContain(String(server.port));
    } finally {
      await server.close();
    }
  });

  it("turns a check that cannot read its data into a failure, not a crash", async () => {
    const root = await project();
    await rm(join(root, ".cogit", "sessions"), { recursive: true, force: true });
    await writeFile(join(root, ".cogit", "sessions"), "not a directory");
    const result = await check(root, "sessions");
    expect(result.status).toBe("fail");
    expect(result.message).toContain("the check could not run");
  });

  it("reports an error the last close pass wrote", async () => {
    const root = await project();
    expect((await check(root, "detached")).status).toBe("ok");
    await mkdir(join(root, ".cogit", "state"), { recursive: true });
    await writeFile(
      join(root, ".cogit", "state", "detached.log"),
      "--- 2026-10-30T10:00:00.000Z backfill s7 --tail --close -C /p\nerror: could not run claude\n",
    );
    const warn = await check(root, "detached");
    expect(warn.status).toBe("warn");
    expect(warn.fix).toBe("cogit backfill s7 --tail --close");
  });

  it("runs end to end from the CLI, prints one line per check and exits 1 on a failure", async () => {
    const root = join(dir, "empty");
    await mkdir(root);
    await run("git", ["init", "-q", root]);
    const lines = fakeIo(env);
    let code: number | undefined;
    const program = createProgram(() => lines, {
      exitCode: (value) => {
        code = value;
      },
    });
    program.exitOverride().configureOutput({ writeErr: () => {}, writeOut: () => {} });
    for (const command of program.commands) command.exitOverride();
    await program.parseAsync(["doctor", root], { from: "user" });

    expect(lines.lines.length).toBeGreaterThanOrEqual(9);
    expect(lines.lines.every((line) => /^(ok   |warn |fail )/.test(line))).toBe(true);
    expect(lines.lines.join("\n")).toMatch(/fail .*project\.json is missing/);
    expect(code).toBe(1);

    // Without the test seam the command sets the process exit code itself.
    const before = process.exitCode;
    try {
      const bare = createProgram(() => fakeIo(env));
      bare.exitOverride();
      await bare.parseAsync(["doctor", root], { from: "user" });
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = before;
    }

    const json = fakeIo(env);
    const report = await doctor({ dir: root, io: json, json: true });
    expect(JSON.parse(json.lines.at(-1) ?? "{}")).toMatchObject({ ok: false });
    expect(report.checks.map((entry) => entry.id)).toEqual([
      "node",
      "plugin",
      "git",
      "project",
      "skill",
      "transcripts",
      "sessions",
      "server",
      "detached",
    ]);
  });
});
