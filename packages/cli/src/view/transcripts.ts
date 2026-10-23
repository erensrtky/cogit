import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** Where Claude Code keeps its state: `$CLAUDE_CONFIG_DIR` or `~/.claude`. */
export function claudeConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
}

/**
 * Every transcript under `projects/<encoded>/*.jsonl`, by session id.
 * Best effort: an unreadable Claude home means "none found", never a failed build.
 */
export async function collectTranscripts(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const projectsDir = join(claudeConfigDir(env), "projects");

  let projectDirs;
  try {
    projectDirs = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of projectDirs) {
    if (!entry.isDirectory()) continue;
    const dir = join(projectsDir, entry.name);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (file.endsWith(".jsonl")) found.set(file.slice(0, -".jsonl".length), join(dir, file));
    }
  }
  return found;
}

/** Session ids that still have a transcript. */
export async function collectTranscriptIds(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Set<string>> {
  return new Set((await collectTranscripts(env)).keys());
}
