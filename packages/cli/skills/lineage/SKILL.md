---
name: lineage
description: Record or update this session's lineage for codelineage, covering the goal, the decisions and their reasons, the steps, open questions and what comes next. Use it when the user asks to record the session or its lineage, or when a codelineage hook asks for an update.
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
- If nothing meaningful happened since the record was last updated, reply
  "Lineage is up to date." and stop.

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
- `nodes`: only new nodes, or existing ones whose title, summary, reason or
  parent changed. Nodes you leave out are kept, and so are fields you leave out.
  - `id`: a short, stable slug. Reuse an existing id to change that node.
  - `kind`: `phase` (a topic), `step` (a concrete action), `decision` (a choice
    that was made, with the reason in `why`) or `question` (an open question).
  - `parent`: the id of the topic the node belongs to, or `null` for a
    top-level topic.
  - `title`: up to about ten words. `summary` and `why`: one or two sentences.

## Organize the nodes by topic, not by time

The map opens like layers of an onion: first the session's top-level topics,
then a click reveals what is inside each one. Order within a layer is the order
in which things were added, so time is kept inside every topic.

- A topic (`phase`) names what the work is about, such as "Permissions" or "Map
  layout", never when it happened ("First part", "Open decisions").
- Put each new step, decision or question under the topic it belongs to. Open
  a sub-topic (a `phase` whose parent is a topic) once a topic holds several
  distinct threads; nest as deep as the work needs.
- Reuse an existing topic before creating a new one. If an earlier node sits
  under the wrong topic, send it again (with its `kind` and `title`) and the
  right `parent`.
- Keep the top level short: a handful of topics per session.

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
