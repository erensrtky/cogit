import { chmod, mkdir, symlink, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { AGENTS, type AgentAdapter } from "../src/agents/index.js";
import { compareVersions, installedCliVersion, versionNotice } from "../src/cli-version.js";
import { runHook } from "../src/hooks/run.js";
import { envFor, pathWith, T0, tempDir } from "./helpers.js";

let dir: string;
beforeEach(async () => {
  dir = await tempDir();
});

/** A global npm install: prefix/bin/cogit -> ../lib/node_modules/<name>/dist/cli.js. */
async function npmPrefix(name: string, version: string): Promise<string> {
  const prefix = join(dir, `npm-${version}`);
  const pkgDir = join(prefix, "lib", "node_modules", ...name.split("/"));
  await mkdir(join(pkgDir, "dist"), { recursive: true });
  await writeFile(join(pkgDir, "package.json"), JSON.stringify({ name, version }));
  await writeFile(join(pkgDir, "dist", "cli.js"), "");
  await mkdir(join(prefix, "bin"));
  await symlink(join(pkgDir, "dist", "cli.js"), join(prefix, "bin", "cogit"));
  return join(prefix, "bin");
}

describe("the installed cogit command", () => {
  it("reads the version of the first cogit on the PATH", async () => {
    const older = await npmPrefix("@cogit/cli", "0.18.0");
    const newer = await npmPrefix("@cogit/cli", "0.19.1");
    const empty = join(dir, "empty");
    await mkdir(join(empty, "cogit"), { recursive: true });
    expect(await installedCliVersion({ PATH: ["", empty, older, newer].join(delimiter) })).toBe(
      "0.18.0",
    );
  });

  it("reads the version npm installs on Windows, beside the shims", async () => {
    const prefix = join(dir, "npm-windows");
    const pkgDir = join(prefix, "node_modules", "@cogit", "cli");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(
      join(pkgDir, "package.json"),
      JSON.stringify({ name: "@cogit/cli", version: "1.4.0" }),
    );
    await writeFile(join(prefix, "cogit"), "#!/bin/sh\n");
    await writeFile(join(prefix, "cogit.cmd"), "@node %*\r\n");
    expect(await installedCliVersion({ PATH: prefix })).toBe("1.4.0");
  });

  it("says nothing for no PATH, no cogit, or a cogit that is not ours", async () => {
    expect(await installedCliVersion({})).toBeUndefined();
    expect(await installedCliVersion({ PATH: join(dir, "nowhere") })).toBeUndefined();
    const other = await npmPrefix("co-git", "9.9.9");
    expect(await installedCliVersion({ PATH: other })).toBeUndefined();
    // A plain script with no package next to it.
    const bin = join(dir, "plain");
    await mkdir(bin);
    await writeFile(join(bin, "cogit"), "#!/bin/sh\n");
    await chmod(join(bin, "cogit"), 0o755);
    expect(await installedCliVersion({ PATH: bin })).toBeUndefined();
  });

  it("compares versions by number", () => {
    expect(compareVersions("0.19.1", "0.19.0")).toBe(1);
    expect(compareVersions("0.9.0", "0.10.0")).toBe(-1);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe(0);
    expect(compareVersions("x", "0.0.0")).toBe(0);
  });

  it("names the one to update, with the session's own agent's command", () => {
    const claude = AGENTS["claude-code"] as AgentAdapter;
    expect(versionNotice("0.19.1", undefined, claude)).toBeUndefined();
    expect(versionNotice("0.19.1", "0.19.1", claude)).toBeUndefined();
    expect(versionNotice("0.19.1", "0.19.0", claude)).toBe(
      "cogit: the cogit command is 0.19.0, the plugin 0.19.1. Update the command with `npm install -g @cogit/cli`.",
    );
    expect(versionNotice("0.19.0", "0.19.1", claude)).toContain(
      "the plugin is 0.19.0, the cogit command 0.19.1. Update the plugin with `claude plugin update cogit@cogit`",
    );
    // Codex users were told Claude Code's command before.
    expect(versionNotice("0.19.0", "0.19.1", AGENTS.codex as AgentAdapter)).toContain(
      "Update the plugin with `codex plugin marketplace upgrade cogit && codex plugin add cogit@cogit`, then accept the hooks review",
    );
  });

  it("shows the notice to the user when a new chat starts, beside the agent's context", async () => {
    const root = join(dir, "proj");
    await mkdir(root);
    const env = { ...envFor(dir), PATH: pathWith(await npmPrefix("@cogit/cli", "0.0.1")) };
    const start = async (source: string) =>
      runHook(
        "sessionstart",
        JSON.stringify({ session_id: "s1", cwd: root, source }),
        env,
        T0,
        () => {},
      );
    const out = JSON.parse((await start("startup")) ?? "");
    expect(out.systemMessage).toBe(
      `cogit: the cogit command is 0.0.1, the plugin ${pkg.version}. Update the command with \`npm install -g @cogit/cli\`.`,
    );
    // The setup offer for this uninitialized project still reaches the agent.
    expect(out.hookSpecificOutput.additionalContext).toContain("cogit is not set up");
    // A resumed chat gets its usual context and no notice.
    expect(JSON.parse((await start("resume")) ?? "").systemMessage).toBeUndefined();
  });
});
