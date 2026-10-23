# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Live map: the `Stop` hook rebuilds `lineage.html` after every turn, detached like the SessionEnd catch-up and skipped while a build or the session's write holds its lock (a new `build` lock in `build`, `codelineage build --quiet` for the child). The build draws the user messages the record does not hold yet as cards titled with their first words, marked "not summarized yet" and sitting in a "New" topic at the end of the session, so the newest message is on the map before the agent summarizes it; "left off here" marks the newest of them and their drill-down shows the conversation from the transcript.

## [0.5.0] - 2026-10-23
### Added
- SessionEnd catch-up: when a session ends with user messages that have no node yet, the `SessionEnd` hook starts a detached `codelineage backfill <session-id> --tail` and returns at once; the child reads those messages with the agent's replies, runs `claude -p --safe-mode --no-session-persistence` with the skill's record rules on `catchUpModel` (default `haiku`) and passes the answer through `session write` (validation, redaction, transcript times, rebuild). The tail is not stored, so a dead child is retried from the transcript next time. With `sessionEndCatchUp` off no tokens are spent, and the map shows "N messages not recorded" on that session.
- SessionStart setup hint: on `startup` or `resume` in a project without `.codelineage/`, the plugin offers setup to the agent (it says codelineage is not set up and sets it up only when the user asks, running the bundled `init` with the answers), and the hint notes that a plugin update reaches a running session only after `/reload-plugins` or a new chat. `codelineage config hint-off [dir]` silences the hint in that project ("don't ask again", kept in the global `setupHintOff` list, keyed by the main checkout so a worktree is covered) and `codelineage config hint-on [dir] [--all]` turns it back on. `CODELINEAGE_DISABLE=1` still silences every hook.
- Compaction safety net: SessionStart with `source: "compact"` reads the transcript and, when user messages have no lineage node yet, asks the agent through `additionalContext` to run `/codelineage:lineage` (compaction keeps every transcript line, so nothing is lost and no snapshot is taken). `session show` also adds a `transcriptWarning` when the transcript has user lines but none reads as a message, so a Claude Code format change is noticed instead of silently recording nothing.
- The map shows the conversation: a message's drill-down has the message as the user wrote it and the agent's written replies (tool output left out, tool use counted in one line), with buttons to step to the previous or next message across topics. `build` reads it from the Claude Code transcript into `lineage.html` only, which is never committed; session files still hold no raw text. Long entries open folded; a deleted transcript is said so.
- The map is the user's messages: each message the user wrote becomes one node (`kind: "message"`, ids `m1`, `m2`, … in transcript order), titled in the user's words with what came of it, grouped under topics and ordered by when it was sent. `session show` reads the session's Claude Code transcript and lists the messages that have no node yet, and `session write` takes their times from it. The agent's own work moves into the node's detail (`work`, `agentDecisions` with reasons and rejected options, `commits`, `files`), "left off here" marks only the last message, and the `/codelineage:lineage` skill is rewritten for this. Older records keep their step, decision and question nodes.
- Git worktree support: a Claude Code session in a linked worktree (`claude -w`) now records into the main checkout's `.codelineage/` when it is git-ignored (a worktree with its own committed copy keeps it), found by reading `.git` files without running git. Hooks, `session write/show`, `epoch add`, `build` and `open` all resolve it; the session keeps the worktree path and branch, and the map's drill-down shows them.
- Decision detail in the record and the map: nodes take `decidedBy` (`user`, `agent` or `agreed`), `alternatives` (options considered and rejected, with the reason), `commits` and `files`; decision cards show their reason and a short line such as "agreed · 1 commit · 2 options rejected", and the drill-down panel lists the rejected options, the commits and files, who decided, and when the node was recorded and last changed. The `/codelineage:lineage` skill asks the agent to fill them in.
- Map shows where the work left off: `session write` now stamps each node it adds or changes (`touchedAt`, set by the CLI and never taken from agent input), and the map opens the branches down to the nodes the last write of the latest session added or changed, marks each "left off here" and frames that session.
- Claude Code plugin skeleton: the `codelineage` npm package is also the plugin (`.claude-plugin/plugin.json`, bundled `dist/cli.js`), and the repository root carries a `codelineage` marketplace that installs it from npm.

