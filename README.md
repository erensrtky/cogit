<p align="center"><img src="docs/images/cogit-mark.svg" width="96" alt="cogit"></p>

# cogit

Git remembers what changed. cogit remembers why.

<p align="center"><img src="docs/images/cogit-descartes.jpg" width="360" alt="René Descartes with git branches running through his hair"><br><i>Cogito, ergo commit.</i></p>

cogit records every message you send to an AI coding agent as a *thought commit*: what you
asked, what came of it, and the message it answered. Your code commits point back to the
thought behind them, so `git log` tells you what changed and cogit tells you why. It works with
Claude Code today.

It runs as a Claude Code plugin and works through Claude Code hooks, so the record is written
while you work, not reconstructed from the diff afterwards.

<img src="docs/images/map.png" alt="The map: sessions as a git graph, each with its messages, branches, commit chips and a left off here marker">

*Your sessions as a git graph — one row per message, the decision behind it, and where you left
off.*

<img src="docs/images/shape.png" alt="A message opened on its Shape tab: a flowchart of what the change does, under the tabs Intent, Shape and Code">

*A message that landed commits opens as Intent, Shape and Code: why it happened, a picture of
what the change does, and the diff.*

<img src="docs/images/tasks.png" alt="The Tasks panel: suggested items with Accept and Dismiss, open items with Done, and a Done section">

*Tasks — what your sessions left undone, drafted when a session closes. You accept, dismiss or
close each one.*

<img src="docs/images/files.png" alt="The Files view: a changed file opened, listing the messages that touched it with each message's reason and the option it rejected">

*A changed file opens its history: every message that touched it, and the reason behind each —
including the option that was rejected.*

**[Click through a saved map](https://erensrtky.github.io/cogit/demo/)** — no install, no server:
the same page `cogit open` writes, built from sample data. Read-only, so the Tasks buttons are
inert.

## What it does

- **Every message becomes a thought commit**: the question, the outcome, the decisions with
  their reasons and the options that were rejected, and which earlier message it continues.
- **A map of your sessions**: a git graph of your conversations with branches, decisions, a
  "Your turn" inbox, and Resume and Fork buttons that copy the command to reopen a chat or
  continue it as a new one.
- **Commits point back to their reason**: a `Thought:` trailer on each commit;
  `cogit show <sha>`, `cogit blame` and `cogit why` follow it back.
- **Intent, Shape, Code**: a message that landed commits shows why it happened, a small
  picture of what the change does (a diagram, a before/after or interface table, an example
  or plain steps), and the diff, in one place.
- **Tasks**: when a session ends, a small model drafts a few user-level items from what it
  left undone; you accept, dismiss or close them (`cogit captures`, and on the map).
- **Pull request descriptions with the decisions**: `cogit pr` writes the goal, the
  decisions and the rejected options, never the raw chat.
- **Teams share the record through git**: after a pull, your teammates' sessions are on the
  map too, with who ran them and what changed most.
- **The agent remembers**: a new session starts where the last one left off, and before
  editing a file the agent hears what was already tried and rejected there.
- **Cheap by default**: a small side model records in the background; in our sessions it
  cost about 1–2% of a session's tokens.
- **No server, no account**: it runs on your machine. Your chats are not committed. The record
  (titles, decisions and reasons) is, so it travels with your branch; `cogit init` lets you keep
  it local instead. Key and token patterns are redacted.

## Why

I've been building with coding agents for about two years, and the whole time I felt something
was slipping away. When you write code yourself, it sinks in bit by bit: you know why that table
exists and why you wrote that class. When an agent writes it, that feeling goes away.

The information isn't really gone. It sits in your messages, the agent's replies and your commits,
just in separate places. cogit ties them together, so you can always walk back and see why
something was done. It helps most when you juggle projects: I run 5-10 agents at once across 2-3
of them, and a few minutes later I can lose track of what I did where.

The problem is bigger than one person's memory. In a working paper on 718 firms, agents brought
23% more pull requests and 49% longer time to merge, with no significant rise in finished work.
A reviewer sees what changed, not why. [More, with sources](docs/guide/why.md).

## Install

You need Node 22.13+, Claude Code 2.1.275+ and a git repository.

```bash
npm install -g @cogit/cli
```

Then, in Claude Code:

```text
/plugin install cogit --marketplace erensrtky/cogit
```

To get plugin updates on their own, turn on auto-update once: `/plugin` → Marketplaces →
cogit → Enable auto-update. Claude Code leaves it off for marketplaces outside its own.

If the map stays empty, run `cogit doctor`.

## Quick start

```bash
cd your-project
cogit init        # a few questions: git, transcript retention, team setup, language
```

Work with Claude Code as usual; recording needs nothing from you. Then open the map:

```bash
cogit open .
```

## Guide

- [Getting started](docs/guide/getting-started.md): what `init` asks, your first session,
  setting up a team
- [The map](docs/guide/map.md): sessions, branches, the inbox, files, search,
  resuming and forking a session
- [Reading the lineage](docs/guide/reading-the-lineage.md): `log`, `show`, `blame`, `why`,
  `search`
- [Pull requests](docs/guide/pull-requests.md): `cogit pr`
- [Teams and git](docs/guide/teams-and-git.md): what is committed, the trailer, the hooks
- [Recording and cost](docs/guide/recording-and-cost.md): who writes the record, what it
  costs
- [Privacy](docs/guide/privacy.md): what is recorded and what never leaves your machine
- [Settings](docs/guide/settings.md): every setting, explained
- [Troubleshooting](docs/guide/troubleshooting.md)
- [Why cogit](docs/guide/why.md): AI made code faster and review slower

The record format is in [docs/format.md](docs/format.md).

## Licence

MIT — see [LICENSE](LICENSE).
