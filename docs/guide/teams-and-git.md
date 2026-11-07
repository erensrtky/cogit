# Teams and git

cogit keeps its record in `.cogit/` on your machine and ties it to your commits. The record never
enters a commit, so your branches, pull requests and `git status` show only code.

## What is shared

`init` asks whether to share the record with your team. The answer is per project, and no answer
means no.

| | Shared | Private (default) |
|---|---|---|
| `.cogit/sessions/` (the record) | sent with `git push`, outside your branches | stays here |
| `.cogit/conversations/` (raw chat) | stays here, unless `shareConversations` is on | stays here |
| `.cogit/project.json`, `.cogit/.gitignore` | committed: they mark the project for a clone | ignored |
| Local state: map, inbox, locks, `HEAD` | ignored | ignored |

In a private project, one `/.cogit/` line in the root `.gitignore` hides all of it.

```bash
cogit config git           # this project's setting
cogit config git share     # switch it
cogit config git ignore
```

Switching never deletes a record. Switching to `ignore` stops sending; what the repository already
holds stays there until you `cogit prune` it.

### Where it goes

Each session sits on its own ref in your repository: `refs/cogit/sessions/<id>`. A normal clone
does not download them, so someone without cogit gets a clone of the usual size and never sees
them. They do not appear in `git log --all` or `git branch`, nor in a pull request or on GitHub's
pages, which also means the record cannot be read there: reading it takes cogit.

- **Sending:** `git push` to `origin` (or your only remote) prints how many records will follow,
  and they go in the background once the push has landed. It never slows the push, never asks
  for anything and never fails it. A rejected push sends nothing, and neither does `git push --dry-run`: cogit reads it from the running `git` on Linux and macOS. On Windows a `--dry-run` with nothing new to push still sends. What could not
  be sent stays queued, the next session start tries again, and `cogit doctor` tells you why;
  `cogit record-sync send` sends the queue right away.
  Pushing to any other remote, such as a deploy target, sends nothing.
- **Receiving:** the first time cogit runs in a clone, it adds one fetch line to that clone's
  `.git/config` and downloads the team's records, showing progress in a terminal. After that a
  plain `git pull` brings them, even when no code changed. Each new record adds a line to its
  output.
- **Your own unsent work:** a pull never overwrites a session of yours that you have changed and
  not sent. A teammate's session follows its owner: a change you make to it here is replaced by
  their next update, since only they can send it. A `git clean -fdx` does not lose anything
  either: the refs hold a copy and cogit puts the files back.
- **Only your own sessions go out:** a session is sent by the person it is stamped with.

Records follow the repository, not the branch: a session stays on the map after its branch is
deleted, and shows which branch it ran on.

A pull request from a fork brings the code but not the record, which went to the fork.

### Deleting old sessions

```bash
cogit prune --older-than 1y --dry-run   # what would go
cogit prune --older-than 1y             # lists them, asks, then deletes
```

It deletes your own sessions here and in the repository, and only when you run it; add `--all` to
include teammates'. It cannot be undone. Copies already on teammates' machines stay until they
delete them. If the repository cannot be reached, nothing is deleted.

### Coming from a version that committed the record

Older versions committed `.cogit/sessions/`. After upgrading, stop tracking them once, in one
clone, or they keep showing in `git status`. The upgrade also rewrote `.cogit/.gitignore`; commit
it in the same step, or teammates and new clones see `.cogit/sessions/` as untracked:

```bash
git rm -r --cached .cogit/sessions
git add .cogit/.gitignore
git commit -m "chore: stop tracking the cogit record"
```

That commit makes `git pull` delete the files from teammates' disks. cogit brings them back from
history the next time it runs, for them and for new clones, so nothing is lost and nothing is
sent again. Sessions recorded after the upgrade travel the new way. Old commits keep the files
they had, so the repository's size does not shrink. `cogit doctor` reminds you until this is done.

## The git hooks

`init` adds a block to three git hooks in your clone (and follows `core.hooksPath`, so Husky
setups work). The block never fails a commit or a push. It sits right under the first line, so
an early `exit` in your own lines cannot skip it, and your hook's exit status stays the hook's.
A hook written in another language (Python, Node) is left alone, and `cogit doctor` says so.
Husky rewrites its hooks folder on every `npm install`; cogit puts its block back on your next
chat message. After `cogit hooks uninstall` it does not, until `cogit hooks install`.

- **`prepare-commit-msg`** adds a `Thought: h<id>` trailer naming the message the commit came
  from: the newest message of the current session. It is skipped for merges and squashes, while
  a rebase or cherry-pick replays old commits, and when the last message is older than
  `trailerMaxAgeHours` (6 hours), since such a commit is probably not about that message. It
  runs after your own lines, so a tool that rewrites the message (commitizen) keeps it.
- **`post-commit`** starts the commit's Shape in the background.
- **`pre-push`** sends the session records of a project that shares them. It reads the list of
  pushed refs git gives the hook and hands it on to your own lines unchanged.

### Rebase and squash

The link names a message, not a commit hash, so it follows the commit message:

- **Rebase, cherry-pick:** the link stays, though the hash changes.
- **`git merge --squash`, a squash in `rebase -i`:** the commit links to every message it folded
  in, and `cogit why`, `blame` and the map show them all.
- **GitHub's squash button:** depends on the commit message it writes. A pull request with one
  commit keeps its message by default. With several, choose "Pull request title and commit
  details" in the repository's settings. A squash that keeps only the title has no link to read;
  the messages stay in the record, and `cogit search` still finds them.

```bash
cogit hooks install      # add or refresh the block
cogit hooks uninstall    # remove only the cogit block
```

## Working as a team

1. One person runs `cogit init`, answers yes to sharing, and commits `.cogit/.gitignore`,
   `.cogit/project.json` and `.claude/settings.json`.
2. Everyone installs the CLI and runs `cogit init` once in their clone. It sees the project is
   set up, registers it on their machine and installs the git hooks.
3. Each person's sessions go out with their `git push`. After a pull, teammates' sessions
   appear on the map with their author, most recent first.

A session belongs to the person who recorded it: cogit stamps it with their git `user.name`
and `user.email`, and like git it tells people apart by email. Your sessions only ever
continue your own earlier sessions; a teammate's session is never taken for the start of
yours, so everyone's line of thought stays their own on the map.

On the map a teammate's session shows their name (yours shows none), and the toolbar's
Everyone / You / teammate choice fades everyone else's sessions while keeping them in place.

Raw conversations stay on each author's machine unless they turn `shareConversations` on, so
teammates see the record (titles, decisions, reasons) but not the chat itself.

## Worktrees

Sessions in a linked git worktree (`claude -w`) record into the main checkout's `.cogit/`, so
they outlive the worktree. The details show which worktree and branch a session ran in.
