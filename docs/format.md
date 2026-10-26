# The cogit record format

cogit stores the **why** next to git's **what**. This document is the contract for
that record: the files, their JSON shapes, the message id, and how the graph is
read. It is written for anyone who wants to read or write `.cogit/` without
running cogit — another agent, a viewer, an import/export tool.

The JSON Schemas in [`docs/schema/`](schema/) are generated from the zod schemas
in `packages/cli/src/schema/`; they are the machine-readable form of this page.
`npm run schemas` regenerates them, and `packages/cli/test/schema-export.test.ts`
fails when a file and the code disagree.

## Where the record lives

```
<project>/.cogit/
  project.json                    # name, epochs, schema version (shared, versioned)
  sessions/<session-id>.json      # one file per session, the notes (versioned)
  sessions/<session-id>.events.jsonl  # append-only structure facts (versioned)
  conversations/<session-id>.jsonl.gz # the conversation store (local by default)
  state/<session-id>.json         # hook state: turn counter (local)
  locks/                          # lock files (local)
  inbox/<session-id>.json         # JSON the agent hands to `session write` (local)
  HEAD                            # the session the next commit carries (local)
  .gitignore                      # which local paths stay out of git
  map.html                        # generated map (local)

~/.config/cogit/                  # or $COGIT_HOME / $XDG_CONFIG_HOME/cogit
  config.json                     # global settings
  projects.json                   # registry of project paths
  panel.html                      # generated project switcher (local)
```

`COGIT_HOME` overrides the config directory (`CODELINEAGE_HOME` is still read as
a fallback). A pre-rename `.codelineage/` is migrated to `.cogit/` silently on
the first command or hook in the project.

### What travels with a git clone

Under the default `gitPolicy: "commit"`, the root `.gitignore` says nothing about
`.cogit/`; instead `.cogit/.gitignore` ignores everything except the files that
make up the record:

```gitignore
*
!.gitignore
!sessions/
!sessions/**
!project.json
```

With `shareConversations: true` it also keeps `conversations/`. Everything else
(`state/`, `locks/`, `inbox/`, `map.html`, `HEAD`, backups) stays local. Under
`gitPolicy: "ignore"` the root `.gitignore` holds `/.cogit/` and nothing travels.

## Versioning

Every versioned document has an integer `schema` field, starting at `1`:

| File | Schema |
| --- | --- |
| `project.json` | `PROJECT_SCHEMA` = 1 |
| `sessions/<id>.json` | `SESSION_SCHEMA` = 1 |
| `sessions/<id>.events.jsonl` | event shape v1 (no per-line version) |
| `config.json` | `CONFIG_SCHEMA` = 1 |
| `projects.json` | `CONFIG_SCHEMA` = 1 |
| `state/<id>.json` | `STATE_SCHEMA` = 1 |

A reader must accept an older version by migrating it step by step
(`parseVersioned` in `packages/cli/src/schema/versioned.ts`). A newer version is
read best-effort with a warning, never rejected. A reader that changes the shape
of a document must do it in code (a migration), not by hand-editing old files.

## project.json

```json
{
  "epochs": [
    {"createdAt": "2026-10-26T12:00:00.000Z", "id": "e2e", "title": "End-to-end"}
  ],
  "name": "cogit",
  "schema": 1
}
```

An **epoch** is a named stretch of work (a feature, an epic); a session points at
one through the session file's `epoch` field. `project.json` is the only file two
people write; cogit writes it with sorted keys and one epoch per line so git
merges concurrent epoch additions line by line.

## sessions/<session-id>.json

One file per session, written only by that session's owner. The session id is a
slug (`[A-Za-z0-9][A-Za-z0-9_.-]{0,127}`), normally the agent's session id.

```json
{
  "schema": 1,
  "sessionId": "9c32…",
  "agent": "claude-code",
  "title": "e2e setup flow",
  "epoch": "e2e",
  "startedAt": "2026-10-26T10:00:00.000Z",
  "updatedAt": "2026-10-26T10:30:00.000Z",
  "status": {
    "goal": "…",
    "done": ["…"],
    "pending": [{"text": "…", "needsUser": true}],
    "next": "…"
  },
  "nodes": [
    {
      "id": "h3f9a2c1b0d4",
      "parent": null,
      "kind": "message",
      "title": "Set up the e2e flow",
      "at": "2026-10-26T10:01:00.000Z",
      "branch": {"title": "…", "asked": "…", "outcome": "…", "open": ""}
    }
  ],
  "author": "Eren",
  "worktree": {"path": "/…/wt/feature", "branch": "feature"}
}
```

- `agent` is the recording agent (`claude-code` today).
- `author` is git `user.name` (else the OS user), set on the first write. Older
  records have none.
- `worktree` is set by the CLI when the session ran in a linked worktree.
- `addedAt` and `touchedAt` on a node are stamped by `session write`, never taken
  from agent input. A resent node that changes nothing keeps `touchedAt`.

### Nodes

`kind` is one of `phase`, `message`, `step`, `decision`, `question`. New records
write `message` nodes only: one per user message. The other kinds are kept for
records written before messages became the nodes; they still render.

A node carries the notes: `title`, optional `summary`, `why`, `decidedBy`
(`user` | `agent` | `agreed`), `alternatives` (`{option, why}`), `work`,
`agentDecisions`, `commits` (7–40 hex), `files`, `links`. The first message of a
branch carries `branch` (`{title, asked, outcome, open}`).

### The message id

A message node id is **stable**: `h` plus the first 12 hex characters of the
SHA-256 of the canonical JSON:

