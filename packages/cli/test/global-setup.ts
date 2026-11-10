import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * The CLI embeds `packages/template/dist/index.html` as text at bundle time, so
 * tests need the template built once. It is gitignored and not guaranteed to
 * exist on a fresh checkout.
 */
export function setup(): () => void {
  // Hooks leave per-session marks in the temp dir; keep tests out of the real one.
  // The real path: macOS reaches its temp dir through the /var -> /private/var
  // link and Windows through a short RUNNER~1 name, while git reports the long one.
  const tmp = realpathSync.native(mkdtempSync(join(tmpdir(), "cogit-test-")));
  // `cogit init` needs a git repository; every temp project lives inside this one.
  execFileSync("git", ["init", "-q", tmp]);
  // A test that needs a directory outside any repository makes it here.
  const outside = realpathSync.native(mkdtempSync(join(tmpdir(), "cogit-nogit-")));
  process.env.COGIT_TEST_NO_GIT = outside;
  // os.tmpdir() reads TMPDIR on Unix and TEMP / TMP on Windows.
  process.env.TMPDIR = tmp;
  process.env.TEMP = tmp;
  process.env.TMP = tmp;
  // The transcript cache (turn-cache.ts) stays out of the real ~/.cache too.
  process.env.COGIT_CACHE_DIR = join(tmp, "cache");
  const index = join(root, "packages/template/dist/index.html");
  if (!existsSync(index)) {
    execFileSync("npm", ["run", "build", "-w", "template"], { cwd: root, stdio: "ignore" });
  }
  return () => {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  };
}
