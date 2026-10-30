import { findGitRoot, readCommitChanges, readCommitPatches, readCommitSubjects } from "../git.js";
import { CliError, type Io } from "../io.js";
import type { Config } from "../schema/config.js";
import type { LineageNode } from "../schema/session.js";
import { readSessionHead } from "../session-git.js";
import {
  parseShapeAnswer,
  SHAPE_DIFF_LIMIT,
  type ShapeCommitInfo,
  shapePrompt,
  shapeWanted,
} from "../shape.js";
import { LockBusyError, withLock } from "../store/lock.js";
import { projectPaths } from "../store/paths.js";
import { resolveProjectRoot } from "../store/root.js";
import { loadConfig, loadProject, loadSession } from "../store/stores.js";
import { resultText, runClaude } from "./backfill.js";
import { sessionWrite } from "./session.js";

/**
 * `cogit shape <session-id>` (Story 13.6): the side half of Shapes. The git
 * post-commit hook starts this detached, behind the session's shape lock, so a
 * commit is never held up. It writes one Shape for the newest recorded message
 * that landed commits and does not have one yet (or has landed more since).
 *
 * The main agent writes its Shape in the record skill; this command is the
 * mixed/side recorder's path, so it is a no-op in `agent` mode.
 */

/** A message earns a Shape only when its commits survive the skip rules. */
export function needsShape(node: LineageNode): boolean {
  if (node.kind !== "message" || node.commits === undefined || node.commits.length === 0)
    return false;
  if (node.shape === undefined) return true;
  // A message that landed more commits after its Shape was written gets a new
  // one, so the Shape covers everything the message landed.
  return node.shape.commits.length < node.commits.length;
}

/** The newest message waiting for a Shape, by its own time then its position. */
export function nextShapeNode(nodes: readonly LineageNode[]): LineageNode | undefined {
  let best: LineageNode | undefined;
  let bestAt = Number.NEGATIVE_INFINITY;
  nodes.forEach((node, index) => {
    if (!needsShape(node)) return;
    const parsed = Date.parse(node.at ?? node.addedAt ?? "");
    const at = Number.isNaN(parsed) ? index : parsed;
    if (best === undefined || at >= bestAt) {
      best = node;
      bestAt = at;
    }
  });
  return best;
}

export async function shapeMessage(
  dir: string,
  sessionId: string | undefined,
  io: Io,
): Promise<void> {
  const { root } = await resolveProjectRoot(dir);
  const project = await loadProject(root);
  if (!project.found) throw new CliError(`${root} is not initialized; run \`cogit init\` first`);
  if (!project.ok) throw new CliError(project.error);

  const config = await loadConfig(io.env);
  if (!config.shapes) {
    io.out("shapes are off");
    return;
  }
  // The main agent writes its own Shape in the record skill; this pass is for
  // the side model's modes.
  if (config.recorder === "agent") return;

  const id = sessionId ?? (await readSessionHead(root))?.sessionId;
  if (id === undefined) {
    io.out("no session to shape");
    return;
  }
  try {
    await withLock(projectPaths(root).lock(`shape-${id}`), () => runShape(root, id, config, io), {
      timeoutMs: 0,
    });
  } catch (err) {
    if (!(err instanceof LockBusyError)) throw err;
    io.out(`a shape for ${id} is already being written`);
  }
}

async function runShape(root: string, sessionId: string, config: Config, io: Io): Promise<void> {
  const loaded = await loadSession(root, sessionId);
  if (!loaded.found || !loaded.ok) return;
  const node = nextShapeNode(loaded.data.nodes);
  if (node === undefined || node.commits === undefined) return;

  const gitRoot = await findGitRoot(root);
  if (gitRoot === undefined) return;
  const [changes, subjects] = await Promise.all([
    readCommitChanges(gitRoot, node.commits),
    readCommitSubjects(gitRoot, node.commits),
  ]);
  const commits: ShapeCommitInfo[] = node.commits.flatMap((hash) => {
    const change = changes.get(hash);
    if (change === undefined) return [];
    return [
      {
        hash: change.full,
        subject: subjects.get(hash),
        added: change.added,
        removed: change.removed,
        files: change.files,
      },
    ];
  });
  if (commits.length === 0) return;
  const verdict = shapeWanted(commits);
  if (!verdict.wanted) {
    io.out(`no shape for ${node.id}: ${verdict.reason}`);
    return;
  }

  const patches = await readCommitPatches(gitRoot, node.commits, SHAPE_DIFF_LIMIT);
  const prompt = shapePrompt({
    node,
    commits,
    diff: patches.diff,
    diffTruncated: patches.truncated,
    language: config.language,
  });
  const stdout = await runClaude(prompt, config.sideModel, io.env);
  const answer = parseShapeAnswer(resultText(stdout)) ?? { tools: [], commits: [] };
  const payload = {
    sessionId,
    nodes: [
      {
        id: node.id,
        kind: "message",
        title: node.title,
        shape: { tools: answer.tools, commits: node.commits },
      },
    ],
  };
  await sessionWrite({ dir: root, by: "side" }, io, async () => JSON.stringify(payload));
}
