# codelineage — MVP spec

Status: Draft · 2026-10-21 (rev. 2: capture verified against hooks docs)
Tagline: *The lineage of your AI coding sessions.*

## Problem

Developers running several AI coding agents across several projects lose time on
every context switch. Coming back to a session (or to a project after weeks) means
re-reading a long chat or asking the agent "where were we?". Existing tools show the
*current* state of the code (architecture diagrams, knowledge graphs). Nothing shows
*how the project got here*: which sessions happened, what was decided, and why.

## Solution

The agent itself records a structured summary of its session as it works. A CLI turns
these records into static HTML:

- **Project map** (one per project): project → epoch (feature/epic) → session →
  topic → sub-topics (any depth) → step/decision/question. It opens like layers of
  an onion: time runs down the page (sessions in order), a session's top-level
  topics sit side by side as columns ordered by when they began, and an opened
  topic lists its items down its column in the order they were added. Every node
  with children expands and collapses; the latest session opens with its topics
  closed except the branches to the nodes its last write added or changed, which
  are marked "left off here". Cards size themselves to their text. A click opens
  a drill-down panel with the full text, who decided, the options considered and
  rejected, the commits and files, and a `claude --resume <id>` copy button.
- **Status card** at the top of every project: goal, done, pending (flags items
  waiting on the user), next step, last activity. With parallel sessions, goal and
  next come from the most recently updated session; `needsUser` items are merged
  from all active sessions. A session is **active** while its `updatedAt` is
  within 7 days of the build, newest first; duplicate item texts are shown once.
- **Panel** (global): every registered project as a small status card, with quick
  switching into each project map. Settings are shown read-only.

Sessions are not a separate view. A session is a level of the project tree.

## Non-goals (MVP)

- No git dependency. Works in any directory, git or not.
- No server. Every output is a self-contained HTML file opened over `file://`.
- Not a code/architecture visualizer (that is the job of omm, Archify and similar tools).
- Not an agent monitor ("who is running, who is waiting" belongs to tools like Herdr).
- No live updates. The view refreshes on rebuild.

## Data model

```
<project>/.codelineage/
  project.json               # project name, epochs[], schema version
  sessions/<session-id>.json # one file per session (see Concurrency)
  state/<session-id>.json    # hook state: turn counter, last recorded turn, pending tail
  snapshots/<session-id>-<ts>.jsonl  # transcript copy taken before compaction
  locks/                     # lock files
  lineage.html               # generated

~/.config/codelineage/
  config.json                # global settings
  projects.json              # registry of project paths
  panel.html                 # generated
```

Session file (schema v1, sketch):

```json
{
  "schema": 1,
  "sessionId": "9c32…",
  "agent": "claude-code",
  "title": "e2e setup flow",
  "epoch": "e2e",
  "startedAt": "…", "updatedAt": "…",
  "status": {
    "goal": "…",
    "done": ["…"],
    "pending": [{ "text": "…", "needsUser": true }],
    "next": "…"
  },
  "nodes": [
    { "id": "n1", "parent": null, "kind": "phase", "title": "…", "summary": "…",
      "addedAt": "…", "touchedAt": "…" },
    { "id": "n2", "parent": "n1", "kind": "decision", "title": "…", "why": "…",
      "decidedBy": "agreed",
      "alternatives": [{ "option": "…", "why": "rejected because …" }],
      "commits": ["322259a"], "files": ["src/…"],
      "addedAt": "…", "touchedAt": "…" }
  ]
}
```

`kind` is one of `phase | step | decision | question`; a `phase` is a topic and is
shown as one. Nodes are grouped by topic, not by time, and nest to any depth through
`parent`. `decidedBy` is `user | agent | agreed`. `addedAt` (first write) and
`touchedAt` (last change) are stamped by `session write` and never taken from agent
input; a resent node that changed nothing keeps its `touchedAt`. Siblings are
ordered by when their thread began (the earliest `addedAt` in their subtree);
nodes recorded before the stamps existed keep their stored order, first. Epochs live in `project.json`.
The agent picks an existing epoch or adds one through the CLI (`codelineage epoch add`),
which does a locked, atomic write.

**Writes go through the CLI.** The agent never writes session files directly. It
saves its JSON to `.codelineage/inbox/<session-id>.json` with the Write tool and runs
`codelineage session write --file <inbox> --consume`, which validates against the
schema, runs the redaction pass, merges with the existing file and writes atomically,
deletes the inbox file, then runs `build` quietly. JSON is not piped through the shell,
because Claude Code's command checks block heredocs that contain JSON.

**Concurrency:**
- One file per session, so parallel agents in the same project never write the same
  file. A session file may also be written by a catch-up run for that session (see
  Capture), so every session write takes a per-session lock and does
  read → merge → write, never a blind overwrite.
