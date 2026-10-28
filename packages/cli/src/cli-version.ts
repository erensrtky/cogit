import { readFile, realpath, stat } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";

/**
 * The plugin and the `cogit` command on the PATH update through different channels
 * (a marketplace, npm), so one can fall behind the other. The plugin's hooks run their
 * own bundled CLI and keep recording either way; this only tells the user which one to
 * update. Nothing here touches the network: it reads the installed package's manifest.
 */

const PACKAGE = "@cogit/cli";

/** The version of the `cogit` command on `env.PATH`; undefined when there is none or it is not ours. */
export async function installedCliVersion(env: NodeJS.ProcessEnv): Promise<string | undefined> {
  for (const dir of (env.PATH ?? "").split(delimiter)) {
    if (dir === "") continue;
    const bin = join(dir, "cogit");
    try {
      if (!(await stat(bin)).isFile()) continue;
      // npm links bin/cogit to <package>/dist/cli.js.
      const pkg = JSON.parse(
        await readFile(join(dirname(dirname(await realpath(bin))), "package.json"), "utf8"),
      ) as { name?: unknown; version?: unknown };
      if (pkg.name === PACKAGE && typeof pkg.version === "string") return pkg.version;
      return undefined;
    } catch {}
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
export function versionNotice(running: string, installed: string | undefined): string | undefined {
  if (installed === undefined) return undefined;
  const order = compareVersions(running, installed);
  if (order > 0)
    return `cogit: the cogit command is ${installed}, the plugin ${running}. Update the command with \`npm install -g ${PACKAGE}\`.`;
  if (order < 0)
    return (
      `cogit: the plugin is ${running}, the cogit command ${installed}. Update the plugin with ` +
      "`claude plugin update cogit@cogit`, or turn on auto-update in /plugin → Marketplaces → cogit."
    );
  return undefined;
}
