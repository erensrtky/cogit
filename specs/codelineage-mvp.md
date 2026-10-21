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
  phase/step/decision. Every node can be expanded to drill down. Each session node
  carries a `claude --resume <id>` copy button.
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
    { "id": "n1", "parent": null, "kind": "phase", "title": "…", "summary": "…" },
    { "id": "n2", "parent": "n1", "kind": "decision", "title": "…", "why": "…" }
  ]
}
```

`kind` is one of `phase | step | decision | question`. Epochs live in `project.json`.
The agent picks an existing epoch or adds one through the CLI (`codelineage epoch add`),
which does a locked, atomic write.

**Writes go through the CLI.** The agent never writes JSON files directly. It pipes
its JSON to `codelineage session write`, which validates against the schema, runs the
redaction pass, merges with the existing file and writes atomically, then runs
`build` quietly.

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
The npm package is published separately for standalone use.

Behavior verified against the Claude Code hooks docs (2026-10-21):

- **Skill `/codelineage:lineage`:** writes or updates this session's record. The skill
  gets its session ID from `${CLAUDE_SESSION_ID}` and injects the current session file
  with `` !`command` ``, so the agent updates the record instead of rewriting it.
  The user can call it at any time.
- **Stop hook (the main path):** counts turns per session in `state/`. Every N turns
  (`updateEveryTurns`, default 5) it asks the agent to run the skill, using
  `hookSpecificOutput.additionalContext` (shown as "Stop hook feedback", not as an
  error). It never asks when `stop_hook_active` is true, which also keeps us clear of
  Claude Code's 8-consecutive-continuation cap. Stop does not fire on user interrupts,
  so the count is approximate. If nothing meaningful happened, the agent leaves the
  record unchanged.
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
| `codelineage session write` | Reads session JSON from stdin, validates, redacts, merges and writes it under the session lock, then builds. Used by the skill. |
| `codelineage backfill [dir]` | Summarizes past transcripts of that project by running the agent headless, one session at a time. Estimates cost and asks first. Selection: `--pick` (default: lists sessions with date, first prompt and estimated cost), `--last <n>`, `--since <date>`, `--all`. |
| `codelineage backfill <session-id> --tail` | Summarizes only the unrecorded turns of one session. Started by the SessionEnd hook. |

## Install questions (`init` and first plugin run)

1. **Git (only if the directory is a repo):** commit `.codelineage/` or add it to
   `.gitignore`? Default: ignore (see Privacy).
2. **Transcript retention:** Claude Code deletes sessions after 30 days by default
   (`cleanupPeriodDays`). Offer to raise it. Never change it silently. The README
   explains this too.
3. **Language** for summaries: `auto` (the conversation's language) or a fixed language.
4. **Past sessions:** "This project has N earlier sessions: all, pick, or none?"
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
