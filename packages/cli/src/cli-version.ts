import { readFile, realpath, stat } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import type { AgentAdapter } from "./agents/types.js";

/**
 * The plugin and the `cogit` command on the PATH update through different channels
 * (a marketplace, npm), so one can fall behind the other. The plugin's hooks run their
 * own bundled CLI and keep recording either way; this only tells the user which one to
 * update. Nothing here touches the network: it reads the installed package's manifest.
 */

export const PACKAGE = "@cogit/cli";

/** The version of the `cogit` command on `env.PATH`; undefined when there is none or it is not ours. */
export async function installedCliVersion(env: NodeJS.ProcessEnv): Promise<string | undefined> {
  for (const dir of (env.PATH ?? "").split(delimiter)) {
    if (dir === "") continue;
    const bin = join(dir, "cogit");
    try {
      if (!(await stat(bin)).isFile()) continue;
    } catch {
      continue;
    }
    const manifests = [
      // npm links bin/cogit to <package>/dist/cli.js...
      async () => join(dirname(dirname(await realpath(bin))), "package.json"),
      // ...and on Windows writes shims beside <prefix>/node_modules instead.
      async () => join(dir, "node_modules", ...PACKAGE.split("/"), "package.json"),
    ];
    for (const manifest of manifests) {
      try {
        const pkg = JSON.parse(await readFile(await manifest(), "utf8")) as {
          name?: unknown;
          version?: unknown;
        };
        if (pkg.name === PACKAGE && typeof pkg.version === "string") return pkg.version;
      } catch {}
    }
    // The first cogit on the PATH is the one that runs; it is not ours.
    return undefined;
  }
  return undefined;
}

/** Compares two x.y.z versions numerically; a pre-release suffix is ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    (v.split("-")[0] ?? "").split(".").map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

/** One line for the user when the plugin (`running`) and the installed command differ. */
export function versionNotice(
  running: string,
  installed: string | undefined,
  agent: Pick<AgentAdapter, "updateHint">,
): string | undefined {
  if (installed === undefined) return undefined;
  const order = compareVersions(running, installed);
  if (order > 0)
    return `cogit: the cogit command is ${installed}, the plugin ${running}. Update the command with \`npm install -g ${PACKAGE}\`.`;
  if (order < 0)
    return `cogit: the plugin is ${running}, the cogit command ${installed}. Update ${agent.updateHint}.`;
  return undefined;
}
