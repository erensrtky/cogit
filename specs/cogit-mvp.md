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
  a git graph of the user's messages. The map is a minimap of the chat: one row
  per message the user wrote, in the order they sent it, titled in the user's
  words and saying what came of it; the agent's work on it (steps, its own
  decisions with their reasons, commits, files) lives in that row's detail, not
  in rows of its own. Each session draws like a git history: one dot per message,
  one coloured lane per branch (a branch is a chain of messages that react to
  each other one to one), the first message of a branch a hollow ring with the
  branch title, a branch start curving out of the message it reacts to, and a
  return (`links`) a dashed arrow through a channel left of the lanes, marked
  "↩ m22" on the row. A new root starts after a small gap. A branch longer than
  four messages folds to its first and last message plus a "⋮ N more" row that
  unfolds it; "Unfold all" opens every branch at once. The newest branch (where
  "left off here" marks the newest message) starts unfolded. Sessions keep their
  place in the project map; time runs down the page. A click opens a drill-down
  panel with the branch summary (title, range, count, time span, asked / outcome
  / open), the full text, who decided, the options considered and rejected, what
  the agent did and decided on its own, the commits and files, the conversation
  itself (the message as written and the agent's written replies, tool output
  left out and tool use counted), previous/next message buttons, and a
  `claude --resume <id>` copy button. `build` reads the conversation from the
  transcript into `lineage.html` only (never committed, see Privacy); session
  files never hold raw text. A message whose record lists commits shows them as
  small tag chips with the commit subject read from git at build time; a commit
  git no longer has stays listed and is drawn greyed. `codelineage blame
  <file>[:<line>]` follows git blame (or every commit that touched the file)
  back to the messages that recorded those commits, and prints the map URL that
  opens each message. Records from before messages carried message parents
  (their `parent` is a topic or step) render as one chain in send order.
- **Status card** at the top of every project: goal, done, pending (flags items
  waiting on the user), next step, last activity. With parallel sessions, goal and
  next come from the most recently updated session; `needsUser` items are merged
  from all active sessions. A session is **active** while its `updatedAt` is
  within 7 days of the build, newest first; duplicate item texts are shown once.
- **Panel** (global): every registered project as a small status card, with quick
  switching into each project map. Settings are editable on the page the local
  server serves (`POST /api/config`, same-origin, per-server token) and read-only
  from `file://`.
