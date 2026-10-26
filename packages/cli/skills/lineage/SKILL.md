---
name: lineage
description: Record or update this session's lineage for codelineage, one node per user message with what came of it, each hanging from the earlier message it reacts to, with a summary at each branch start, plus the goal, open items and what comes next. Use it when the user asks to record the session or its lineage, or when a codelineage hook asks for an update.
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" *) Edit(/${CLAUDE_PROJECT_DIR}/.codelineage/inbox/**)
---

# Record this session's lineage

This is the current record for this session (the output of `codelineage session show`):

!`node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" session show "${CLAUDE_SESSION_ID}" -C "${CLAUDE_PROJECT_DIR}"`

## First, check the record

- If `initialized` is `false`, reply with exactly this line and stop:
  "codelineage is not set up in this project yet; run `npx codelineage init` here first."
- If `sessionError` is set, tell the user the session record is unreadable and
  quote the error. Then stop. Never write over it.
- If `newMessages` is empty and nothing else changed since the record was last
  updated, reply "Lineage is up to date." and stop.

## Looking something up

When the user asks where something was discussed or decided, or gives a word
rather than a hash, do not guess: run
`node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" search "<text>" -C "${CLAUDE_PROJECT_DIR}"`.
It scans message titles, branch summaries, decisions and the stored conversation,
newest first, with the same matcher as the map's search box. Add `--json` for
fields, `-n <count>` to limit and `--session <id|prefix>` to narrow. A message
hash goes to `show`, not `search`.

## Then send only what is new or changed

Build one JSON object:

- `sessionId`: always `"${CLAUDE_SESSION_ID}"`.
- `title`: a few words naming what this session is about. Send it on the first
  write, or when the session's focus changed.
- `epoch`: the `id` of the epoch (feature or epic) from `epochs` that this work
  belongs to. If none fits and the work is a distinct feature, first run
  `node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" epoch add <id> "<title>" -C "<dir>"`
  with a short lowercase id. Leave it out when unsure.
- `status`: replaces the stored status, so send all four fields every time:
  - `goal`: one sentence.
  - `done`: short items finished in this session so far.
  - `pending`: `{ "text": "…", "needsUser": true }` for anything waiting on the
    user, and `needsUser: false` for work that is simply not done yet.
  - `next`: the next concrete step.
- `nodes`: only new nodes, or existing ones whose fields changed. Nodes you
  leave out are kept, and so are fields you leave out.

## The map is the user's messages

Each message the user wrote is one node on the map. `newMessages` in the record
lists the user's messages that have no node yet, in order, each with a stable
`id` (`h…`), the `label` the user reads (`m1`, `m2`, …), its time and the start
of its text. Send one `message` node for every one of them; skip none, even a
short "ok" or "go on".

- `id`: the message's `id` from `newMessages`. The `label` (`m1`) is accepted
  too, and so is either form for a parent or link: the CLI maps it to the stable
  id. The stable id never changes when a parent is corrected.
- `kind`: `"message"`.
- `parent`: the id (or label) of the earlier message it reacts to (see below),
  or `null` for a new root.
- `title`: the message in a few words, in the user's own wording where possible
  ("Continue with Epic 4", "Why does auto mode keep stopping?"). Never copy a
  long paste; name what it is.
- `summary`: one or two sentences on what came of it: the answer, the result or
  the state it left. Write it ONLY when `messageSummaries` in the record is
  `true`; while it is `false` (the default) leave `summary` out, like most git
  commits: a subject line, no body. `decidedBy`, `why` and `alternatives` are
  written either way.
- When the message itself made a decision (the user asked for something, picked
  an option or approved a proposal): `decidedBy` (`"user"` or `"agreed"`), the
  reason in `why`, and the options not taken in `alternatives`, each as
  `{ "option": "…", "why": "…" }`.
- Your own work goes inside the message node that caused it, never in nodes of
  its own:
  - `work`: short items for what you did (looked up, changed, tested).
  - `agentDecisions`: choices you made on your own while doing it, each as
    `{ "title": "…", "why": "…", "alternatives": [ … ] }`.
  - `commits`: short hashes of the commits that carry it out; `files`: the main
    files it touched, relative to the project (a few, not every file).
- Work that continued over several messages belongs to the message where it
  ended up; update an earlier message node only to correct it.

If `newMessages` is `null`, the transcript could not be read. Then record only
`status` and leave the nodes alone.

## Hang each message from the one it reacts to

The map is a git-like graph of the user's messages: every message grows from an
earlier one, and a thread that starts something new is a root.

- Default: `parent` is the previous message. Most messages react to the last
  answer.
- `parent: null` only when the message would make sense as the first message of
  a new chat and does not rely on the previous answer.
- An explicit return to an older thread ("back to the representation question"):
  set `parent` to that thread's message and put the previous message in `links`.
- The FIRST message of a session that continues earlier work hangs from the
  message it continues: write `parent` as `<sessionId>:<stable id>`. `candidates`
  in the record lists the last messages of the most recent other sessions for
  this. Usually that is the last message of the previous session, or the one that
  asked for a prompt for the next chat. A first message that starts something new
  is a root. The target must be a message of an earlier session of this project.
- When unsure, use the previous message. A wrong "continue" only hides a branch;
  a wrong branch breaks the chain.
- `links`: up to 5 earlier messages of this session that this one returns to or
  builds on besides its parent. They show as dashed arrows. The CLI drops a
  link or parent that is not an earlier message, so a mistyped one is not fatal.
- Correcting a parent or a link later is safe and is recorded as a new fact: the
  message keeps its id and its notes. Send the node again with the new `parent`
  or `links`; resending an unchanged node writes nothing.
- `newMessages` hints help, but are hints, not rules: `gapMinutes` since the
  previous message, `resumed` (a `/clear`, a resume or a new process came in
  between), `commitBetween` (this session committed between them). The wording
  decides. `lastMessages` lists the last recorded messages with their stable
  `id`, `label` and parent.
- For a session's first message, `candidates` names the message it may continue
  (with its session and stable `id`) and `continuesHint` is set when the message
  says so ("devam", "kaldığımız yerden", "continue") or the transcript read a
  handoff file. A hint only: an unrelated first message stays a root.

## Summarize each branch

A branch starts at a root or where a message gets a second child. Its first
message carries a `branch` object, short, in the conversation's language:

```json
{
  "title": "What this thread is about, in a few words",
  "asked": "What the user set out to do in this thread",
  "outcome": "What came of it, so far",
  "open": "What is still open; may be empty"
}
```

- Write or update it when the branch ends (a new branch or root starts, or a
  message returns to an older thread) or when you update the session status at
  the end — not on every turn, to keep the update cheap.
- Only the first message of a branch carries a `branch`.

New records send no `phase` nodes: topics are no longer the skeleton. Old
records that still have `phase`, `step`, `decision` and `question` nodes keep
rendering; leave them as they are and do not add new ones.

Write titles and text in the conversation's language when `language` is `"auto"`,
and in that language otherwise. JSON keys stay in English.

Record decisions and their reasons, not raw content. Never include secrets,
tokens, passwords, credentials, personal data, file contents or command output.

## Write it in two steps

1. Use the Write tool to save the JSON object to the `inbox` path from the record.
   Do not pass JSON through the shell: heredocs and `echo` with JSON are blocked.
2. Run exactly this command:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" session write -C "<dir from the record>" --file "<inbox path>" --consume
```

If it fails, fix the JSON file according to the error and run the command again.
Then reply with one short line, for example "Lineage updated (3 nodes)". Do not
repeat the JSON.