- `/codelineage:lineage` skill: injects this session's compact record and the project's epochs, asks the agent for only what is new or changed, and has it save the JSON with the Write tool and run `session write --file … --consume` (JSON piped through a shell heredoc is blocked by Claude Code's command checks). It is pre-approved for exactly those two actions and answers "up to date" when nothing changed.
- `codelineage session show <id> [-C dir]`: prints the compact record the skill updates (epochs, summary language, title, epoch, status and node ids/parents/kinds/titles, plus the inbox path) as JSON, and reports an uninitialized project or an unreadable record in that JSON instead of failing.
- Stop hook (`hooks/hooks.json`, `codelineage hook stop`): counts completed turns per session in `.codelineage/state/<id>.json` and, every `updateEveryTurns` turns since the record last changed, asks the agent to run `/codelineage:lineage` through `additionalContext` ("Stop hook feedback", not an error). Turns a stop hook continued are not counted; before `init`, with `CODELINEAGE_DISABLE=1`, on a busy lock or on any error it does nothing, and an unreadable state file is replaced.
- `codelineage init` asks whether the agent may run the lineage skill without a prompt each time and, if so, adds `Skill(codelineage:lineage)` to `permissions.allow` in Claude Code's user settings (backed up first, skipped when already there); `--allow-skill` / `--no-allow-skill` answer it, `--yes` alone never adds it, and `--allow-skill` also works on an already initialized project. Without the rule, Claude Code asks before every automatic update.
- `codelineage session write --consume`: deletes the `--file` input once the record is saved and keeps it when the write fails. `gitPolicy=commit` now also ignores `.codelineage/inbox/`.

### Changed
- Map orders topics left to right, and items top to bottom, by when their thread began: `session write` stamps each new node with `addedAt` (set by the CLI, never by the agent), and a topic starts at its earliest item, so renaming or moving topics no longer scrambles the order. Nodes recorded before the stamp keep their stored order, first.
- Map cards size themselves to their text: titles and summaries wrap onto as many lines as they need instead of being cut off with "…", and the cards below move down to make room.
- Map opens like layers of an onion: sessions run down the page in time order, and inside the latest session only its top-level topics show, side by side as columns with an "N items inside" count; an opened topic lists its items down its column, nested ones indented, and any node with children expands and collapses on click (selecting a nested item in the outline opens every layer above it). Phases are labelled "topic", and collapsed session boxes are wide enough for their titles.
- `/codelineage:lineage` skill: organizes nodes by topic instead of by time (topics and sub-topics at any depth, time order kept inside each), reuses existing topics and moves misplaced nodes by resending them with the right `parent`.
- The npm package and the plugin manifest now take their version from `VERSION` (the one `./release` bumps): `npm run build` and `npm pack` copy it through `scripts/sync-version.mjs`, and a test fails while they differ. Both move from 0.1.0 to 0.4.0, so the first release continues at 0.5.0.
- Map: the graph now spans the full window width and nearly its full height (the header and status card stay at a readable width), and a "Full screen" button expands it over the whole window, entering browser full screen when allowed; Esc or the button closes it.
- `commander`, `zod` and `@inquirer/prompts` moved to `devDependencies`: they are bundled into `dist/cli.js`, so installing the package pulls in no runtime dependencies.

### Fixed
- Map: opening or closing a session or topic no longer zooms the whole map out to fit; the zoom stays and the clicked box keeps its place on screen. The mouse wheel now scrolls the map; Ctrl+wheel or a pinch zooms.
- Status card: goal, done, pending and next now come from the most recently updated session that recorded a status, so a newer session without one no longer blanks the card; last activity still tracks the newest session.
- `codelineage build` printed each skipped-session warning twice (once for the map, once for the panel); the panel now stays quiet about the project just built.
- Collapsed session headers in the map show a short date (full time on hover), so the session title is no longer cut off after a few characters.

## [0.4.0] - 2026-10-21
### Added
- `codelineage config prune [--dry-run]`: removes registry entries whose project directory no longer exists, lists every removed entry and leaves the registry untouched with `--dry-run` (a corrupt registry is refused, never treated as empty).
- Global panel: `codelineage build` also refreshes `~/.config/codelineage/panel.html` (honouring `CODELINEAGE_HOME` / `XDG_CONFIG_HOME`) with one card per registered project — last activity, pending `needsUser` count, a `file://` link to its map, a "missing" mark when the directory is gone and read-only settings from `config.json`; `codelineage open` without a directory builds and opens it.

## [0.3.0] - 2026-10-21
### Added
- `codelineage open [dir]`: rebuilds the map and hands `lineage.html` to the OS opener (`xdg-open`, `open` or `start`), printing the path when no opener is found; without a directory it explains that the global panel arrives with Epic 3.
- Experimental outline side view in the map: a collapsible epoch → session → node tree behind a "Show outline" toggle (off by default); selecting a row expands the graph groups it needs, centres that node and opens the drill-down panel, while graph clicks highlight the matching row.
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

