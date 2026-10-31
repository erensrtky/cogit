<!-- Generated from packages/cli/src/view/settings.ts; edit the texts there. -->

# Settings

Settings are global: one file for every project on this machine
(`~/.config/cogit/config.json`). Change them under **Settings** in the map or the panel,
or with `cogit config set <key> <value>`; `cogit config get` lists them all.

## In the panel

### Recording

`recorder` · default `side`

**How much of the chat goes into the record.**

Economical (recommended): a small model records in the background every few turns and closes each session with one pass that finds its threads, writes the branch summaries and one line on where the session left off. The agent is never interrupted; it costs about a cent per session. Detailed: on top of that, the main agent records its own decisions every 15 turns. It catches the agent's technical choices best and costs about 1–2% of a session. A third mode, where only the main agent records, is set with `cogit config set recorder agent`.

### One-line summary under each message

`messageSummaries` · default `false`

**A sentence under each message title on the map.**

A one-sentence summary under each message title, so a skim reads better. Off keeps the record shorter and cheaper. Branch summaries and the line on where a session left off are written either way.

### Lineage at session start

`startupContext` · default `true`

**Hand the agent the previous session's lineage when a chat starts.**

When a chat starts, the agent gets a short summary of where the previous session left off and how to read the record. It costs a few tokens; turn it off if your projects are unrelated.

### Headless sessions

`recordHeadless` · default `false`

**Record sessions that start without a person, such as `claude -p`.**

Some plugins and scripts run `claude -p` in the background, often once per prompt. Off, cogit leaves those sessions out of the map and the inbox. Turn it on if you do real work through `claude -p` or the SDK and want it recorded.

### Tried-before notes

`tryBeforeNotes` · default `true`

**Before the agent edits a file, tell it which options earlier thoughts rejected for it.**

Before the agent edits a file, it hears which options earlier thoughts tried and rejected for that file. These are notes from the record, never rules; they can make the agent ask before repeating a dead end.

### Intent, Shape and Code

`shapes` · default `true`

**A small picture of what each change does, beside its reason and its diff.**

For every message that landed commits, a small representation of what the change does: numbered plain-language steps or a Mermaid diagram. It sits between the record's intent (the decision, reason and rejected options) and the code (the diff), so a reviewer sees why, what and how in one place. The recorder writes it, not you; it costs one small model call per such message. Off, the map says so and nothing is written.

### Language

`language` · default `auto`

**Language the agent writes records in; `auto` follows the chat.**

The language the record is written in. With auto, it follows the language of the conversation.

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

**When a session ends, the side model records what is left and closes the session.**

When a session ends, the side model records whatever nobody got to, then reads the whole session once to find its threads, write the branch summaries and one line on where it left off. It runs outside the chat, so it does not spend the session's tokens.

### Side model

`sideModel` · default `haiku`

**The small model that records outside the chat.**

The small model behind every side record: every few turns in mixed mode, all the time in side mode, and at session end. Haiku is cheap and good enough for titles, parents and short decisions.

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

Messages whose commits changed at least this many lines get a quiet mark on the map and in the message details. It never hides or ranks anything by itself.

### Trailer age

`trailerMaxAgeHours` · default `6`

**How old the last message may be for a commit to get its `Thought:` trailer.**

A commit made hours after the last message is probably not about that message, so past this age the commit gets no trailer instead of a wrong one.

### Server port

`serverPort` · default `4747`

**Port of the local map server on 127.0.0.1.**

Change it only when another program already uses the port.
