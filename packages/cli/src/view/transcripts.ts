import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** Where Claude Code keeps its state: `$CLAUDE_CONFIG_DIR` or `~/.claude`. */
export function claudeConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
}

/**
 * Session ids that still have a transcript under `projects/<encoded>/*.jsonl`.
 * Best effort: an unreadable Claude home means "none found", never a failed build.
 */
export async function collectTranscriptIds(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Set<string>> {
  const ids = new Set<string>();
  const projectsDir = join(claudeConfigDir(env), "projects");

  let projectDirs;
  try {
    projectDirs = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    return ids;
  }

  for (const entry of projectDirs) {
    if (!entry.isDirectory()) continue;
    let files: string[];
    try {
      files = await readdir(join(projectsDir, entry.name));
    } catch {
      continue;
    }
    for (const file of files) {
      if (file.endsWith(".jsonl")) ids.add(file.slice(0, -".jsonl".length));
    }
  }
  return ids;
}
