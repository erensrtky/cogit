# Recording and cost

## Who writes the record

Two writers share the record, and `recorder` decides which ones run:

- **The side model** runs outside the chat, in the background: a headless `claude -p` with a
  small model (`sideModel`, Haiku by default) and no session of its own. It reads the
  conversation and writes a node for every message: the title, the message it answers, and
  the decisions you made. It never interrupts the agent.
- **The main agent**, the one you are talking to, records through the cogit skill when the
  Stop hook asks it to. It knows things the side model cannot see from the outside: why it
  chose one approach, what it rejected, how a branch turned out.

Each writer owns its own fields: the side model fills what is empty and never overwrites what
the agent wrote.

| `recorder` | Panel | What happens | Cost in our sessions |
|---|---|---|---|
| `side` (default) | Economical | Only the side model records, every 5 turns (`sideEveryTurns`); the agent is never asked | about a cent per session |
| `mixed` | Detailed | As above, and the agent checks in every 15 turns (`updateEveryTurns`) to add its decisions | about 1–2% of a session's tokens |
| `agent` | (config only) | The agent records everything itself every `updateEveryTurns` turns | about 3–7%, more in short sessions |

When a session ends, the side model records whatever is still unrecorded and then closes the
session (`sessionEndCatchUp`): it reads the whole session once, splits it into threads, hangs
each message from the thread it belongs to, and writes the branch summaries and one line on
where the session left off. Nothing in the chat waits for it.

## What it costs

The side model runs with your own Claude Code login, like any `claude -p` run, so it uses
your plan or API account. Haiku is about thirty times cheaper than the main model per token.
In an A/B over three real sessions (109 messages) Haiku matched the main agent on message
parents in 94% of cases and was good on titles and your decisions; it was weaker on the
agent's own technical decisions and at splitting a session into threads. Telling it what the
agent did in each turn (its steps, questions and edited files) fixed most of the first, and
the session-end pass fixed the second, so `side` is the default since 0.21. Choose `mixed`
(Detailed) when you want the agent's own account of its decisions as well.

To record less often, raise `sideEveryTurns` and `updateEveryTurns`. To spend nothing on
recording during the session, use `recorder: side` and turn `sessionEndCatchUp` off; the
messages then wait until you record them.

## Shapes

A message that landed commits also gets a **Shape**: numbered steps or a small diagram of
what the change does, shown beside its Intent and its Code. Whoever records writes it — the
agent in the record skill, or after a commit the side model, detached, so a commit never
waits. It is one small model call per such message, reading the combined diff (cut to about
7 KB). Release/version bumps, lockfiles, CHANGELOG-only changes and changes under five lines
are skipped. `shapes: false` writes none and the map says so.

## When something is not recorded

A turn the side model has not reached yet shows on the map without a title for a while. If
it stays that way, see [Troubleshooting](troubleshooting.md).
