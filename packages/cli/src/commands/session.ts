import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CliError, type Io } from "../io.js";
import { redactDeep } from "../redact.js";
import { mergeSession } from "../schema/merge.js";
import { SessionInput } from "../schema/session.js";
import { loadProject, updateSession } from "../store/stores.js";
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
  const root = resolve(opts.dir);
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
    return merged.session;
  });
  for (const w of warnings) io.warn(w);
  io.out(`Saved session ${saved.sessionId} (${saved.nodes.length} nodes)`);

  // Keep the map fresh without making a failed render fail the write.
  try {
    await buildProject({ dir: root, io, quiet: true });
  } catch (err) {
    io.warn(`could not build lineage.html: ${(err as Error).message}`);
  }
}
