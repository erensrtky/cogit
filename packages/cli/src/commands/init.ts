import { mkdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  allowSkill,
  CLAUDE_DEFAULT_RETENTION,
  readRetention,
  readSkillAllowed,
  SKILL_RULE,
  setRetention,
} from "../claude-settings.js";
import { ensureGitignore, findGitRoot, type GitPolicy } from "../git.js";
import { CliError, type Io } from "../io.js";
import { readJson } from "../store/fs.js";
import { globalPaths, projectPaths } from "../store/paths.js";
import {
  loadConfig,
  loadProject,
  updateConfig,
  updateProject,
  updateRegistry,
} from "../store/stores.js";

export interface InitOptions {
  name?: string;
  git?: GitPolicy;
  language?: string;
  /** Days, or "keep" to leave Claude Code's setting alone. */
  retention?: number | "keep";
  /** Allow the lineage skill in Claude Code's user settings; undefined asks. */
  allowSkill?: boolean;
}

/** Below this, init offers to raise Claude Code's transcript retention. */
const RETENTION_FLOOR = 90;

async function bestEffort(io: Io, what: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (err) {
    io.warn(`${what}: ${(err as Error).message}`);
    return false;
  }
}

async function askRetention(io: Io, opts: InitOptions): Promise<void> {
  const current = await readRetention(io.env);
  if (current === undefined) {
    io.warn("could not read Claude Code settings; transcript retention left unchanged");
    return;
  }
  let choice = opts.retention;
  if (choice === undefined) {
    if (current >= RETENTION_FLOOR) {
      io.out(`Claude Code keeps transcripts for ${current} days.`);
      return;
    }
    const picked = await io.prompt.select(
      `Claude Code deletes transcripts after ${current} days${current === CLAUDE_DEFAULT_RETENTION ? " (its default)" : ""}. ` +
        "Older sessions can then no longer be resumed or backfilled. Keep them longer?",
      [
        { value: "keep", name: `Keep ${current} days` },
        { value: "90", name: "90 days" },
        { value: "365", name: "1 year" },
        { value: "3650", name: "10 years" },
      ],
      "keep",
    );
    choice = picked === "keep" ? "keep" : Number(picked);
  }
  if (choice === "keep" || choice === current) return;
  const { file, backup } = await setRetention(choice, io.env, io.now());
  io.out(`Set cleanupPeriodDays to ${choice} in ${file}${backup ? ` (backup: ${backup})` : ""}.`);
}

async function askSkillPermission(io: Io, opts: InitOptions): Promise<void> {
  const allowed = await readSkillAllowed(io.env);
  if (allowed === undefined) {
    io.warn(
      `could not read Claude Code permissions; add ${SKILL_RULE} to permissions.allow yourself`,
    );
    return;
  }
  if (allowed) return;
  const allow =
    opts.allowSkill ??
    (await io.prompt.confirm(
      "Let the agent update the lineage record without asking each time? " +
        `(adds ${SKILL_RULE} to your Claude Code permissions)`,
      true,
    ));
  if (!allow) {
    io.out(`Claude Code will ask before each lineage update; allow ${SKILL_RULE} to stop that.`);
    return;
  }
  const { file, backup } = await allowSkill(io.env, io.now());
  io.out(`Allowed ${SKILL_RULE} in ${file}${backup ? ` (backup: ${backup})` : ""}.`);
}

async function askLanguage(io: Io, opts: InitOptions): Promise<void> {
  const firstRun = !(await readJson(globalPaths(io.env).config)).found;
  if (!firstRun && opts.language === undefined) return;
  let language = opts.language;
  if (language === undefined) {
    const mode = await io.prompt.select(
      "Language for session summaries?",
      [
        { value: "auto", name: "Same as the conversation (auto)" },
        { value: "fixed", name: "Always one language" },
      ],
      "auto",
    );
    language = mode === "auto" ? "auto" : await io.prompt.input("Which language?", "English");
  }
  const lang = language;
  await bestEffort(io, "could not save global config", () =>
    updateConfig((c) => ({ ...c, language: lang }), io.env),
  );
}

export async function register(io: Io, root: string, name: string): Promise<void> {
  await bestEffort(io, "could not register the project in the global panel", () =>
    updateRegistry(
      (r) =>
        r.projects.some((p) => p.path === root)
          ? r
          : { ...r, projects: [...r.projects, { path: root, name, addedAt: io.now() }] },
      io.env,
    ),
  );
}

export async function init(dir: string, opts: InitOptions, io: Io): Promise<void> {
  const root = resolve(dir);
  const existing = await loadProject(root);
  if (existing.found) {
    if (!existing.ok) throw new CliError(`${projectPaths(root).project}: ${existing.error}`);
    await register(io, root, existing.data.name);
    if (opts.allowSkill !== undefined) await askSkillPermission(io, opts);
    io.out(`Already initialized: ${existing.data.name} (${root})`);
    return;
  }

  const name = opts.name ?? (await io.prompt.input("Project name?", basename(root)));

  const gitRoot = await findGitRoot(root);
  if (gitRoot) {
    const fallback = (await loadConfig(io.env)).gitPolicy;
    const policy =
      opts.git ??
      (await io.prompt.select<GitPolicy>(
        "This is a git repository. Commit the lineage records?",
        [
          { value: "ignore", name: "No, keep .codelineage/ out of git (private)" },
          { value: "commit", name: "Yes, commit session records (local state stays ignored)" },
        ],
        fallback,
      ));
    const added = await ensureGitignore(root, policy);
    if (added.length > 0) io.out(`Added to .gitignore: ${added.join(", ")}`);
  }

  await askRetention(io, opts);
  await askSkillPermission(io, opts);
  await askLanguage(io, opts);

  await updateProject(root, (cur) => cur ?? { schema: 1, name, epochs: [] });
  await mkdir(projectPaths(root).sessions, { recursive: true });
  await register(io, root, name);

  io.out(`Initialized ${name} in ${projectPaths(root).base}`);
  io.out("Next: install the Claude Code plugin, then run `codelineage open` after a session.");
}
