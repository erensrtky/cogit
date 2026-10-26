import { ensureCogitGitignore, ensureGitignore, findGitRoot, type GitPolicy } from "../git.js";
import { installGitHook } from "../git-hooks.js";
import { CliError, type Io } from "../io.js";
import { Config, type RegistryEntry } from "../schema/config.js";
import { refreshShareConversations } from "../share.js";
import { isDirectory } from "../store/fs.js";
import { resolveProjectRoot } from "../store/root.js";
import {
  loadConfig,
  loadProject,
  loadRegistry,
  updateConfig,
  updateRegistry,
} from "../store/stores.js";

export const CONFIG_KEYS = Object.keys(Config.shape).filter((k) => k !== "schema") as Exclude<
  keyof Config,
  "schema"
>[];

function assertKey(key: string): asserts key is (typeof CONFIG_KEYS)[number] {
  if (!(CONFIG_KEYS as string[]).includes(key)) {
    throw new CliError(`unknown key "${key}"; one of: ${CONFIG_KEYS.join(", ")}`);
  }
}

/** Command-line text to a value: JSON when it parses, comma lists for arrays, else a string. */
function parseValue(key: string, raw: string): unknown {
  if (key === "agents" && !raw.trim().startsWith("[")) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function configGet(key: string | undefined, io: Io): Promise<void> {
  const config = await loadConfig(io.env);
  if (key === undefined) {
    for (const k of CONFIG_KEYS) io.out(`${k} = ${JSON.stringify(config[k])}`);
    return;
  }
  assertKey(key);
  io.out(JSON.stringify(config[key]));
}

export async function configSet(key: string, raw: string, io: Io): Promise<void> {
  assertKey(key);
  const value = parseValue(key, raw);
  const next = Config.safeParse({ ...(await loadConfig(io.env)), [key]: value });
  if (!next.success) {
    throw new CliError(`invalid value for ${key}: ${next.error.issues[0]?.message ?? "rejected"}`);
  }
  await updateConfig((c) => ({ ...c, [key]: next.data[key] }), io.env);
  // Sharing the raw chat changes the project ignore files, not just the config.
  if (key === "shareConversations")
    await refreshShareConversations(io.env, next.data.shareConversations);
  io.out(`${key} = ${JSON.stringify(next.data[key])}`);
}

/**
 * `cogit config git commit|ignore` (Story 9.3): switches an existing project.
 * Both ignore files are edited; no record file is ever deleted, so switching to
 * `ignore` leaves what git already tracks alone.
 */
export async function configGit(dir: string, policy: GitPolicy, io: Io): Promise<void> {
  const { root } = await resolveProjectRoot(dir);
  const project = await loadProject(root);
  if (!project.found) throw new CliError(`${root} is not initialized; run \`cogit init\` first`);
  if (!project.ok) throw new CliError(project.error);
  if ((await findGitRoot(root)) === undefined)
    throw new CliError(`${root} is not in a git repository`);

  const added = await ensureGitignore(root, policy);
  const config = await loadConfig(io.env);
  await ensureCogitGitignore(root, policy, config.shareConversations);
  if (policy === "commit") await installGitHook(root, "pre-commit");
  io.out(`Git policy for ${project.data.name}: ${policy}`);
  if (added.length > 0) io.out(`Added to .gitignore: ${added.join(", ")}`);
}

/**
 * Stops the SessionStart setup hint in a project ("don't ask again"). The list is
 * keyed by the main checkout's root, so a linked worktree is silenced with it.
 */
export async function configHintOff(dir: string, io: Io): Promise<void> {
  const { root } = await resolveProjectRoot(dir);
  let added = false;
  await updateConfig((c) => {
    if (c.setupHintOff.includes(root)) return c;
    added = true;
    return { ...c, setupHintOff: [...c.setupHintOff, root] };
  }, io.env);
  io.out(added ? `Setup hint off in ${root}` : `Setup hint was already off in ${root}`);
}

/** Turns the setup hint back on for one project, or for every project with `--all`. */
export async function configHintOn(dir: string, opts: { all?: boolean }, io: Io): Promise<void> {
  if (opts.all === true) {
    await updateConfig((c) => ({ ...c, setupHintOff: [] }), io.env);
    io.out("Setup hint on in every project");
    return;
  }
  const { root } = await resolveProjectRoot(dir);
  let removed = false;
  await updateConfig((c) => {
    if (!c.setupHintOff.includes(root)) return c;
    removed = true;
    return { ...c, setupHintOff: c.setupHintOff.filter((path) => path !== root) };
  }, io.env);
  io.out(removed ? `Setup hint on in ${root}` : `Setup hint was not off in ${root}`);
}

export interface PruneOptions {
  /** Lists the entries but leaves `projects.json` untouched. */
  dryRun?: boolean;
}

/**
 * Drops registry entries whose directory is gone. A corrupt registry is an error
 * rather than an empty list, so a typo never wipes every project.
 */
export async function configPrune(opts: PruneOptions, io: Io): Promise<void> {
  const loaded = await loadRegistry(io.env);
  if (loaded.found && !loaded.ok) throw new CliError(`registry: ${loaded.error}`);
  const entries = loaded.found && loaded.ok ? loaded.data.projects : [];

  const missing: RegistryEntry[] = [];
  for (const entry of entries) {
    if (!(await isDirectory(entry.path))) missing.push(entry);
  }

  if (missing.length === 0) {
    io.out("No missing projects");
    return;
  }
  for (const entry of missing) {
    io.out(`${opts.dryRun === true ? "Would remove" : "Removed"} ${entry.name} (${entry.path})`);
  }
  if (opts.dryRun === true) return;
  await updateRegistry(
    (r) => ({ ...r, projects: r.projects.filter((p) => !missing.some((m) => m.path === p.path)) }),
    io.env,
  );
}
