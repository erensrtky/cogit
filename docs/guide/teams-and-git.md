# Teams and git

cogit keeps its record in `.cogit/` next to your code and ties it to your commits.

## What is committed

`init` asks whether to commit the record. The answer is per project.

| | Commit (default) | Ignore |
|---|---|---|
| `.cogit/sessions/`, `.cogit/project.json` (the record) | committed | ignored |
| `.cogit/conversations/` (raw chat) | ignored, unless `shareConversations` is on | ignored |
| Local state: map, inbox, locks, `HEAD`, read marks | ignored | ignored |

Under the commit policy, `.cogit/.gitignore` decides what stays local. Under the ignore policy,
one `/.cogit/` line in the root `.gitignore` hides all of it.

```bash
cogit config git           # this project's policy
cogit config git commit    # switch it
cogit config git ignore
```

Switching never deletes a record; switching to ignore leaves what git already tracks alone.

## The git hooks

`init` adds a block to two git hooks in your clone (and follows `core.hooksPath`, so Husky
setups work). The block never fails a commit.

- **`prepare-commit-msg`** adds a `Thought: h<id>` trailer naming the message the commit came
  from: the newest message of the current session. It is skipped for merges and squashes, and
  when the last message is older than `trailerMaxAgeHours` (6 hours), since such a commit is
  probably not about that message.
- **`pre-commit`** stages the current session's record with your code commit. It never creates
  a record-only commit.

`recordCommit` decides what happens to messages recorded after your last code commit: `ask`
(the next session start offers to commit them), `auto`, or `off`.

```bash
cogit hooks install      # add or refresh the block
cogit hooks uninstall    # remove only the cogit block
```

## Working as a team

1. One person runs `cogit init` with the team setup and commits `.cogit/` and
   `.claude/settings.json`.
2. Everyone installs the CLI and runs `cogit init` once in their clone. It sees the project is
   set up, registers it on their machine and installs the git hooks.
3. Each person's sessions are committed with their code. After a pull, teammates' sessions
   appear on the map with their author, and "Unread" lists what changed most.

Raw conversations stay on each author's machine unless they turn `shareConversations` on, so
teammates see the record (titles, decisions, reasons) but not the chat itself.

## Worktrees

Sessions in a linked git worktree (`claude -w`) record into the main checkout's `.cogit/`
under the ignore policy, and into the worktree's own copy under the commit policy. The
details show which worktree and branch a session ran in.