- **Project switcher** (on every map): a tab strip of the most recently active
  projects and a Ctrl/Cmd+K search over every registered project, each entry
  showing the project name, its last activity and where it left off (the newest
  session's `next`, or its last message title). Choosing one opens that project's
  map at its own "left off here" — a page of the same local server over http, the
  `lineage.html` file over `file://`. A project whose directory is gone is left
  out. The data comes from the registry at build time; no model calls.

Sessions are not a separate view. A session is a level of the project tree.

## Non-goals (MVP)

- No git dependency. Works in any directory, git or not.
- No server. Every output is a self-contained HTML file opened over `file://`.
- Not a code/architecture visualizer (that is the job of omm, Archify and similar tools).
- Not an agent monitor ("who is running, who is waiting" belongs to tools like Herdr).
- No editing from the map. It is read-only; the local server only serves it and refreshes open pages on rebuild.

## Data model

```
<project>/.codelineage/
  project.json               # project name, epochs[], schema version
  sessions/<session-id>.json # one file per session (see Concurrency)
  state/<session-id>.json    # hook state: turn counter
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
    { "id": "m3", "parent": "n1", "kind": "message", "title": "…", "summary": "…",
      "at": "…", "why": "…", "decidedBy": "agreed",
      "alternatives": [{ "option": "…", "why": "rejected because …" }],
      "work": ["…"],
      "agentDecisions": [{ "title": "…", "why": "…", "alternatives": [] }],
      "commits": ["322259a"], "files": ["src/…"],
      "addedAt": "…", "touchedAt": "…" }
  ]
}
```

`kind` is one of `phase | message | step | decision | question`; a `phase` is a topic
and is shown as one, a `message` is one user message. Message ids are `m1`, `m2`, …
in the order of the user's messages in the Claude Code transcript; `session show`
reads the transcript and lists the messages that have no node yet (id, time and an
excerpt; pastes are named, not copied), so the agent cannot skip or reorder one,
and `session write` sets a message's `at` from the transcript. Tool results,
injected skill text, compaction summaries, subagent turns, `!` shell lines and
slash commands without arguments are not messages. Raw message text never enters
the record, only the agent's title and summary. `step`, `decision` and `question`
are kept for records written before messages became the nodes. A message's
`parent` is the earlier message it reacts to (or `null` for a new root); a parent
that is not an earlier message falls back to the previous message, so old records
chain in send order. `links` (up to five) name older messages the message returns
to besides its parent, and `branch` (title, asked, outcome, open) sits on the
first message of a branch, written when the branch ends rather than every turn.
`decidedBy` is `user | agent | agreed`. `addedAt` (first write) and `touchedAt`
(last change) are stamped by `session write` and never taken from agent input; a
resent node that changed nothing keeps its `touchedAt`. Epochs live in `project.json`.
A message's stable id is `h` plus the first 12 hex of a SHA-256 over the session
id, transcript uuid, time and text; `m1`, `m2`, … stay as display labels. A parent
is not part of the hash, so correcting it never renames a message (unlike git, on
purpose). `codelineage show` accepts the hash, any unique prefix of at least six
hex characters after the `h`, or `<session-id-prefix>:mN`.
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
  triggered by a context-limit error fails the request. Compaction does not shorten
  the transcript (verified 2026-10-23: it appends a `compact_boundary` line and the
  summary, every earlier line stays), and message nodes are read from the
  transcript, so no message is lost and no snapshot is taken. Only SessionStart
  with `source: "compact"` acts: when user messages have no node yet, it asks the
  agent (via `additionalContext`) to run the skill, which works from the compact
  summary already in its context. No PreCompact or PostCompact hook.
- **Session end catch-up.** Messages after the last update have no node when the
  user exits, runs `/clear` or switches with `/resume`. SessionEnd cannot make the
  agent act and plugin hooks get a 1.5 s budget, so the hook only spawns a detached
  `codelineage backfill <session-id> --tail` and returns. The catch-up reads the
  transcript, takes the user messages with no node together with the agent's replies
  and actions after each, summarizes them with a headless run by the skill's rules
  and writes them through `session write`. Setting: `sessionEndCatchUp` (`on` by
  default; `off` = no tokens spent, and the map shows "N messages not recorded").
  - Fallback: the tail is not stored anywhere; it is whatever messages still have no
    node, so if the detached process dies, the next session start in that project
    finds them again and retries.
  - Verified (Claude Code 2.1.300, Linux): a child started from SessionEnd with
    `spawn(…, { detached: true, stdio: "ignore" }).unref()` outlives both the hook
    and Claude Code exiting, and is reparented to the init process.
- **Session start handoff.** In an initialized project, SessionStart on `startup`,
  `resume` or `clear` (not `compact`) gives the agent what it needs to continue
  without a hand-written note: one paragraph saying that the lineage is recorded and
  how to read it (`node "<plugin>/dist/cli.js" log|show … -C "<dir>"`, exact paths),
  the rule to run `show <ref>` before answering when the user mentions a message hash
  or another session's `mN`, then the compressed view of the most recent session other
  than this one — its title, status (`goal`, `pending` with items that need the user,
  `next`) and branch summaries. The text stays under ~1,500 tokens: the oldest
  branches are cut first and a line says how many were cut. Setting:
  `startupContext` (on by default; off spends no tokens on it). It replaces
  hand-written handoff files for the common case; existing ones are left alone.
- **Before `init`:** if `.codelineage/` does not exist, all hooks are no-ops, except
  that SessionStart on `startup` or `resume` injects a one-line offer: the agent says
  codelineage is not set up here and sets it up only when the user asks. Setup happens
  in the chat: the agent asks the install questions and runs the bundled CLI with
  `init --yes --git … --retention … --language …` (`--allow-skill` only when agreed).
  Projects are never registered automatically. `codelineage config hint-off [dir]`
  silences the offer in that project ("don't ask again", stored in the global
  `setupHintOff` list, keyed by the main checkout so a worktree is covered);
  `codelineage config hint-on [dir]` turns it back on, `--all` everywhere. A plugin
  update reaches a running session only after `/reload-plugins` or a new chat, and
  the offer says so.
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
| `codelineage open [dir]` | Builds, then opens the map (or the panel if no dir is given) through the local map server, starting it in the background if it is not running. The open page refreshes itself whenever the map is rebuilt, keeping the selected branch, unfolded branches, scroll and zoom. Falls back to opening the file when the server cannot start. |
| `codelineage blame <file>[:<line>]` | Follows git blame (or `git log` for a whole file) back to the messages whose record lists those commits; prints each commit, session, message, summary and the map URL that opens that message. Says so plainly when no record knows the code. |
| `codelineage log [dir]` | Prints the lineage like `git log --graph --oneline`, newest first: per message its short hash, `mN`, time, title, `↩` returns and commit tags, a branch's first message with the branch title, and a header line per session (title, epoch, time span). `-C <dir>` works instead of the positional, `--session <id\|prefix>` narrows to one session, `-n <count>` limits the messages, `--branches` prints only the branch summaries (title, asked, outcome, open — the compressed view), and `--json` prints the model. Plain text; no colour when not a TTY. |
| `codelineage show <ref> [dir]` | Prints one message: hash, `mN`, session, time, parent and children (as refs), `links`, the branch it belongs to with that branch's summary, decisions (`decidedBy`, `why`, `alternatives`), agent decisions, work, commits with their git subjects, files, then its conversation turn from the store (`-C <dir>` works instead of the positional; `--no-chat` skips the turn; `--json` prints the model). A `<ref>` is a message hash or any unique prefix of at least six hex characters after the `h`, or `<session-id-prefix>:mN`; an ambiguous prefix lists the candidates and exits non-zero, an unknown one says so plainly. |
| `codelineage epoch add <id> <title>` | Adds an epoch (locked write) |
| `codelineage config get/set <key> [value]` | Reads or changes settings |
| `codelineage config hint-off [dir]` | Stops the SessionStart setup offer in that project ("don't ask again") |
| `codelineage config hint-on [dir] [--all]` | Shows the setup offer again in that project, or everywhere with `--all` |
| `codelineage session show <id>` | Prints the compact record the skill injects (epochs, language, status, node ids/titles, inbox path) as JSON. Never fails for an uninitialized project. |
| `codelineage session write` | Reads session JSON from stdin or `--file` (the skill uses `--file <inbox> --consume`), validates, redacts, merges and writes it under the session lock, then builds. |
| `codelineage backfill [dir]` | Summarizes past transcripts of that project by running the agent headless, one session at a time. Estimates cost and asks first. Selection: `--pick` (default: lists sessions with date, first prompt and estimated cost), `--last <n>`, `--since <date>`, `--all`. |
| `codelineage backfill <session-id> --tail` | Summarizes only the user messages of one session that have no node yet. Started by the SessionEnd hook. |

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
`catchUpModel` (model for the headless catch-up and backfill, default `haiku`),
`messageSummaries` (write a per-message summary; default `false`),
`startupContext` (give the agent the previous session's lineage at session start;
default `true`),
`serverPort` (local map server, default 4747),
`gitPolicy`, `agents`, `setupHintOff` (project roots where the SessionStart setup
offer stays silent). The panel may change `language`, `updateEveryTurns`,
`sessionEndCatchUp`, `catchUpModel`, `messageSummaries` and `startupContext` over the
local server; everything else stays on `codelineage config set`.

## Privacy

- The skill tells the agent never to record secrets, credentials, tokens or personal
  data. It records decisions and rationale, not raw content.
- `build` runs a redaction pass (common key and token patterns) before writing HTML.
- The map (`lineage.html`) shows the conversation read from the local transcript. It
  is never committed under any `gitPolicy`, so raw chat stays on the machine that
  already holds the transcript; session files keep only titles and summaries.
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
- **Session in a linked git worktree** (`claude -w`, `.claude/worktrees/<name>/`): hook
  `cwd` and `CLAUDE_PROJECT_DIR` both point at the worktree (verified 2026-10-23,
  Claude Code 2.1.300). With `gitPolicy=ignore` the worktree has no `.codelineage/`, so
  hooks and every `-C`/`[dir]` command map the worktree to the main checkout by reading
  files only (`.git` → `gitdir` → `commondir`), the way Claude Code itself keeps
  worktree state in the main checkout. With `gitPolicy=commit` the worktree has its own
  copy and keeps it. The CLI stamps `worktree: {path, branch}` on the session, and the
  drill-down shows it. `session show` returns the worktree as `dir`, the main checkout
  as `store`, and an inbox under the worktree, so the skill's edit permission still
  matches. `claude --resume <id>` run from the main checkout re-enters the worktree, so
  the resume command stays the same. `.worktreeinclude` is not used: copying live
  records into a worktree would fork them and lose them when the worktree is removed.

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
4. Claude Code plugin: skill; Stop, SessionStart and SessionEnd hooks; recursion
   guard
5. `backfill` (project selection and `--tail` catch-up)
6. Live map: rebuild after every turn (messages not summarized yet shown at once)
   and a local map server as the default way `open` shows a map: one background
   server per user on `127.0.0.1`, serving only registered projects' maps and the
   panel, refreshing open pages on change, exiting after 30 idle minutes; opening
   the file directly is only the fallback when it cannot start. The panel edits
   the safe settings over the same server.

## Later

- Codex adapter (its hooks and session retention still need research)
- A Herdr usage section in the README
- Video or other "explainer" outputs
