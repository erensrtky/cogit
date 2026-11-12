import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGENTS } from "../src/agents/index.js";
import type { AgentAdapter } from "../src/agents/types.js";
import { createProgram } from "../src/program.js";
import {
  fetchLatestVersion,
  newerVersion,
  readUpdateState,
  refreshUpdateState,
  updateCheckDue,
  updateNotice,
  updateText,
} from "../src/update-check.js";
import { envFor, T0, tempDir } from "./helpers.js";

let env: NodeJS.ProcessEnv;
beforeEach(async () => {
  env = envFor(await tempDir());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const claude = AGENTS["claude-code"] as AgentAdapter;
const codex = AGENTS.codex as AgentAdapter;
const DAY = 24 * 60 * 60_000;
const later = (ms: number) => new Date(Date.parse(T0) + ms).toISOString();

/** A fetch that answers npm's "latest" request with `body`, or fails. */
function npm(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

describe("npm's newest version", () => {
  it("reads npm's latest version and nothing else", async () => {
    let asked = "";
    const spy = (async (url: string | URL | Request) => {
      asked = String(url);
      return new Response(JSON.stringify({ version: "1.6.0", description: "x" }));
    }) as typeof fetch;
    expect(await fetchLatestVersion(spy)).toBe("1.6.0");
    expect(asked).toBe("https://registry.npmjs.org/@cogit/cli/latest");
  });

  it("answers nothing when npm cannot be reached or answers oddly", async () => {
    expect(await fetchLatestVersion(npm({ version: "1.6.0" }, 404))).toBeUndefined();
    expect(await fetchLatestVersion(npm({ version: "latest" }))).toBeUndefined();
    expect(await fetchLatestVersion(npm(["1.6.0"]))).toBeUndefined();
    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect(await fetchLatestVersion(offline)).toBeUndefined();
    const slow = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
      )) as typeof fetch;
    expect(await fetchLatestVersion(slow, 5)).toBeUndefined();
  });

  it("keeps the answer, and keeps the last one when npm fails", async () => {
    expect(await readUpdateState(env)).toEqual({});
    expect(await refreshUpdateState(env, T0, npm({ version: "1.6.0" }))).toBe("1.6.0");
    expect(await readUpdateState(env)).toEqual({ checkedAt: T0, latest: "1.6.0" });
    expect(await refreshUpdateState(env, later(DAY), npm({}, 500))).toBeUndefined();
    expect(await readUpdateState(env)).toEqual({ checkedAt: T0, latest: "1.6.0" });
  });

  it("reads a broken state file as no answer", async () => {
    const dir = join(env.COGIT_HOME as string, "state");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "update-check.json"), "{");
    expect(await readUpdateState(env)).toEqual({});
    await writeFile(join(dir, "update-check.json"), "null");
    expect(await readUpdateState(env)).toEqual({});
  });
});

describe("the update notice", () => {
  it("is due once the answer is a day old, or missing, or from the future", () => {
    expect(updateCheckDue({}, T0)).toBe(true);
    expect(updateCheckDue({ checkedAt: T0 }, later(DAY - 1))).toBe(false);
    expect(updateCheckDue({ checkedAt: T0 }, later(DAY))).toBe(true);
    expect(updateCheckDue({ checkedAt: later(DAY) }, T0)).toBe(true);
  });

  it("names a newer version only", () => {
    expect(newerVersion({ latest: "1.6.0" }, "1.5.0")).toBe("1.6.0");
    expect(newerVersion({ latest: "1.5.0" }, "1.5.0")).toBeUndefined();
    expect(newerVersion({ latest: "1.4.2" }, "1.5.0")).toBeUndefined();
    expect(newerVersion({ latest: "next" }, "1.5.0")).toBeUndefined();
    expect(newerVersion({}, "1.5.0")).toBeUndefined();
  });

  it("gives each agent its own commands", () => {
    expect(updateText("1.6.0", "1.5.0", codex)).toBe(
      "cogit 1.6.0 is out (you have 1.5.0). Update with `npm install -g @cogit/cli` and the plugin " +
        "with `codex plugin marketplace upgrade cogit && codex plugin add cogit@cogit`, then accept " +
        "the hooks review Codex shows at its next start. Turn this off with `cogit config set updateCheck false`.",
    );
    expect(updateText("1.6.0", "1.5.0", claude)).toContain("`claude plugin update cogit@cogit`");
  });

  it("tells a new version once a day, and a newer one at once", async () => {
    const refresh = vi.fn();
    await refreshUpdateState(env, T0, npm({ version: "1.6.0" }));
    expect(await updateNotice(env, T0, "1.5.0", claude, refresh)).toContain("cogit 1.6.0 is out");
    expect(await updateNotice(env, later(1000), "1.5.0", claude, refresh)).toBeUndefined();
    expect(refresh).not.toHaveBeenCalled();
    await refreshUpdateState(env, later(2000), npm({ version: "1.7.0" }));
    expect(await updateNotice(env, later(3000), "1.5.0", claude, refresh)).toContain("1.7.0");
    // A day on: told again, and npm is asked again.
    expect(await updateNotice(env, later(DAY + 3000), "1.5.0", claude, refresh)).toContain("1.7.0");
    expect(refresh).toHaveBeenCalledTimes(1);
    // Up to date: nothing to tell.
    expect(await updateNotice(env, later(DAY + 4000), "1.7.0", claude, refresh)).toBeUndefined();
  });

  it("asks npm from `cogit update-check`, the command SessionStart starts", async () => {
    vi.stubGlobal("fetch", npm({ version: "1.6.0" }));
    const lines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });
    const before = { ...process.env };
    Object.assign(process.env, env);
    try {
      await createProgram().parseAsync(["node", "cogit", "update-check"]);
      vi.stubGlobal("fetch", npm({}, 503));
      await createProgram().parseAsync(["node", "cogit", "update-check"]);
    } finally {
      process.env = before;
    }
    expect(lines.join("")).toContain("newest on npm: 1.6.0");
    expect(lines.join("")).toContain("could not reach npm");
    expect((await readUpdateState(env)).latest).toBe("1.6.0");
  });
});
