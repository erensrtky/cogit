#!/usr/bin/env node
// npm publishes from packages/cli; the registry shows the README and LICENSE it finds
// next to package.json, so `prepack` copies the repo's two files there.
import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DOCS = ["README.md", "LICENSE"];

/** Copies the root docs into the package that npm publishes; returns what it copied. */
export function copyDocs(root) {
  const target = join(root, "packages/cli");
  for (const name of DOCS) copyFileSync(join(root, name), join(target, name));
  return [...DOCS];
}

/** Copies into this repository and prints each file. */
export function run(log = console.log) {
  for (const name of copyDocs(join(dirname(fileURLToPath(import.meta.url)), "..")))
    log(`packages/cli/${name}: copied`);
  return [...DOCS];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
