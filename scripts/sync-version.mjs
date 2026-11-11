#!/usr/bin/env node
// VERSION is the single source (./release bumps it); npm and both plugin manifests copy it.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const TARGETS = [
  "packages/cli/package.json",
  "packages/cli/.claude-plugin/plugin.json",
  "packages/cli/.codex-plugin/plugin.json",
];

/** Compares two x.y.z versions numerically. */
function compare(a, b) {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  return [0, 1, 2].map((i) => (x[i] ?? 0) - (y[i] ?? 0)).find((d) => d !== 0) ?? 0;
}

/**
 * Copies VERSION into every target; returns the files it changed. A manifest
 * already ahead of VERSION is left alone: the release bumps the manifests in
 * the commit before it bumps VERSION, and a build or test in between must not
 * take the bump back.
 */
export function syncVersion(root) {
  const version = readFileSync(join(root, "VERSION"), "utf8").trim();
  const changed = [];
  for (const rel of TARGETS) {
    const file = join(root, rel);
    const text = readFileSync(file, "utf8");
    const json = JSON.parse(text);
    if (json.version === version) continue;
    if (typeof json.version === "string" && compare(json.version, version) > 0) continue;
    // Replace only the version string, so the file keeps the formatting the repo
    // lints. A file without one is written fresh.
    const next = text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
    const fallback = `${JSON.stringify({ ...json, version }, null, 2)}\n`;
    writeFileSync(file, next === text ? fallback : next);
    changed.push(rel);
  }
  return { version, changed };
}

/** Syncs this repository (or `root`) and prints each changed file. */
export function run(log = console.log, root = join(dirname(fileURLToPath(import.meta.url)), "..")) {
  const { version, changed } = syncVersion(root);
  for (const rel of changed) log(`${rel}: version ${version}`);
  return changed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