- `project.json` is shared; only the CLI writes it, under a lock.
- All writes (JSON and HTML) go to a temp file and are renamed into place, so a
  reader never sees a half-written file. Concurrent builds: last one wins.
- A catch-up run that finds the session lock held exits ("already running").

## Capture (Claude Code plugin)

Distributed like OpenViking: a Claude Code plugin that ships `hooks/hooks.json`, a
skill, and a bundled build of the CLI (single file), so hooks run
`node ${CLAUDE_PLUGIN_ROOT}/dist/…` with no global install and no `npx` startup cost.
The `codelineage` npm package is both the standalone CLI and the plugin: it ships
`.claude-plugin/plugin.json` next to `dist/`, and the repository root holds a
`codelineage` marketplace whose entry installs it with an `npm` source, so no build
output is committed. `plugin.json` carries the package version, because an
npm-sourced plugin without one resolves to version `unknown` and never updates.

Behavior verified against the Claude Code hooks docs (2026-10-21):

- **Skill `/codelineage:lineage`:** writes or updates this session's record. The skill
  gets its session ID from `${CLAUDE_SESSION_ID}` and injects a compact view of the
  record with `` !`codelineage session show` ``, so the agent sends only what is new
  or changed instead of rewriting it. The injected command never fails (an
  uninitialized project is reported in its JSON), because a failing injection aborts
  the whole skill. `allowed-tools` pre-approves exactly the CLI and writes under
  `.codelineage/inbox/`, so the skill runs without prompts. The user can call it at
  any time. Verified end to end with Claude Code 2.1.300: first write, "up to date"
  with no change, and the hint in an uninitialized directory.
- **Stop hook (the main path):** counts turns per session in `state/`. Every N turns
  (`updateEveryTurns`, default 5) it asks the agent to run the skill, using
  `hookSpecificOutput.additionalContext` (shown as "Stop hook feedback", not as an
  error). It never asks when `stop_hook_active` is true, which also keeps us clear of
  Claude Code's 8-consecutive-continuation cap. Stop does not fire on user interrupts,
  so the count is approximate. If nothing meaningful happened, the agent leaves the
  record unchanged. The count restarts whenever the record's `updatedAt` changed
  since the previous Stop (the skill ran, asked or not) and after each request, so
  an "up to date" answer is not asked again on the next turn. Verified end to end
  with Claude Code 2.1.300: a request after N turns, the agent runs the skill, the
  record is written. A model-invoked skill that has `allowed-tools` needs permission
  (`Skill(codelineage:lineage)` in `permissions.allow`); without it the request is
  denied in `-p` runs and prompts in interactive ones. A plugin cannot grant it to
  itself, so `init` offers to add it to the user settings (install question 3).
- **Compaction (safety net).** PreCompact output never reaches the model and it cannot
  make the agent act; it can only block compaction, and blocking an auto-compact
  triggered by a context-limit error fails the request. So:
  - PreCompact never blocks. It copies the transcript to `snapshots/` and marks the
    session as needing an update.
  - PostCompact stores `compact_summary` in the session's state as a raw note.
  - SessionStart with `source: "compact"` tells the agent (via `additionalContext`)
    to run the skill, using the compact summary and the snapshot.
- **Session end catch-up.** Turns after the last update are lost when the user exits,
  runs `/clear` or switches with `/resume`. SessionEnd cannot make the agent act and
  plugin hooks get a 1.5 s budget, so the hook only records the pending tail in
  `state/` and spawns a detached `codelineage backfill <session-id> --tail`, then
  returns. The catch-up summarizes only the unrecorded turns with a headless run and
  merges them into the session file. Setting: `sessionEndCatchUp` (`on` by default,
  `off` = no tokens spent; the tail is shown as "not recorded").
  - Fallback: if the detached process dies, the pending tail stays in `state/`; the
    next `build` or the next session start in that project retries it.
  - Verified (Claude Code 2.1.300, Linux): a child started from SessionEnd with
    `spawn(…, { detached: true, stdio: "ignore" }).unref()` outlives both the hook
    and Claude Code exiting, and is reparented to the init process.
- **Before `init`:** if `.codelineage/` does not exist, all hooks are no-ops, except
  that SessionStart injects a one-line hint to run `codelineage init`. Projects are
  never registered automatically.
- **Recursion guard:** every headless run started by codelineage (`backfill`,
  catch-up) sets `CODELINEAGE_DISABLE=1`, and our hooks do nothing when it is set.
  Users can set it too, to turn capture off for any headless run (for example a
  loop runner). Other plugins' hooks (memory plugins and the like) must not fire in
  these runs either. Verified (Claude Code 2.1.300): headless runs use
  `claude -p --safe-mode --no-session-persistence`. `--safe-mode` disables every
  plugin and settings hook, MCP servers and CLAUDE.md while keeping normal auth
  (subscription included); `--no-session-persistence` keeps the run from leaving a
  transcript that would later show up as a past session. `--bare` is not an option:
  it accepts only `ANTHROPIC_API_KEY`. The input goes in on stdin explicitly, since
  `-p` otherwise waits 3 s for it.

