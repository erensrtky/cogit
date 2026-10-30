import {
  findGitRoot,
  readCommitChanges,
  readCommitPatches,
  readCommitSubjects,
  resolveCommit,
} from "../git.js";
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
import { dequeueShape, enqueueShape } from "../shape-queue.js";
import { LockBusyError, withLock } from "../store/lock.js";
import { projectPaths } from "../store/paths.js";
import { resolveProjectRoot } from "../store/root.js";
import { loadAllSessions, loadConfig, loadProject, loadSession } from "../store/stores.js";
import { attachThoughtTrailers, readCommitThought, readThoughtTrailers } from "../thought.js";
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

/** Messages waiting for a Shape, newest first (by their own time, then position). */
export function shapeCandidates(nodes: readonly LineageNode[]): LineageNode[] {
  return nodes
    .map((node, index) => {
      const parsed = Date.parse(node.at ?? node.addedAt ?? "");
      return { node, index, at: Number.isNaN(parsed) ? index : parsed };
    })
    .filter(({ node }) => needsShape(node))
    .sort((a, b) => b.at - a.at || b.index - a.index)
    .map(({ node }) => node);
}

/** The newest message waiting for a Shape. */
export function nextShapeNode(nodes: readonly LineageNode[]): LineageNode | undefined {
  return shapeCandidates(nodes)[0];
}

export interface ShapeOptions {
  /** Shape the message this commit's `Thought:` trailer names (the post-commit path). */
  commit?: string | undefined;
}

export async function shapeMessage(
  dir: string,
  sessionId: string | undefined,
  io: Io,
  opts: ShapeOptions = {},
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

  if (opts.commit !== undefined) {
    await shapeCommit(root, opts.commit, config, io);
    return;
  }
  const id = sessionId ?? (await readSessionHead(root))?.sessionId;
  if (id === undefined) {
    io.out("no session to shape");
    return;
  }
  await underLock(root, id, io, () => runShape(root, id, config, io));
}

async function underLock(
  root: string,
  sessionId: string,
  io: Io,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await withLock(projectPaths(root).lock(`shape-${sessionId}`), fn, { timeoutMs: 0 });
  } catch (err) {
    if (!(err instanceof LockBusyError)) throw err;
    io.out(`a shape for ${sessionId} is already being written`);
  }
}

/**
 * The post-commit path: the commit's `Thought:` trailer names the message, so
 * the Shape lands on the message that made the commit, whichever session last
 * wrote `.cogit/HEAD`. A message with no record yet is queued; the `session
 * write` that adds it starts this again.
 */
async function shapeCommit(root: string, ref: string, config: Config, io: Io): Promise<void> {
  const gitRoot = await findGitRoot(root);
  if (gitRoot === undefined) return;
  const commit = await resolveCommit(gitRoot, ref);
  if (commit === undefined) {
    io.out(`no commit ${ref}`);
    return;
  }
  const thought = await readCommitThought(root, commit, io.env);
  if (thought === undefined) {
    io.out(`no shape for ${commit.slice(0, 7)}: no Thought trailer`);
    return;
  }
  const sessions = await loadAllSessions(root, () => {});
  const session = sessions.find((s) =>
    s.nodes.some((n) => n.kind === "message" && n.id === thought),
  );
  if (session === undefined) {
    await enqueueShape(root, commit, thought);
    io.out(`queued ${commit.slice(0, 7)} until ${thought} is recorded`);
    return;
  }
  await dequeueShape(root, commit);
  await underLock(root, session.sessionId, io, async () => {
    const fresh = await loadSession(root, session.sessionId);
    if (!fresh.found || !fresh.ok) return;
    const [withTrailers] = attachThoughtTrailers(
      [fresh.data],
      await readThoughtTrailers(root, { env: io.env, since: fresh.data.startedAt }),
    );
    const node = withTrailers?.nodes.find((n) => n.id === thought);
    if (node === undefined || !needsShape(node)) return;
    await shapeNode(root, gitRoot, session.sessionId, node, config, io);
  });
}

/**
 * The manual path: the newest message that wants a Shape. A message the skip
 * rules turn down (a release commit, a two-line fix) is passed over, so it
 * never holds back the older ones behind it.
 */
async function runShape(root: string, sessionId: string, config: Config, io: Io): Promise<void> {
  const loaded = await loadSession(root, sessionId);
  if (!loaded.found || !loaded.ok) return;
  const gitRoot = await findGitRoot(root);
  if (gitRoot === undefined) return;
  // The trailers link commits the record has not listed yet.
  const [session] = attachThoughtTrailers(
    [loaded.data],
    await readThoughtTrailers(root, { env: io.env, since: loaded.data.startedAt }),
  );
  for (const node of shapeCandidates(session?.nodes ?? [])) {
    if (await shapeNode(root, gitRoot, sessionId, node, config, io)) return;
  }
}

/** Writes one message's Shape; false when the skip rules turned it down. */
async function shapeNode(
  root: string,
  gitRoot: string,
  sessionId: string,
  node: LineageNode,
  config: Config,
  io: Io,
): Promise<boolean> {
  const hashes = node.commits ?? [];
  const [changes, subjects] = await Promise.all([
    readCommitChanges(gitRoot, hashes),
    readCommitSubjects(gitRoot, hashes),
  ]);
  const commits: ShapeCommitInfo[] = hashes.flatMap((hash) => {
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
  const verdict = shapeWanted(commits);
  if (!verdict.wanted) {
    io.out(`no shape for ${node.id}: ${verdict.reason}`);
    return false;
  }

  const patches = await readCommitPatches(gitRoot, hashes, SHAPE_DIFF_LIMIT);
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
        // The trailer-linked commits count too, so the message stops waiting
        // once its Shape covers them.
        shape: { tools: answer.tools, commits: hashes.slice(-20) },
      },
    ],
  };
  await sessionWrite({ dir: root, by: "side" }, io, async () => JSON.stringify(payload));
  return true;
}
