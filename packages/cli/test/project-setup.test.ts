import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  GUARD_COMMAND,
  GUARD_REASON,
  markLive,
  PLUGIN_ID,
  projectSettingsPath,
  readProjectSetup,
  writeProjectSetup,
} from "../src/agents/claude/settings.js";
import { runHook } from "../src/hooks/run.js";
import { envFor, T0, tempDir } from "./helpers.js";

let root: string;
let tmp: string;
beforeEach(async () => {
  root = await tempDir();
  tmp = await tempDir();
});

const readSettings = async () =>
  JSON.parse(await readFile(projectSettingsPath(root), "utf8")) as Record<string, any>;

/** Runs the guard the way Claude Code would: through `sh`, the payload on stdin. */
function guard(sessionId: string, attended: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "sh",
      ["-c", GUARD_COMMAND],
      { env: { PATH: process.env.PATH, TMPDIR: tmp, CLAUDE_CODE_SESSION_ATTENDED: attended } },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    );
    child.stdin?.end(JSON.stringify({ session_id: sessionId, prompt: "hi" }));
  });
}

/** Runs `fn` with the process temp dir pointed at the test's own. */
async function withTmp<T>(fn: () => Promise<T>): Promise<T> {
  const saved = process.env.TMPDIR;
  process.env.TMPDIR = tmp;
  try {
    return await fn();
  } finally {
    // assigning undefined would store the string "undefined"
    if (saved === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = saved;
  }
}

describe("project setup", () => {
  it("enables the plugin and adds the guard, keeping what was there", async () => {
    await mkdir(join(root, ".claude"));
    const other = { hooks: [{ type: "command", command: "echo other" }] };
    await writeFile(
      projectSettingsPath(root),
      JSON.stringify({
        model: "x",
        enabledPlugins: { "a@b": true },
        hooks: { UserPromptSubmit: [other], Stop: [other] },
      }),
    );
    expect(await readProjectSetup(root)).toBe(false);

    await writeProjectSetup(root);
    await writeProjectSetup(root);

    const s = await readSettings();
    expect(s.model).toBe("x");
    expect(s.enabledPlugins).toEqual({ "a@b": true, [PLUGIN_ID]: true });
    expect(s.extraKnownMarketplaces.cogit.source).toEqual({
      source: "github",
      repo: "erensrtky/cogit",
    });
    expect(s.hooks.Stop).toEqual([other]);
    // the guard is added once, after the hooks that were there
    expect(s.hooks.UserPromptSubmit).toHaveLength(2);
    expect(s.hooks.UserPromptSubmit[0]).toEqual(other);
    expect(await readProjectSetup(root)).toBe(true);
  });

  it("creates the file when there is none and refuses one it cannot parse", async () => {
    await writeProjectSetup(root);
    expect(await readProjectSetup(root)).toBe(true);

    await writeFile(projectSettingsPath(root), "{ not json");
    expect(await readProjectSetup(root)).toBeUndefined();
    await expect(writeProjectSetup(root)).rejects.toThrow(/not a valid JSON object/);

    await writeFile(projectSettingsPath(root), JSON.stringify({ enabledPlugins: [] }));
    await expect(writeProjectSetup(root)).rejects.toThrow(/unexpected enabledPlugins/);
    await writeFile(projectSettingsPath(root), JSON.stringify({ hooks: { UserPromptSubmit: {} } }));
    await expect(writeProjectSetup(root)).rejects.toThrow(/unexpected hooks.UserPromptSubmit/);
  });

  it("blocks an attended session without the plugin once, then lets it through", async () => {
    const first = await guard("s-1", "1");
    expect(JSON.parse(first)).toEqual({ decision: "block", reason: GUARD_REASON });
    expect(await guard("s-1", "1")).toBe("");
    // another session is warned on its own
    expect(await guard("s-2", "1")).not.toBe("");
  });

  it("never blocks a headless run or a session the plugin marked", async () => {
    expect(await guard("s-3", "0")).toBe("");
    expect(existsSync(join(tmp, "cogit-live", "s-3.warned"))).toBe(false);

    await withTmp(() => markLive("s-4"));
    expect(await guard("s-4", "1")).toBe("");
  });

  it("marks the session live from the plugin's SessionStart hook", async () => {
    const env = { ...envFor(await tempDir()), TMPDIR: tmp };
    const input = JSON.stringify({ session_id: "s-5", cwd: root });
    await withTmp(() => runHook("sessionstart", input, env, T0, () => {}));
    expect(existsSync(join(tmp, "cogit-live", "s-5"))).toBe(true);
    expect(await guard("s-5", "1")).toBe("");
  });

  it("keeps the hook going when the mark cannot be written", async () => {
    const env = envFor(await tempDir());
    const notADir = join(tmp, "file");
    await writeFile(notADir, "");
    const lines: string[] = [];
    const saved = tmp;
    tmp = notADir;
    try {
      const input = JSON.stringify({ session_id: "s-6", cwd: root });
      await withTmp(() => runHook("sessionstart", input, env, T0, (l) => lines.push(l)));
    } finally {
      tmp = saved;
    }
    expect(lines.some((l) => l.startsWith("cogit mark:"))).toBe(true);
  });
});
