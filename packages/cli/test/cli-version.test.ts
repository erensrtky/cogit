import { chmod, mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { compareVersions, installedCliVersion, versionNotice } from "../src/cli-version.js";
import { runHook } from "../src/hooks/run.js";
import { envFor, T0, tempDir } from "./helpers.js";

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
    expect(await installedCliVersion({ PATH: ["", empty, older, newer].join(":") })).toBe("0.18.0");
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

  it("names the one to update", () => {
    expect(versionNotice("0.19.1", undefined)).toBeUndefined();
    expect(versionNotice("0.19.1", "0.19.1")).toBeUndefined();
    expect(versionNotice("0.19.1", "0.19.0")).toBe(
      "cogit: the cogit command is 0.19.0, the plugin 0.19.1. Update the command with `npm install -g @cogit/cli`.",
    );
    expect(versionNotice("0.19.0", "0.19.1")).toContain(
      "the plugin is 0.19.0, the cogit command 0.19.1. Update the plugin with `claude plugin update cogit@cogit`",
    );
  });

  it("shows the notice to the user when a new chat starts, beside the agent's context", async () => {
    const root = join(dir, "proj");
    await mkdir(root);
    const env = { ...envFor(dir), PATH: await npmPrefix("@cogit/cli", "0.0.1") };
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
