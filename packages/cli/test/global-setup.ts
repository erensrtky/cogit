import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
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
  const tmp = mkdtempSync(join(tmpdir(), "cogit-test-"));
  // `cogit init` needs a git repository; every temp project lives inside this one.
  execFileSync("git", ["init", "-q", tmp]);
  // A test that needs a directory outside any repository makes it here.
  const outside = mkdtempSync(join(tmpdir(), "cogit-nogit-"));
  process.env.COGIT_TEST_NO_GIT = outside;
  process.env.TMPDIR = tmp;
  const index = join(root, "packages/template/dist/index.html");
  if (!existsSync(index)) {
    execFileSync("npm", ["run", "build", "-w", "template"], { cwd: root, stdio: "ignore" });
  }
  return () => {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  };
}
