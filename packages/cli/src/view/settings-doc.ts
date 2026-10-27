import { Config } from "../schema/config.js";
import { CLI_ONLY, panelSettingFields } from "./settings.js";

/** How a default reads in the guide. */
function formatDefault(value: unknown): string {
  return `\`${Array.isArray(value) ? value.join(", ") : String(value)}\``;
}

/**
 * `docs/guide/settings.md`, generated from the same texts as the panel's "?" and
 * `cogit config --help`, with the defaults from the config schema. A test keeps
 * the committed file equal to this, so the guide cannot drift from the code.
 */
export function settingsMarkdown(): string {
  const defaults = Config.parse({ schema: 1 }) as Record<string, unknown>;
  const section = (rows: { key: string; label: string; help: string; details: string }[]) =>
    rows.flatMap((row) => [
      `### ${row.label}`,
      "",
      `\`${row.key}\` · default ${formatDefault(defaults[row.key])}`,
      "",
      `**${row.help}**`,
      "",
      row.details,
      "",
    ]);
  return [
    "<!-- Generated from packages/cli/src/view/settings.ts; edit the texts there. -->",
    "",
    "# Settings",
    "",
    "Settings are global: one file for every project on this machine",
    "(`~/.config/cogit/config.json`). Change them under **Settings** in the map or the panel,",
    "or with `cogit config set <key> <value>`; `cogit config get` lists them all.",
    "",
    "## In the panel",
    "",
    ...section([...panelSettingFields()]),
    "## Only through `cogit config`",
    "",
    "These are set up once, per project, or rarely touched, so the panel leaves them out.",
    "",
    ...section(CLI_ONLY),
  ].join("\n");
}