Each update costs agent tokens (the user's subscription or API usage).
`updateEveryTurns` and `sessionEndCatchUp` are the cost knobs.

## CLI surface

| Command | Does |
|---|---|
| `codelineage init` | Creates `.codelineage/`, registers the project, asks the install questions |
| `codelineage build [dir]` | Regenerates `lineage.html` and `panel.html` |
| `codelineage open [dir]` | Builds, then opens the map (or the panel if no dir is given) |
| `codelineage epoch add <id> <title>` | Adds an epoch (locked write) |
| `codelineage config get/set <key> [value]` | Reads or changes settings |
| `codelineage session show <id>` | Prints the compact record the skill injects (epochs, language, status, node ids/titles, inbox path) as JSON. Never fails for an uninitialized project. |
| `codelineage session write` | Reads session JSON from stdin or `--file` (the skill uses `--file <inbox> --consume`), validates, redacts, merges and writes it under the session lock, then builds. |
| `codelineage backfill [dir]` | Summarizes past transcripts of that project by running the agent headless, one session at a time. Estimates cost and asks first. Selection: `--pick` (default: lists sessions with date, first prompt and estimated cost), `--last <n>`, `--since <date>`, `--all`. |
| `codelineage backfill <session-id> --tail` | Summarizes only the unrecorded turns of one session. Started by the SessionEnd hook. |

## Install questions (`init` and first plugin run)

1. **Git (only if the directory is a repo):** commit `.codelineage/` or add it to
   `.gitignore`? Default: ignore (see Privacy).
2. **Transcript retention:** Claude Code deletes sessions after 30 days by default
   (`cleanupPeriodDays`). Offer to raise it. Never change it silently. The README
   explains this too.
3. **Skill permission:** add `Skill(codelineage:lineage)` to `permissions.allow` in
   `~/.claude/settings.json` so automatic updates do not prompt every N turns? Default:
   yes. Asked only when the rule is missing; backs the file up first (one backup per
   run, holding the original), refuses a file it cannot parse and prints what it
   changed. `--allow-skill` / `--no-allow-skill` answer it; `--yes` alone never adds it;
   `--allow-skill` also works on an already initialized project. A user-level rule is harmless in projects
   without `init`, where the skill only prints the setup hint.
4. **Language** for summaries: `auto` (the conversation's language) or a fixed language.
5. **Past sessions:** "This project has N earlier sessions: all, pick, or none?"
   Default: none. Picking or all runs `backfill` with a cost estimate first.

Settings in `config.json`: `language`, `updateEveryTurns`, `sessionEndCatchUp`,
`gitPolicy`, `agents`.

## Privacy

- The skill tells the agent never to record secrets, credentials, tokens or personal
  data. It records decisions and rationale, not raw content.
- `build` runs a redaction pass (common key and token patterns) before writing HTML.
- Default `gitPolicy` is `ignore`, because sharing has to be a deliberate choice.

## Edge cases

- **Transcript deleted:** the node still renders, and the resume button shows
  "session no longer available".
- **Invalid or partial session file:** `build` skips it with a warning and never fails
  the whole map.
- **Schema version mismatch:** older files are migrated when read, and newer ones
  trigger a warning.
- **Project directory moved or deleted:** the panel marks it as missing.
  `codelineage config` can prune it.
- **Exit and immediate `--resume`:** the catch-up run and the resumed agent may write
  the same session; the session lock plus read → merge → write keeps both changes.
- **`~/.config/codelineage` not writable** (containers, CI, read-only home): registry
  and panel updates are skipped with a warning; project-local writes still work.

## Tech stack

- **CLI and hooks:** Node + TypeScript, published to npm (`codelineage`).
- **HTML:** React + TypeScript, built with Vite and `vite-plugin-singlefile` into one
  template. The CLI embeds the JSON data into that template.
- **Graph:** React Flow (`@xyflow/react`) for rendering, with its built-in MiniMap;
  `elkjs` computes the layout and handles nested groups (epoch → session → nodes).
- **Side view:** outline/tree next to the graph. Experimental, may be removed.
- **License:** MIT.

## MVP scope

1. Schema, storage (locks, atomic writes), plus `init`, `session write`, `build`,
   `open`, `epoch add`, `config`
2. HTML template: status card, graph with drill-down, outline, resume button
3. Panel
4. Claude Code plugin: skill; Stop, PreCompact, PostCompact, SessionStart and
   SessionEnd hooks; recursion guard
5. `backfill` (project selection and `--tail` catch-up)

## Later

- Codex adapter (its hooks and session retention still need research)
- Optional local server for live refresh and editing settings from the panel
- A Herdr usage section in the README
- Video or other "explainer" outputs
