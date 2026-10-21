import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * The CLI embeds `packages/template/dist/index.html` as text at bundle time, so
 * tests need the template built once. It is gitignored and not guaranteed to
 * exist on a fresh checkout.
 */
export function setup(): void {
  const index = join(root, "packages/template/dist/index.html");
  if (!existsSync(index)) {
    execFileSync("npm", ["run", "build", "-w", "template"], { cwd: root, stdio: "ignore" });
  }
}
