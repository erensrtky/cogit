# FAQ

Questions people asked after the launch, answered for the current version.

## What it is

### Isn't this just `git log --graph` with a UI?

Same graph, one level up. `git log --graph` shows commits. cogit shows the messages behind them,
including the ones that never became a commit. Open a message that has commits and you get why
it happened, what was decided and turned down, a small diagram of the change (its Shape), then
the diff. `git log` only has what ended up in the commit message.

### Why not write the reason in the commit message?

You can, and it works well when a person writes it. It works less well when an agent writes most
of the commits and the person reviewing wasn't in the chat. "What we tried and dropped" also
doesn't fit in a commit message. cogit takes it from the conversation, so nobody has to
remember to write it.

### Isn't that too much information to be useful?

Nobody should read it start to finish, and you don't have to. It's layered: a commit opens as
Intent, Shape and Code, and often the first two are enough. It's also walkable: each message
hangs from the one it answered, so from any commit you can follow the chain back to what led to
it. Most of the time you ignore it, and you open it when you need to understand something:
`cogit why file:line`, a file on the map, or a pull request description.

### Is it agent memory?

Not mainly. It's a record for you: "why is this line like this?", or reviewing a change you
weren't there for. The agent gets a little of it (see below), but if you want an agent that
recalls things by itself, a memory tool is the better fit, and the two work side by side.

### I already keep a decision log, or I work from specs. What does it add?

A spec holds the plan, and a hand-kept log holds what you chose to write down. Neither holds
what happened on the way: the decisions made mid-chat, the options dropped, and which message
led to which commit. cogit records those as you go, at no effort, but it's a model's reading
of the conversation, while your log is curated. If your log or specs already capture all of it,
cogit adds less; the part it always adds is the step from a message to the exact commit.

## How the record is written

### Isn't the "why" made up after the fact?

It's written while the session runs, from the live conversation. A small side model reads it
every few turns and records each message's decisions and the options it turned down; in
Detailed mode the agent that made the decision adds its own account, and the side model never
overwrites it. When a session ends, the side model reads the whole session once more to split
it into threads and write summaries. That is still the real conversation, but read by a model
that didn't do the work, so the agent's own technical reasons are its weakest part. A Shape is
drawn from the diff: it describes the code, not the reasoning. See
[Recording and cost](recording-and-cost.md).

### Does every "yes" and "try again" become a node?

Yes, each message gets one, but only messages that led to commits link to code, so a "yes" with
no code stays a small row on the map. A commit links to the newest message at that moment,
which is often a "yes", and since each message hangs from the one it answered, you follow it
back to the actual decision.

### Does it tell a correction ("no, don't touch that file") apart from a follow-up?

Not as its own type. A correction gets its own row, attached to the message it reacted to, so
you see where the work changed direction. If the side model reads it as a decision, it also
saves the reason and the dropped option; a quick correction may only get a title.

### Does recording the reason mean the decision was right?

No. A well-documented reason can still be wrong, and cogit doesn't judge decisions. What it
changes is what you can review: what was considered and turned down, not only the diff. A
missing requirement often shows up there as an option nobody raised.

## The agent

### Does it fill the agent's context?

The agent doesn't load the record. It gets a short note when a session starts and, before it
edits a file, a note with at most five options already rejected for that file, once per file
per session. That's what stops it from "simplifying" a line back to an option you turned down.
Both notes can be turned off. The record files are ignored by git, so `git grep` and `rg` don't
pick them up.

### Does the agent hear about decisions made in other files?

Not yet. The note before an edit covers that file only, so a reason recorded against a related
file doesn't reach it. The agent can search the whole record with `cogit search`, but nothing
makes it do so on its own. This is the main weak spot we know of.

## Git and teams

### Where is it stored?

In your own repository, but not in your commits. The files sit in `.cogit/` on your machine,
ignored by git. If you choose to share at `cogit init`, `git push` sends each session to its own
ref outside your branches, and teammates get them with `git pull`. There's no server or account,
and your chats stay on your machine. See [Teams and git](teams-and-git.md).

### Does it rewrite commits or change hashes?

No. The only thing in your commits is a `Thought:` line in the message, added before the commit
is made.

### Does it survive rebase and squash?

A rebase or cherry-pick keeps the link. `git merge --squash` and a squash in `rebase -i` link the
commit to every message folded into it. GitHub's squash button keeps the link if it keeps the
commit messages; a squash that keeps only the pull request title has nothing to read, though
the messages stay in the record and `cogit search` finds them. Details in
[Teams and git](teams-and-git.md#rebase-and-squash).

### What about parallel agents and merges?

Each session records on its own and keeps the worktree and branch it ran in. After a normal
merge, `cogit why file:line` follows `git blame` to the message behind the line that survived.
Two gaps remain: the map doesn't mark messages whose work never landed, and a conflict you
resolve by hand lives in the merge commit, which links to no message, since its reasoning was in
your head rather than in a chat.

### Does the record just keep growing?

`cogit prune --older-than 1y` lists the sessions older than that, asks, and deletes them, from
the remote too when the record is shared.

## Agents and cost

### Does it work with agents other than Claude Code?

Not yet. The Claude-specific code sits behind an agent boundary so others can be added, and the
small model that writes the record would have to be swappable too for local-model setups. Tell
us in an issue which agent you use.

### What does it cost?

The default recording uses a small model through your own Claude Code login; in our measurement
it cost under 2 cents per 20 messages. See [Recording and cost](recording-and-cost.md).

### Is there a paid version?

No. cogit is free and open source, with no account and no server.
