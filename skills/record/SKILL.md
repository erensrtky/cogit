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
  `candidates` lists the most recent other sessions: where each left off (`leftOff`), its
  branches with the message each ends at (`last`), and its last messages. Read `leftOff`
  first, then the branches; the usual target is a branch's `last`. The target must be a
  message of an earlier session of this project.
- `forkedFrom` (a forked session): the first message's parent is that value; no candidates
  are listed, and the CLI sets it when you send none.
- Unsure: use the previous message. A wrong "continue" hides a branch; a wrong branch breaks
  the chain.
- `links`: up to 5 earlier messages it builds on besides the parent.
- Correcting is safe: resend the node with the new parent or links; its id and notes stay,
  and an unchanged resend writes nothing.
- Hints, not rules: `gapMinutes`, `resumed`, `commitBetween` (a real commit landed in this
  repo between them), `lastMessages`, and for a first message `candidates`/`continuesHint`.

## Shape

A message that landed commits gets a `shape`: a small representation of what the change does,
between its Intent (the decision and reason above) and its Code (the diff). Add it on that
message's node, with the node's commit hashes:

```json
"shape": { "tools": [{ "kind": "pseudo", "text": "1. ...\n2. ..." }], "commits": ["abc1234"] }
```

Tools (at most three, the ones that say the most; never two that tell the same thing):

- `mermaid`: a Mermaid `flowchart TD` (or `LR`) of a path through code, at most 10 nodes.
  Quote labels that hold spaces or punctuation.
- `sequence`: a Mermaid `sequenceDiagram` when work is handed between actors over time (a hook
  starting a job, a client and a server, a queue drained later), at most 6 participants.
- `table`: Before / After, one `case | before | after` line per case (at most 8), for a
  change someone can see: a fix, a new default, a rule that now says yes or no.
- `interface`: one `item | before | after` line per command, flag, exported function, config
  key or stored schema field that changed, only what is reached from outside the module;
  `—` for nothing.
- `example`: one concrete case with real values, each result on its own line after `→`. A new
  or changed command or flag always gets one that runs it.
- `pseudo`: numbered plain-language steps of the new logic, naming the functions and files.

Write names the same way in every tool: a role in plain words (`Git`, `cogit`, `Record`), a
file with its extension (`session.ts`), a function with `()`, a field with its owner
(`node.commits`), a command after `$`, printed text in quotes. In a diagram, name actors and
boxes by role with the code name in parentheses (`Queue (shape-queue.ts)`) and label arrows
with plain verbs. Tables have no header row. Order the tools diagram, tables, example, steps.

`{ "tools": [] }` means nothing worth showing: give it for a change nobody would notice from
outside (a refactor, a rename). Skip messages whose commits are only release/version bumps,
lockfiles or CHANGELOG, or change fewer than 5 lines in total. Write it in the conversation's
language; the CLI validates each output and keeps an invalid diagram as text.

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
