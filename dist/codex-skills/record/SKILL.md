---
name: record
description: Record or update this session's cogit lineage: one node per user message with what came of it and its parent, branch summaries, and the goal, open items and next step. Use when the user asks to record the session or its lineage, or when a cogit hook asks for an update.
---

# Record this session's lineage

The cogit CLI is `${CODEX_HOME:-$HOME/.codex}/plugins/cache/cogit/cogit/1.5.1/dist/cli.js`. On a shell without `${…:-…}`: this file is `<plugin>/dist/codex-skills/record/SKILL.md` and the CLI is `<plugin>/dist/cli.js`. Run the commands from the session's working directory.

The current record (`cogit session show`):

Run this first and read its output:

```sh
node "${CODEX_HOME:-$HOME/.codex}/plugins/cache/cogit/cogit/1.5.1/dist/cli.js" session show "$CODEX_THREAD_ID" -C .
```

## Check first

- `initialized: false`: reply exactly "cogit is not set up in this project yet; run
  `npx @cogit/cli init` here first." and stop.
- `sessionError`: quote it and stop; never write over the record.
- Nothing new or changed (`newMessages` and `sideRecorded` both empty): reply "cogit is up to
  date." and stop.

## Look something up

A word rather than a hash: `node "${CODEX_HOME:-$HOME/.codex}/plugins/cache/cogit/cogit/1.5.1/dist/cli.js" search "<text>" -C "<dir>"`
scans titles, branch summaries, decisions and stored conversations, newest first (`--json`,
`-n`, `--session`); hashes go to `show`.

## A pull request description

When the user asks for a PR description, run
`node "${CODEX_HOME:-$HOME/.codex}/plugins/cache/cogit/cogit/1.5.1/dist/cli.js" pr -C .` and hand its output
over as it is; do not write one yourself. Only when the user uses `gh`, follow it with
`gh pr create --body "$(node "${CODEX_HOME:-$HOME/.codex}/plugins/cache/cogit/cogit/1.5.1/dist/cli.js" pr -C .)"`.

## Send only what is new or changed

One JSON object:

- `sessionId`: always the record's `sessionId`.
- `title`: a few words; on the first write or when the focus changed.
- `status`: replaces all four fields, so send each: `goal` (one sentence), `done` (a list of
  what finished, as outcomes), `pending` (the work still open, one item per ask in the user's
  words — never a checklist of commands; a release and the restart it needs are one item, and
  a step that serves nothing is dropped; `{ "text", "needsUser": true }` when it waits on the
  user), `next` (concrete step).
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
  (`{ "option", "why" }`). `alternatives` lists only options someone actually named in the
  conversation before the decision: never one inferred from the decision, never the current
  state, and no durations, sizes or reasons the conversation does not contain. An option only
  postponed was not rejected. Only options about the product or the code: not how the work is
  run (which tool or agent does it, this chat or a new one, when to post or release). `"agreed"` needs the user approving the proposal in this message;
  a proposal the user has not answered is not a decision.
- Your work belongs to the message that caused it: `work`, `agentDecisions`
  (`{ "title", "why", "alternatives" }`), `commits` (short hashes), `files` (a few paths);
  `work`, `commits` and `files` are lists of strings.
  Work spanning messages goes on the one it ended in; update an earlier node only to correct it.

## What the side model recorded

