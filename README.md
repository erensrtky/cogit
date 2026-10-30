<p align="center"><img src="docs/images/cogit-mark.svg" width="96" alt="cogit"></p>

# cogit

Git remembers what changed. cogit remembers why.

<p align="center"><img src="docs/images/cogit-descartes.jpg" width="360" alt="René Descartes with git branches running through his hair"><br><i>Cogito, ergo commit.</i></p>

<img src="docs/images/demo.gif" alt="cogit open shows the projects, then the map; pasting a message hash opens the decision behind it, and cogit why lists the thoughts behind a file">

cogit records every message you send to an AI coding agent as a *thought commit*: what you
asked, what came of it, and the message it answered. Your code commits point back to the
thought behind them, so `git log` tells you what changed and cogit tells you why. It works with
Claude Code today.

## What it does

- **Every message becomes a thought commit**: the question, the outcome, the decisions with
  their reasons and the options that were rejected, and which earlier message it continues.
- **A map of your sessions**: a git graph of your conversations with branches, decisions, a
  "Your turn" inbox and a one-click command to resume any chat.
- **Commits point back to their reason**: a `Thought:` trailer on each commit;
  `cogit show <sha>`, `cogit blame` and `cogit why` follow it back.
- **Pull request descriptions with the decisions**: `cogit pr` writes the goal, the
  decisions and the rejected options, never the raw chat.
- **Teams share the record through git**: after a pull, your teammates' sessions are on the
  map too, with who ran them and what changed most.
- **The agent remembers**: a new session starts where the last one left off, and before
  editing a file the agent hears what was already tried and rejected there.
- **Cheap by default**: a small side model records in the background; in our sessions it
  cost about 1–2% of a session's tokens.
- **Private by default**: no server, no account. The raw conversation stays on your machine
  and keys are redacted.

## Why

AI coding agents made writing code faster and moved the bottleneck to review: in a study of
718 firms, they opened 23% more pull requests while review time rose 49% and finished work did
not measurably grow. A reviewer sees what changed, not why; the why stays in a chat nobody else
reads. cogit keeps it next to the code. [More, with sources](docs/guide/why.md).

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
- [The map](docs/guide/map.md): sessions, branches, the inbox, unread work, files, search
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