```json
{"sessionId":"<session>","uuid":"<transcript uuid or ''>","at":"<ISO time>","text":"<the text the user sent>"}
```

The JSON has that exact key order, no whitespace, and UTF-8 bytes. `uuid` is the
transcript's uuid for the user line, or `""` when there is none. The parent is
**not** part of the hash: correcting a parent never renames a message, so notes
and links keep pointing at it. `messages.ts` computes it (`messageHash`).

`m1`, `m2`, … are **display labels** derived from send order, not ids. A reader
may accept a label where an id is expected (the CLI maps it), but a stored record
should use the stable id. A record written before stable ids (schema still 1; the
`mN` ids) is renamed on load and persisted on its next `session write`.

A cross-session reference has the form `<sessionId>:<id>`: a message of an
earlier session of the same project (never across projects).

### Parents, links, roots

`parent` is the earlier message a node reacts to, `null` for a new root. A parent
must be an earlier message of the session (or a checked cross-session reference);
anything else is repaired to the previous message with a warning.

`links` are up to five earlier messages a node builds on besides its parent. On
the map, a link from the left channel is drawn as a dashed return arrow.

Siblings are ordered by when their thread began (the earliest `at` in their
subtree; `addedAt` for non-message nodes). A branch starts at a root or where a
message gains a second child.

## sessions/<session-id>.events.jsonl

Notes live in the session JSON and may be updated freely (like `git notes`).
**Structure changes** are facts and are appended here, one JSON object per line:

```json
{"at":"2026-10-26T10:05:00.000Z","type":"parent","msg":"h3f9…","target":"h2b1…","by":"agent"}
{"at":"2026-10-26T10:06:00.000Z","type":"link","msg":"h3f9…","target":"h1aa…","by":"user"}
{"at":"2026-10-26T10:07:00.000Z","type":"unlink","msg":"h3f9…","target":"h1aa…","by":"agent"}
```

- `type` is `parent`, `link` or `unlink`.
- `msg` is the message whose structure changed; `target` is the parent (or
  `null` for a root) or the other message.
- `by` is `agent` or `user`.
- `at` is when the change was recorded.

Replay is the only read rule: the **last** `parent` event for a message wins,
`link` adds a return, `unlink` removes one. A message with no `parent` event is a
root. Lines are never edited or deleted. A session with no events file (an older
record) keeps rendering from its JSON `parent`/`links`; the first
`session write` that changes its structure seeds the existing facts first.

## conversations/<session-id>.jsonl.gz

The conversation as the drill-down shows it, so it survives the agent deleting
its transcript. The file is a sequence of gzip members, append-only; each member
holds one or more JSON lines:

```json
{"uuid":"…","hash":"h3f9…","at":"…","text":"…","replies":["…"],"tools":{"commands":1,"files":["src/a.ts"],"other":2}}
```

- `uuid` is the transcript's uuid and the idempotency key: a turn already stored
  is not stored again.
- `hash` is the stable message id; a later line with the same `uuid` may add it
  to a turn stored before stable ids.
- `text`, `replies` and `tools` are redacted before writing. Tool output is
  never stored, only counts and edited file paths.

`conversations/` is **local** unless `shareConversations` is on.

## state, locks, inbox, HEAD

- `state/<id>.json`: `{schema, turns, turnsSinceUpdate, recordUpdatedAt}`. Derived
  and machine-local; losing it only restarts the turn count.
- `locks/`: lock directories for the build and for one session's writes.
- `inbox/<id>.json`: where the record skill writes its JSON before
  `cogit session write --file … --consume`. The CLI validates, redacts, merges
  and deletes it.
- `HEAD`: written by the `UserPromptSubmit` hook, local and ignored:
  `{sessionId, transcriptPath?, at?}`. It names the session the next code commit
  carries (see the trailer below). A missing or stale `HEAD` means "no trailer".

## The `Thought:` trailer

A code commit can name the message that led to it with a git trailer:

```
feat(auth): add the login form

Thought: h3f9a2c1b0d4
```

The git `prepare-commit-msg` hook adds it with `git interpret-trailers` when
`.cogit/HEAD` is fresh (within `trailerMaxAgeHours`, default 6) and the
transcript is readable; it uses the newest user message of that session. It is
skipped for merge and squash commits, a local-only record (`gitPolicy: ignore`),
and when the trailer is already present (`--amend`). A failure never blocks the
commit.

Readers must not trust the trailer alone: at read time cogit reads the trailers
back from `git log` (`%(trailers:key=Thought,valueonly)`) and attaches those
commits to their message nodes. A trailer wins over a commit hash the agent also
listed on the node.

The git `pre-commit` hook stages the current session's record
(`sessions/<id>.json` and `.events.jsonl`) when they changed **and** something
else is already staged, so a code commit carries its why and the hook never
creates a record-only commit. `git commit -a`, `git commit <paths>` and a
temporary index (`GIT_INDEX_FILE`) all work.

## What the schemas describe

| File | Describes |
| --- | --- |
| `schema/session.json` | a stored session file |
| `schema/session-input.json` | the JSON the agent sends to `session write` |
| `schema/session-event.json` | one line of the events log |
| `schema/project.json` | `project.json` |
| `schema/config.json` | the global `config.json` |
| `schema/registry.json` | the global `projects.json` |
| `schema/hook-state.json` | `state/<id>.json` |

The schemas use JSON Schema 2020-12. `session-input.json` is generated in
**input** mode (fields with defaults are optional); the others in output mode
(what a written record contains).

Regenerate after a schema change:

```bash
npm run schemas     # writes docs/schema/*.json
```

`./qa` runs the drift test, so a forgotten regeneration fails the gate.
