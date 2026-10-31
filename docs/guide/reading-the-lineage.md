# Reading the lineage

The map is for you; the terminal commands are for you and for the agent. Each takes a project
directory as `[dir]` or `-C <dir>`.

```bash
cogit log                     # like git log: messages and branches, newest first
cogit log --branches          # only the branch summaries
cogit log --file src/auth.ts  # the messages that touched this file
cogit show h3f9c2a1b4d6e      # one message: what came of it, its decisions, its commits
cogit show a1b2c3d            # the message behind a commit (through its Thought: trailer)
cogit blame src/auth.ts:42    # which recorded message produced this line
cogit why src/auth.ts         # what earlier messages decided about this file, and rejected
cogit why src/auth.ts:42      # only the thought behind line 42
cogit why src/auth.ts --line 42  # the same lookup
cogit search "refresh token"  # titles, decisions, summaries and the stored conversation
cogit captures                # what the sessions left open (pending items, open branch lines)
```

`log` and `search` take `-n <count>` and `--session <id>`; `captures` takes `--session <id>`
too; `log`, `show`, `search` and `captures` take `--json`; `show --no-chat` leaves out the conversation turn.

## Addressing a message

A message has a stable hash: `h` and 12 hex characters, like `h3f9c2a1b4d6e`. Any unique
prefix of at least six characters after the `h` works. `<session-id-prefix>:mN` works too:
`9c32ab18:m24` is the 24th message of that session. `show` also accepts a commit hash and
opens the message in its `Thought:` trailer.

## `cogit why`

`why` runs the chain backwards: the file → the commits that touched it → the messages in their
`Thought:` trailers → the decisions and rejected options those messages recorded. Newest first,
each with its message hash and date.

The lookup is exact, but the wording is the record's summary, so it is only as good as the
record.

Add a line — `cogit why src/auth.ts:42` or `--line 42` — and `why` asks git which commit last
touched that line and shows only the thought behind it: for a surprising line, that is the one
you wanted. When that commit carries no thought, `why` says so and lists the file's other
thoughts under a "Thoughts behind the rest of the file" heading. A line past the end of the file
is an error.

Like git, it works from any directory inside the project: the path is relative to where you
are, so `cd src && cogit why auth.ts` is the same lookup.

## How the agent uses it

The agent reads the same commands:

- **At session start** it gets a short note on where the previous session left off, and how
  to read the record (`startupContext`).
- **Before it edits a file** that has rejected options on record, it gets a short "earlier,
  for this file" note listing at most five of them, once per file per session
  (`tryBeforeNotes`). It is information, not a rule: the note never blocks the edit.
- **When you ask** "why did we do this?" or "did we try X before?", it can run `why`, `show`
  or `search` itself.
