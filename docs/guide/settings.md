<!-- Generated from packages/cli/src/view/settings.ts; edit the texts there. -->

# Settings

Settings are global: one file for every project on this machine
(`~/.config/cogit/config.json`). Change them under **Settings** in the map or the panel,
or with `cogit config set <key> <value>`; `cogit config get` lists them all.

## In the panel

### Recording

`recorder` · default `mixed`

**How much of the chat goes into the record.**

In both modes a small model records in the background every few turns, from a short summary of each turn, and the agent is never interrupted. Quality (recommended): when the session ends, the model your session ran on reopens the whole conversation in the background, with every command it ran, file it read and what it noticed in the code, and corrects the record: its technical decisions, the work and where things stand. Its cache is still warm, so this costs about one more message. Economical: the small model also writes the end of the session, still from the summary: under 2 cents per 20 messages; your messages, your decisions and the threads are recorded just as well, the agent's technical reasons less so. Both close each session with one pass that finds its threads, writes the branch summaries and one line on where the session left off. If the session end is missed (the machine was shut down), the next session closes it with the small model. A third mode, where the agent records everything itself during the chat, is set with `cogit config set recorder agent`.

### One-line summary under each message

`messageSummaries` · default `true`

**A sentence under each message title on the map.**

A one-sentence summary under each message title: what came of it. Without it, a message that only discussed or advised keeps nothing but its title. Off keeps the record shorter and cheaper. Branch summaries and the line on where a session left off are written either way.

### Record at session start

`startupContext` · default `true`

**Hand the agent the previous session's record when a chat starts.**

When a chat starts, the agent gets a short summary of where the previous session left off and how to read the record. It costs a few tokens; turn it off if your projects are unrelated.

### Headless sessions

`recordHeadless` · default `false`

**Record sessions that start without a person, such as `claude -p`.**

Some plugins and scripts run `claude -p` in the background, often once per prompt. Off, cogit leaves those sessions out of the map and the inbox. Turn it on if you do real work through `claude -p` or the SDK and want it recorded.

### Intent, Shape and Code

`shapes` · default `true`

**A small picture of what each change does, beside its reason and its diff.**

For every message that landed commits, a small representation of what the change does: numbered plain-language steps or a Mermaid diagram. It sits between the record's intent (the decision, reason and rejected options) and the code (the diff), so a reviewer sees why, what and how in one place. The recorder writes it, not you; it costs one small model call per such message. Off, the map says so and nothing is written.

### Tasks

`captures` · default `false`

**Work that came up in a session and didn't get finished, caught by the side model when the session closes.**

When a session ends, the side model reads what its record left open and drafts at most three things a person would ask for, in the conversation's language. The list is yours: accept, dismiss or close each item. Sessions with nothing open cost no model call; the map's Tasks button appears only while something waits or is open. Off, nothing is drafted and the list already in the store is kept, not deleted.

### Your turn

`inbox` · default `true`

**The "Your turn" box on the start page and on every map: sessions where the agent answered and waits on you.**

On, the start page and each map list the sessions whose last word is the agent's, or whose record says it needs you, newest waits first. Off, the box is gone everywhere and cogit no longer reads the transcripts for it. Rows you closed with × stay closed when you turn it back on.

### Search by meaning

`semanticSearch` · default `false`

**The map's search also finds messages that mean the same thing in other words, using Ollama on this machine.**

Off, the search finds the words you type. On, cogit asks the embedding model in your local Ollama for a fingerprint of every message once, keeps them in the project's local state (never shared), and ranks the messages closest in meaning first, then the word matches. It needs Ollama running and the model pulled (`ollama pull bge-m3`, about 1.2 GB); nothing leaves this machine and no model call is paid. Works in maps opened with `cogit open`. Change the model with `cogit config set embeddingModel <name>`.

### Language

`language` · default `auto`

**Language the agent writes records in; `auto` follows the chat.**

The language the record is written in. With auto, it follows the language of the conversation.

### Share conversations

`shareConversations` · default `false`

**Send the raw chat text too, not only the session record (off: chat stays local).**

In a project that shares its record, also send the raw chat text. Leave it off to keep conversations on your machine while teammates still see titles, decisions and reasons.

## Only through `cogit config`

These are set up once, per project, or rarely touched, so the panel leaves them out.

### Record every N turns

`updateEveryTurns` · default `15`

**Ask the agent to record after this many turns.**

How often the main agent is asked to update the record inside the chat, in agent mode (15 turns by default). Quality and Economical never ask it.

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

### Embedding model

`embeddingModel` · default `bge-m3`

**The Ollama model behind search by meaning.**

The local Ollama model that turns messages into fingerprints for search by meaning. bge-m3 reads many languages well; a smaller one such as nomic-embed-text is lighter but mostly English. Changing it rebuilds the fingerprints on the next map build.

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
