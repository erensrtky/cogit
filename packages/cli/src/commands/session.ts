import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { CliError, type Io } from "../io.js";
import { redactDeep } from "../redact.js";
import { Slug } from "../schema/common.js";
import { mergeSession } from "../schema/merge.js";
import { SessionInput } from "../schema/session.js";
import { projectPaths } from "../store/paths.js";
import { resolveProjectRoot } from "../store/root.js";
import { loadConfig, loadProject, loadSession, updateSession } from "../store/stores.js";
import { buildProject } from "./build.js";

export async function readStdin(stream: NodeJS.ReadableStream = process.stdin): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString("utf8");
}

export interface SessionWriteOptions {
  dir: string;
  /** Read JSON from this file instead of stdin. */
  file?: string;
  /** Delete `file` once the record is saved; a failed write keeps it for a retry. */
  consume?: boolean;
}

/**
 * Validates agent JSON, redacts secrets and merges it into the session file under
 * the session lock.
 */
export async function sessionWrite(
  opts: SessionWriteOptions,
  io: Io,
  stdin: () => Promise<string> = readStdin,
): Promise<void> {
  const { root, worktree } = await resolveProjectRoot(opts.dir);
  const project = await loadProject(root);
  if (!project.found)
    throw new CliError(`${root} is not initialized; run \`codelineage init\` first`);
  if (!project.ok) throw new CliError(project.error);

  const text = opts.file ? await readFile(opts.file, "utf8") : await stdin();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new CliError(`input is not valid JSON: ${(err as Error).message}`);
  }
  const parsed = SessionInput.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new CliError(`input does not match the session schema: ${issues.join("; ")}`);
  }

  const { value: input, count } = redactDeep(parsed.data);
  if (count > 0) io.warn(`redacted ${count} secret-looking value(s)`);
  if (input.epoch && !project.data.epochs.some((e) => e.id === input.epoch)) {
    io.warn(
      `epoch "${input.epoch}" is not in project.json; the session shows as unassigned until you run \`codelineage epoch add ${input.epoch} <title>\``,
    );
  }

  let warnings: string[] = [];
  const saved = await updateSession(root, input.sessionId, (cur) => {
    const merged = mergeSession(cur, input, io.now());
    warnings = merged.warnings;
    // A write from the main checkout (e.g. after a resume) keeps the stored worktree.
    return worktree ? { ...merged.session, worktree } : merged.session;
  });
  for (const w of warnings) io.warn(w);
  if (opts.file && opts.consume) await rm(opts.file, { force: true });
  io.out(`Saved session ${saved.sessionId} (${saved.nodes.length} nodes)`);

  // Keep the map fresh without making a failed render fail the write.
  try {
    await buildProject({ dir: root, io, quiet: true });
  } catch (err) {
    io.warn(`could not build lineage.html: ${(err as Error).message}`);
  }
}

/**
 * What the skill injects before the agent updates its record: the project's
 * epochs, the summary language and a compact view of this session (node ids,
 * parents, kinds and titles, without summaries, which merging keeps anyway).
 * Always exits 0 for an uninitialized project or an unreadable record, because a
 * failing injected command aborts the whole skill; the JSON says what is wrong.
 *
 * `dir` is the directory the agent passes back to later commands; in a linked
 * worktree that is the worktree, so writes still learn which worktree they came
 * from, while `store` names the main checkout that holds the record. The inbox
 * stays under `dir`, where the skill's edit permission points.
 */
export async function sessionShow(dir: string, sessionId: string, io: Io): Promise<void> {
  if (!Slug.safeParse(sessionId).success) throw new CliError(`invalid session id: ${sessionId}`);
  const given = resolve(dir);
  const { root } = await resolveProjectRoot(given);
  const store = root === given ? {} : { store: root };
  const project = await loadProject(root);
  if (!project.found || !project.ok) {
    const error = project.found && !project.ok ? project.error : undefined;
    io.out(
      JSON.stringify({ initialized: false, dir: given, ...store, ...(error ? { error } : {}) }),
    );
    return;
  }

  const config = await loadConfig(io.env);
  const loaded = await loadSession(root, sessionId);
  const view: Record<string, unknown> = {
    initialized: true,
    dir: given,
    ...store,
    project: project.data.name,
    language: config.language,
    epochs: project.data.epochs.map(({ id, title }) => ({ id, title })),
    session: null,
  };
  if (loaded.found && loaded.ok) {
    const { title, epoch, status, nodes } = loaded.data;
    view.session = {
      sessionId,
      title,
      epoch,
      status,
      nodes: nodes.map(({ id, parent, kind, title }) => ({ id, parent, kind, title })),
    };
  } else if (loaded.found) {
    view.sessionError = loaded.error;
  }
  view.inbox = projectPaths(given).inbox(sessionId);
  io.out(JSON.stringify(view, null, 2));
}
