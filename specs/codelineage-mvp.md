# codelineage — MVP spec

Status: Draft · 2026-10-21
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
  waiting on the user), next step, last activity.
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
  sessions/<session-id>.json # one file per session; only that session writes it
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

**Concurrency:** one file per session means parallel agents in the same project never
write the same file. Only `project.json` is shared, and only the CLI writes to it.

## Capture (Claude Code plugin)

Distributed like OpenViking: a Claude Code plugin that ships `hooks/hooks.json` plus a
skill.

- **Skill `/lineage`:** writes or updates this session's file following the schema.
  The user can call it at any time.
- **Stop hook:** counts turns since the last update. Every N turns (default 5,
  configurable) it blocks the stop with a reason, so the agent runs the skill. If
  nothing meaningful happened, the agent leaves the file unchanged.
- **PreCompact hook:** forces an update before context compaction, so details are
  saved before they are lost.
- Then `codelineage build` runs quietly to refresh the HTML.

Each update costs agent tokens (the user's subscription or API usage). The frequency
setting is the cost knob.

## CLI surface

| Command | Does |
|---|---|
| `codelineage init` | Creates `.codelineage/`, registers the project, asks the install questions |
| `codelineage build [dir]` | Regenerates `lineage.html` and `panel.html` |
| `codelineage open [dir]` | Builds, then opens the map (or the panel if no dir is given) |
| `codelineage epoch add <id> <title>` | Adds an epoch (locked write) |
| `codelineage config get/set <key> [value]` | Reads or changes settings |
| `codelineage backfill [dir]` | Summarizes existing transcripts by running the agent headless, one session at a time. Estimates cost and asks first. |

## Install questions (`init` and first plugin run)

1. **Git (only if the directory is a repo):** commit `.codelineage/` or add it to
   `.gitignore`? Default: ignore (see Privacy).
2. **Transcript retention:** Claude Code deletes sessions after 30 days by default
   (`cleanupPeriodDays`). Offer to raise it. Never change it silently. The README
   explains this too.
3. **Language** for summaries: `auto` (the conversation's language) or a fixed language.

Settings in `config.json`: `language`, `updateEveryTurns`, `gitPolicy`, `agents`.

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

## Tech stack

- **CLI and hooks:** Node + TypeScript, published to npm (`codelineage`).
- **HTML:** React + TypeScript, built with Vite and `vite-plugin-singlefile` into one
  template. The CLI embeds the JSON data into that template.
- **Graph:** React Flow (`@xyflow/react`) for rendering, with its built-in MiniMap;
  `elkjs` computes the layout and handles nested groups (epoch → session → nodes).
- **Side view:** outline/tree next to the graph. Experimental, may be removed.
- **License:** MIT.

## MVP scope

1. Schema, plus `init`, `build`, `open`, `epoch add`, `config`
2. HTML template: status card, graph with drill-down, outline, resume button
3. Panel
4. Claude Code plugin: skill, Stop and PreCompact hooks
5. `backfill`

## Later

- Codex adapter (its hooks and session retention still need research)
- Optional local server for live refresh and editing settings from the panel
- A Herdr usage section in the README
- Video or other "explainer" outputs
