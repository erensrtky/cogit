# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Drill-down side panel in the map: clicking a node or session shows title, kind, summary, why, timestamps and the owning session, with a "Copy resume command" button (`cd '<path>' && claude --resume <id>`, clipboard plus a `file://` fallback). `build` marks sessions whose Claude Code transcript no longer exists, disabling the button with "session no longer available".
- Nested lineage graph in the map: React Flow 12 renders epochs → sessions → nodes as collapsible groups, ELK lays them out top-down in the page, with a minimap, controls and kind colours; the latest session opens expanded. 495 nodes lay out in ~96–155 ms per change in Chromium from `file://`.
- Status card at the top of the map: goal, done, pending and next from the most recently updated session, with `needsUser` items merged from every session active within 7 days (deduplicated by text, newest first).
- Template workspace (`packages/template`): React 19 + Vite 8 + `vite-plugin-singlefile`, dev fixture and the shared lineage view-model contract (`packages/cli/src/view/model.ts`).
- `codelineage build [dir]`: renders `.codelineage/lineage.html` from `project.json` and `sessions/*.json` (epochs in project order, nested node tree, unassigned sessions grouped), skips unreadable session files with a warning, redacts secrets and embeds the single-file template into the CLI bundle; `session write` rebuilds quietly afterwards.

## [0.2.0] - 2026-10-21
### Added
- `codelineage` CLI skeleton (`--version`, `--help`), MIT license.
- `codelineage init`: creates `.codelineage/`, registers the project, asks for git policy, Claude Code transcript retention (`cleanupPeriodDays`, with backup) and summary language; `--yes` and per-question flags for non-interactive use.
- `codelineage config get/set` and `codelineage epoch add`.
- `codelineage session write`: validates agent JSON from stdin or `--file`, redacts secret-looking values, merges into the session file under a lock.