`sideRecorded` lists the messages a small background model recorded since you last wrote, with
the decisions it put down as yours. It reads the chat from the outside; you did the work. For
each one, add a technical decision of yours it missed (an approach you chose in the code, a
pitfall you found, what you tried and dropped, and why) or correct one it got wrong, by
resending that node with its `id`, `kind`, `title` and the full `agentDecisions`. Leave the
others alone; never resend one only to confirm it.

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
"shape": { "tools": [{ "kind": "pseudo", "text": "1. ⚡ ...\n2. ƒ ..." }], "commits": ["abc1234"] }
```

Tools (at most three, the ones that say the most; never two that tell the same thing):

- `flow`: a path through code as JSON. Take it whenever data or control crosses more than one
  file or layer, even when the change also reads like a list of steps — it is what the map
  draws best. Every node has a `kind` from the table below and a
  `label` in the project's own words; at most 12 nodes and 16 edges; ids are short lowercase
  words (`a`, `hook`), unique, and every edge names two of them. Set `ordered: true` when
  work is handed between parts over time (a hook → a job → a store, a client → a server): the
  map draws it as a sequence diagram, so keep the edges in time order.

  ```json
  {"kind": "flow", "text": "{\"nodes\":[{\"id\":\"a\",\"kind\":\"event\",\"label\":\"after a commit\"}],\"edges\":[{\"from\":\"a\",\"to\":\"b\",\"label\":\"no\"}],\"ordered\":false}"}
  ```

- `table`: Before / After, one `case | before | after` line per case (at most 8), for a
  change someone can see: a fix, a new default, a rule that now says yes or no.
- `interface`: one `item | before | after` line per command, flag, exported function, config
  key or stored schema field that changed, only what is reached from outside the module;
  `—` for nothing.
- `example`: one concrete case with real values, each result on its own line after `→`. A new
  or changed command or flag always gets one that runs it.
- `pseudo`: numbered plain-language steps for logic that stays inside one function or module,
  with no path across files to draw; each starts with the symbol of its kind after its number
  (`1. ⚡ After a commit, …`), naming the functions and files.

Kinds (one per Flow node, and the symbol a step starts with; the map draws the symbol, you
never draw it):

| id | symbol | name | means |
|---|---|---|---|
| fn | ƒ | Function | a function or method |
| var | x | Variable | a variable, field or setting |
| cond | ◇ | Condition | a question the code asks; its arrows are the answers |
| loop | ↻ | Loop | repeats for each item |
| event | ⚡ | Event | something that starts the work: a hook, a click, a timer |
| store | ▤ | Data store | a file, database, queue or cache that keeps data |
| type | ▭ | Type | a type, class or schema |
| ext | ◎ | External system | another program or service: git, a browser, an API, an AI model |
| person | ☺ | Person | someone using it |
| async | ⇢ | Background job | work started without waiting for it |
| out | ↩ | Output | what is returned or shown |
| error | ✕ | Error | an error or a refusal |

A Flow node's label names the thing in the project's own words (`shape-queue.ts`,
`enqueueShape()`), never a role word — the symbol already says what kind it is. Tables have
no header row. Order the tools diagram, tables, example, steps.

`{ "tools": [] }` means nothing worth showing: give it for a change nobody would notice from
outside (a refactor, a rename). Skip messages whose commits are only release/version bumps,
lockfiles or CHANGELOG, or change fewer than 5 lines in total. Write it in the conversation's
language; the CLI validates each output and keeps an invalid output as text.

## Branch summary

A branch starts at a root or where a message gets a second child. Its first message carries a
short `branch`: `{ "title", "asked", "outcome", "open" }`, each one string (`open` too, not a list). Write it when the branch ends or
with the status at session end, not every turn. New records send no `phase`, `step`,
`decision` or `question` nodes; old ones keep rendering, leave them alone.

Write titles and text in the conversation's language (`language: "auto"` means it); JSON keys
stay English. Record decisions and reasons, never secrets, tokens, passwords, credentials,
personal data, file contents or command output.

## Write it in two steps

1. Write the JSON to the `inbox` path with your file editing tool (no heredoc or `echo`).
2. `node "${CODEX_HOME:-$HOME/.codex}/plugins/cache/cogit/cogit/1.5.1/dist/cli.js" session write -C "<dir from the record>" --file "<inbox path>" --consume`

If it fails, fix the JSON according to the error and run it again. Then reply with one short
line, e.g. "cogit updated (3 nodes)"; never repeat the JSON.
