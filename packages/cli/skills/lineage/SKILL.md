---
name: lineage
description: Record or update this session's lineage for codelineage, one node per user message with what came of it, grouped by topic, plus the goal, open items and what comes next. Use it when the user asks to record the session or its lineage, or when a codelineage hook asks for an update.
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
lists the user's messages that have no node yet, in order, with their id (`m1`,
`m2`, …), time and the start of their text. Send one `message` node for every
one of them; skip none, even a short "ok" or "go on".

- `id`: exactly the message's id from `newMessages`. The CLI takes the time from
  the transcript, so do not send `at`.
- `kind`: `"message"`.
- `parent`: the id of the topic it belongs to (see below).
- `title`: the message in a few words, in the user's own wording where possible
  ("Continue with Epic 4", "Why does auto mode keep stopping?"). Never copy a
  long paste; name what it is.
- `summary`: one or two sentences on what came of it: the answer, the result or
  the state it left. Someone returning days later should understand it without
  the conversation.
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

## Group the messages by topic

The map opens like layers of an onion: first the session's topics, then a click
reveals the messages inside each one, in the order they were written.

- A topic is a node with `kind: "phase"`, an `id` of your choice (a short slug,
  never `m` followed by a number), a `title` naming what the work is about, such
  as "Permissions" or "Map layout", never when it happened, and `parent: null`
  for a top-level topic.
- Put each message under the topic it belongs to. Open a sub-topic (a `phase`
  whose parent is a topic) once a topic holds several distinct threads.
- Reuse an existing topic before creating a new one. If an earlier node sits
  under the wrong topic, send it again (with its `kind` and `title`) and the
  right `parent`.
- Keep the top level short: a handful of topics per session.
- Records from before messages became the nodes also hold `step`, `decision`
  and `question` nodes. Leave them as they are and do not add new ones.

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
