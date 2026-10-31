# cogit guide

The [README](../../README.md) shows what cogit is and how to start. This guide explains each
part in detail.

| Page | What it covers |
|---|---|
| [Getting started](getting-started.md) | Install, what `cogit init` asks, your first session, setting up a team |
| [The map](map.md) | Sessions, branches, the "Your turn" inbox, files, search, resuming or forking a session, the people filter |
| [Reading the lineage](reading-the-lineage.md) | `log`, `show`, `blame`, `why`, `search` in the terminal, and how the agent uses them |
| [Pull requests](pull-requests.md) | `cogit pr`: a review-ready description with the decisions behind the code |
| [Teams and git](teams-and-git.md) | What is committed, the `Thought:` trailer, the git hooks, teammates' records |
| [Recording and cost](recording-and-cost.md) | Who writes the record, the side model, what it costs |
| [Privacy](privacy.md) | What is recorded, what never is, what leaves your machine |
| [Settings](settings.md) | Every setting with a plain-language explanation |
| [Troubleshooting](troubleshooting.md) | Nothing is recorded, the map looks old, the port is taken, and more |
| [Why cogit](why.md) | The review bottleneck AI coding created, with sources |

The record format itself (the `.cogit/` layout, message ids, events, the trailer) is in
[docs/format.md](../format.md), with JSON Schemas in [docs/schema/](../schema/).
