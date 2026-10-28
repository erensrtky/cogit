---
name: record
description: Record or update this session's cogit lineage: one node per user message with what came of it and its parent, branch summaries, and the goal, open items and next step. Use when the user asks to record the session or its lineage, or when a cogit hook asks for an update.
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" *) Edit(/${CLAUDE_PROJECT_DIR}/.cogit/inbox/**)
---

# Record this session's lineage

The current record (`cogit session show`):

!`node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" session show "${CLAUDE_SESSION_ID}" -C "${CLAUDE_PROJECT_DIR}"`

## Check first

- `initialized: false`: reply exactly "cogit is not set up in this project yet; run
  `npx @cogit/cli init` here first." and stop.
- `sessionError`: quote it and stop; never write over the record.
- Nothing new or changed (`newMessages` empty): reply "Lineage is up to date." and stop.

## Look something up

A word rather than a hash: `node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" search "<text>" -C "<dir>"`
scans titles, branch summaries, decisions and stored conversations, newest first (`--json`,
`-n`, `--session`); hashes go to `show`.

## A pull request description

When the user asks for a PR description, run
`node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" pr -C "${CLAUDE_PROJECT_DIR}"` and hand its output
over as it is; do not write one yourself. Only when the user uses `gh`, follow it with
`gh pr create --body "$(node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" pr -C "${CLAUDE_PROJECT_DIR}")"`.

## Send only what is new or changed

One JSON object:

- `sessionId`: always `"${CLAUDE_SESSION_ID}"`.
- `title`: a few words; on the first write or when the focus changed.
- `epoch`: an `epochs` id that fits; a distinct new feature first gets
  `node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" epoch add <id> "<title>" -C "<dir>"`. Omit when unsure.
- `status`: replaces all four fields, so send each: `goal` (one sentence), `done`, `pending`
  (`{ "text", "needsUser": true }` when it waits on the user), `next` (concrete step).
- `nodes`: only new nodes or changed fields; the rest is kept.

## One node per user message

`newMessages` lists unrecorded messages in order with stable `id`, display `label`, time and
text start. Send one `message` node for every one, even "ok"; skip none. If it is `null`, the
transcript is unreadable: send only `status`.

- `id`: the message's `id`; the `label` works too, and a parent or link accepts either.
  `kind`: `"message"`.
- `title`: a few words in the user's wording; never copy a long paste.
- `summary`: what came of it, ONLY when `messageSummaries` is true; otherwise leave it out,
  like a commit with a subject and no body.
- A decision: `decidedBy` (`"user"` or `"agreed"`), `why`, `alternatives`
  (`{ "option", "why" }`).
- Your work belongs to the message that caused it: `work`, `agentDecisions`
  (`{ "title", "why", "alternatives" }`), `commits` (short hashes), `files` (a few paths).
  Work spanning messages goes on the one it ended in; update an earlier node only to correct it.

## Parents

Every message grows from an earlier one; a thread that starts something new is a root.

- Default: the previous message. `parent: null` only if it would work as a new chat's first
  message. Back to an older thread: that message is the parent, the previous one goes in `links`.
- A first message continuing earlier work: `parent` is `<sessionId>:<stable id>`;
  `candidates` lists the last messages of the most recent other sessions. The target must be
  a message of an earlier session of this project.
- Unsure: use the previous message. A wrong "continue" hides a branch; a wrong branch breaks
  the chain.
- `links`: up to 5 earlier messages it builds on besides the parent.
- Correcting is safe: resend the node with the new parent or links; its id and notes stay,
  and an unchanged resend writes nothing.
- Hints, not rules: `gapMinutes`, `resumed`, `commitBetween` (a real commit landed in this
  repo between them), `lastMessages`, and for a first message `candidates`/`continuesHint`.

## Branch summary

A branch starts at a root or where a message gets a second child. Its first message carries a
short `branch`: `{ "title", "asked", "outcome", "open" }`. Write it when the branch ends or
with the status at session end, not every turn. New records send no `phase`, `step`,
`decision` or `question` nodes; old ones keep rendering, leave them alone.

Write titles and text in the conversation's language (`language: "auto"` means it); JSON keys
stay English. Record decisions and reasons, never secrets, tokens, passwords, credentials,
personal data, file contents or command output.

## Write it in two steps

1. Write the JSON to the `inbox` path with the Write tool (no heredoc or `echo`).
2. `node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" session write -C "<dir from the record>" --file "<inbox path>" --consume`

If it fails, fix the JSON according to the error and run it again. Then reply with one short
line, e.g. "Lineage updated (3 nodes)"; never repeat the JSON.
