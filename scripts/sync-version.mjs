#!/usr/bin/env node
// VERSION is the single source (./release bumps it); npm and the plugin manifest copy it.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const TARGETS = ["packages/cli/package.json", "packages/cli/.claude-plugin/plugin.json"];

/** Copies VERSION into every target; returns the files it changed. */
export function syncVersion(root) {
  const version = readFileSync(join(root, "VERSION"), "utf8").trim();
  const changed = [];
  for (const rel of TARGETS) {
    const file = join(root, rel);
    const json = JSON.parse(readFileSync(file, "utf8"));
    if (json.version === version) continue;
    json.version = version;
    writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
    changed.push(rel);
  }
  return { version, changed };
}

/** Syncs this repository and prints each changed file. */
export function run(log = console.log) {
  const { version, changed } = syncVersion(join(dirname(fileURLToPath(import.meta.url)), ".."));
  for (const rel of changed) log(`${rel}: version ${version}`);
  return changed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
