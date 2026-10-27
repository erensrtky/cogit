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

| `recorder` | What happens | Cost in our sessions |
|---|---|---|
| `mixed` (default) | The side model records every 5 turns (`sideEveryTurns`); the agent checks in every 15 (`updateEveryTurns`) to add its decisions | about 1–2% of a session's tokens |
| `agent` | The agent records everything itself every `updateEveryTurns` turns | about 3–7%, more in short sessions |
| `side` | Only the side model records; the agent is never asked | the side model's runs only |

When a session ends, the side model records whatever is still unrecorded
(`sessionEndCatchUp`). Nothing in the chat waits for it.

## What it costs

The side model runs with your own Claude Code login, like any `claude -p` run, so it uses
your plan or API account. Haiku is about thirty times cheaper than the main model per token.
In an A/B over three real sessions (109 messages) Haiku matched the main agent on message
parents in 94% of cases and was good on titles and your decisions; it was weaker on the
agent's own technical decisions and branch summaries, which is why `mixed` still asks the
agent every 15 turns.

To record less often, raise `sideEveryTurns` and `updateEveryTurns`. To spend nothing on
recording during the session, use `recorder: side` and turn `sessionEndCatchUp` off; the
messages then wait until you record them.

## When something is not recorded

A turn the side model has not reached yet shows on the map without a title for a while. If
it stays that way, see [Troubleshooting](troubleshooting.md).
