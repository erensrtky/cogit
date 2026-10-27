<!-- Generated from packages/cli/src/view/settings.ts; edit the texts there. -->

# Settings

Settings are global: one file for every project on this machine
(`~/.config/cogit/config.json`). Change them under **Settings** in the map or the panel,
or with `cogit config set <key> <value>`; `cogit config get` lists them all.

## In the panel

### Recording mode

`recorder` · default `mixed`

**Who writes the record: a side model, the main agent, or both.**

Who writes the record. Mixed (recommended): a small side model records every few turns and the main agent still checks in every 15 turns to record its own decisions; measured on real sessions this costs about 1–2% of a session. Main agent: the agent records its own work every few turns, which costs about 5% of a session but catches its technical decisions best. Side model only: a small model records everything in the background and the agent is never interrupted.

### Message summaries

`messageSummaries` · default `false`

**Write a one-line summary for each recorded message.**

A one-sentence summary under each message title, so a skim reads better. Off keeps the record shorter and cheaper.

### Lineage at session start

`startupContext` · default `true`

**Hand the agent the previous session's lineage when a chat starts.**

When a chat starts, the agent gets a short summary of where the previous session left off and how to read the record. It costs a few tokens; turn it off if your projects are unrelated.

### Tried-before notes

`tryBeforeNotes` · default `true`

**Before the agent edits a file, tell it which options earlier thoughts rejected for it.**

Before the agent edits a file, it hears which options earlier thoughts tried and rejected for that file. These are notes from the record, never rules; they can make the agent ask before repeating a dead end.

### Language

`language` · default `auto`

**Language the agent writes records in; `auto` follows the chat.**

The language the record is written in. With auto, it follows the language of the conversation.

### Record every N turns

`updateEveryTurns` · default `15`

**Ask the agent to record after this many turns.**

How often the main agent is asked to update the record inside the chat. In mixed mode the side model records in between, so this can be rare (15 turns by default).

### Side model every N turns

`sideEveryTurns` · default `5`

**How often the background recorder writes in mixed or side mode.**

How often the small side model records in the background. A lower number keeps the map fresher and costs a little more; a higher number is quieter.

### Side model at session end

`sessionEndCatchUp` · default `true`

**When a session ends, the side model records the messages still unrecorded.**

When a session ends, the side model records whatever nobody got to. It runs outside the chat, so it does not spend the session's tokens.

### Side model

`sideModel` · default `haiku`

**The small model that records outside the chat.**

The small model behind every side record: every few turns in mixed mode, all the time in side mode, and at session end. Haiku is cheap and good enough for titles, parents and short decisions.

### Share conversations

`shareConversations` · default `false`

**Commit the raw chat text too, not only the session record (off: chat stays local).**

Also commit the raw chat text, not only the record. Leave it off to keep conversations on your machine while the record still travels with the branch.

### Commit the record

`recordCommit` · default `ask`

**ask, auto or off: what to do with the last messages after the last code commit.**

What happens to record changes made after your last code commit: ask you next time, commit them automatically, or leave them for you to commit.

## Only through `cogit config`

These are set up once, per project, or rarely touched, so the panel leaves them out.

### Git policy

`gitPolicy` · default `commit`

**What `cogit init` offers a new project: commit the record to git, or ignore it.**

Only the default for new projects: each project answers it during `cogit init`. `cogit config git` shows the current project's policy and `cogit config git commit` or `ignore` switches it.

### Agents

`agents` · default `claude-code`

**Which agents record lineage; change it with `cogit config set`.**

Which AI agents in this project should record what they are asked and what they decide. Claude Code is the only one today.

### Inbox age

`inboxMaxAgeDays` · default `1`

**Days a waiting session stays in the "Your turn" inbox.**

A session that waits on you longer than this leaves the inbox. It is hidden, not deleted: the map still has it.

### Big change

`bigChangeLines` · default `300`

**Lines of code after which a message counts as a big change on the map.**

Messages whose commits changed at least this many lines get a quiet highlight in the unread list. It never hides or ranks anything by itself.

### Trailer age

`trailerMaxAgeHours` · default `6`

**How old the last message may be for a commit to get its `Thought:` trailer.**

A commit made hours after the last message is probably not about that message, so past this age the commit gets no trailer instead of a wrong one.

### Server port

`serverPort` · default `4747`

**Port of the local map server on 127.0.0.1.**

Change it only when another program already uses the port.
