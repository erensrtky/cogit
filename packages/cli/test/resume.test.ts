import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildProject } from "../src/commands/build.js";
import { epochAdd } from "../src/commands/epoch.js";
import { init } from "../src/commands/init.js";
import type { Session } from "../src/schema/session.js";
import { projectPaths } from "../src/store/paths.js";
import { resumeCommand, shellQuote } from "../src/view/resume.js";
import { claudeConfigDir, collectTranscriptIds } from "../src/view/transcripts.js";
import { envFor, fakeIo, T0, tempDir } from "./helpers.js";

function session(over: Partial<Session> & { sessionId: string }): Session {
  return {
    schema: 1,
    agent: "claude-code",
    title: "",
    epoch: null,
    startedAt: T0,
    updatedAt: T0,
    status: { goal: "", done: [], pending: [], next: "" },
    nodes: [],
    ...over,
  };
}

describe("resumeCommand", () => {
  it("quotes the project path and leaves a plain session id alone", () => {
    expect(resumeCommand("/home/me/proj", "abc-123")).toBe(
      "cd '/home/me/proj' && claude --resume abc-123",
    );
  });

  it("escapes a single quote in the path", () => {
    expect(shellQuote("/tmp/it's here")).toBe("'/tmp/it'\\''s here'");
    expect(resumeCommand("/tmp/it's here", "id")).toContain("cd '/tmp/it'\\''s here'");
  });

  it("quotes an unusual session id", () => {
    expect(resumeCommand("/p", "a b")).toBe("cd '/p' && claude --resume 'a b'");
  });
});

describe("collectTranscriptIds", () => {
  it("collects .jsonl names from every project directory", async () => {
    const dir = await tempDir();
    const env = envFor(dir);
    const projects = join(claudeConfigDir(env), "projects");
    await mkdir(join(projects, "-home-me-proj"), { recursive: true });
    await mkdir(join(projects, "-home-me-other"), { recursive: true });
    await writeFile(join(projects, "-home-me-proj", "s1.jsonl"), "{}\n");
    await writeFile(join(projects, "-home-me-other", "s2.jsonl"), "{}\n");
    await writeFile(join(projects, "-home-me-other", "notes.txt"), "x");

    expect(await collectTranscriptIds(env)).toEqual(new Set(["s1", "s2"]));
  });

  it("skips a project directory it cannot read", async () => {
    const dir = await tempDir();
    const env = envFor(dir);
    const projects = join(claudeConfigDir(env), "projects");
    const locked = join(projects, "-locked");
    await mkdir(locked, { recursive: true });
    await chmod(locked, 0o000);
    try {
      expect(await collectTranscriptIds(env)).toEqual(new Set());
    } finally {
      await chmod(locked, 0o755);
    }
  });

  it("returns an empty set when the Claude home is missing", async () => {
    const dir = await tempDir();
    expect(await collectTranscriptIds(envFor(dir))).toEqual(new Set());
  });
});

describe("buildProject transcript availability", () => {
  let dir: string;
  let root: string;

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(root);
    await init(root, { name: "proj", retention: "keep", language: "auto" }, fakeIo(envFor(dir)));
    await epochAdd(root, "e1", "First", fakeIo(envFor(dir)));
    const paths = projectPaths(root);
    await writeFile(
      paths.session("alive"),
      JSON.stringify(session({ sessionId: "alive", epoch: "e1" })),
    );
    await writeFile(
      paths.session("gone"),
      JSON.stringify(session({ sessionId: "gone", epoch: "e1" })),
    );
  });

  it("marks sessions whose transcript file exists", async () => {
    const env = envFor(dir);
    const projectDir = join(claudeConfigDir(env), "projects", "-home-me-proj");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, "alive.jsonl"), "{}\n");

    const model = await buildProject({ dir: root, io: fakeIo(env) });
    const sessions = model.epochs[0]?.sessions ?? [];
    expect(sessions.map((s) => [s.sessionId, s.transcriptAvailable])).toEqual([
      ["alive", true],
      ["gone", false],
    ]);
  });
});
