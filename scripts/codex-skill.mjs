// Codex reads a plugin skill as plain text: it fills in no `${CLAUDE_…}` variable and runs no
// `!` line. Measured on Codex 0.167 (2026-11-12): its agent shell has CODEX_THREAD_ID but no
// PLUGIN_ROOT or CLAUDE_* variable, and the plugin lives at
// `$CODEX_HOME/plugins/cache/cogit/cogit/<version>`. So the build writes Codex's copy of the
// record skill from Claude Code's, with those turned into what a Codex shell has.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The cogit CLI in a Codex install of `version`, as a POSIX shell spells it. */
export function codexCli(version) {
  return `\${CODEX_HOME:-$HOME/.codex}/plugins/cache/cogit/cogit/${version}/dist/cli.js`;
}

/** Replaces `from` once or more in `text`; throws when it is not there, so a skill edit cannot slip by. */
function swap(text, from, to) {
  if (!text.includes(from)) throw new Error(`codex skill: "${from}" is no longer in SKILL.md`);
  return text.split(from).join(to);
}

/** Codex's record skill, from Claude Code's text. */
export function codexSkill(text, version) {
  const cli = codexCli(version);
  let out = text;
  // Claude Code's permission rule; Codex has none for skills.
  out = out.replace(/^allowed-tools:.*\n/m, () => "");
  if (out === text) throw new Error("codex skill: no allowed-tools line in SKILL.md");
  // Claude Code runs this before the model reads the skill; in Codex the model runs it.
  const show = /^!`(.+)`$/m.exec(out);
  if (show === null) throw new Error("codex skill: no `!` command line in SKILL.md");
  out = out.replace(
    show[0],
    () => `Run this first and read its output:\n\n\`\`\`sh\n${show[1]}\n\`\`\``,
  );
  out = swap(
    out,
    '`sessionId`: always `"${CLAUDE_SESSION_ID}"`.',
    "`sessionId`: always the record's `sessionId`.",
  );
  out = swap(
    out,
    "with the Write tool (no heredoc or `echo`)",
    "with your file editing tool (no heredoc or `echo`)",
  );
  out = swap(out, '"${CLAUDE_PLUGIN_ROOT}/dist/cli.js"', `"${cli}"`);
  out = swap(out, '"${CLAUDE_SESSION_ID}"', '"$CODEX_THREAD_ID"');
  out = swap(out, '-C "${CLAUDE_PROJECT_DIR}"', "-C .");
  out = swap(
    out,
    "# Record this session's lineage\n",
    "# Record this session's lineage\n\n" +
      `The cogit CLI is \`${cli}\`. On a shell without \`\${…:-…}\`: this file is ` +
      "`<plugin>/dist/codex-skills/record/SKILL.md` and the CLI is `<plugin>/dist/cli.js`. " +
      "Run the commands from the session's working directory.\n",
  );
  const left = /\$\{CLAUDE_[A-Z_]+\}/.exec(out);
  if (left !== null) throw new Error(`codex skill: ${left[0]} left in the text`);
  return out;
}

/** Writes `dist/codex-skills/record/SKILL.md` for the version in package.json. */
export function run(pkg = join(dirname(fileURLToPath(import.meta.url)), "../packages/cli")) {
  const { version } = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
  const source = readFileSync(join(pkg, "skills/record/SKILL.md"), "utf8");
  const target = join(pkg, "dist/codex-skills/record/SKILL.md");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, codexSkill(source, version));
  return target;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
