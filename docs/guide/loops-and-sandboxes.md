# Loops, sandboxes and agent factories

Some setups run Claude Code with nobody typing: a loop script that hands one task after another to
`claude -p` (such as Ralph), a cron job, or an agent factory where agents pick up work on their
own, often inside a sandbox or a container. This page covers what cogit records there, what it
needs from your setup, and the one case it cannot cover.

## Which headless sessions are recorded

**Headless sessions** in Settings (`cogit config set recordHeadless off|auto|all`) decides:

| Choice | Recorded |
|---|---|
| **Auto** (default for new installs) | The sessions you or your scripts start, and the ones your recorded chats start through a command. Not the ones other plugins start in the background. |
| **Off** | Only the chats you type into. |
| **All** | Every headless session, other plugins' background runs included. |

How Auto tells them apart:

- **Started by a script, a loop or cron:** no Claude Code process is above the session, so it is
  recorded. A sandbox that hides the processes outside it gives the same answer.
- **Started by a command in a recorded chat** (the agent runs `claude -p` to hand off a task): a
  recorded session passes `COGIT_RECORD=1` to the commands it runs, so the new session is recorded.
- **Started by another plugin's hook** (a summarizer that runs once per prompt): there is a Claude
  Code session above it and no mark, so it is left out.

A tool can always mark its own sessions with `COGIT_RECORD=1`; Auto records a marked session
whatever started it. cogit's own background runs are never recorded, in any mode.

On Windows, Auto does not read the process list (asking for it took more than three seconds,
too long for a hook). There, a script's sessions are recorded when the script starts them with
`COGIT_RECORD=1`, or with **All**.

## When the record is written

A headless session's record is finished before `claude -p` returns. When the agent ends its
answer, cogit records the session and closes it (its threads, branch summaries and where it left
off) while Claude Code waits, so a loop, a sandbox or a container can end the moment `claude -p`
returns and the record is already there. This adds the recording time to each run, usually under
a minute. Chats you type into are not held up: their record is written in the background after
they end.

Two directories must be on disk that the run can write to:

- the project's `.cogit/` directory, where the record goes;
- Claude Code's own directory (`~/.claude`, or `CLAUDE_CONFIG_DIR`), where the transcript is.

Most sandboxes keep both, since Claude Code needs its directory to log in at all.

The recording uses the session's own environment. A loop that runs Claude Code on another
provider records with that provider's model for the name cogit asks for (`sideModel`, `haiku` by
default), so check that the provider maps it. Each session's record costs one small-model call;
a loop runs many sessions.

## When a run is cut off

If the run is stopped while cogit is still recording (the process is killed, the machine shuts
down), nothing is lost. Before it starts, cogit marks the session as waiting for its record, and
it clears the mark when the record is finished. The transcript stays on disk, so the next session
in the project finishes every marked session, however long ago it ran: in a loop, a later turn;
otherwise the next session you open in the project. It waits until a marked session has been
idle for ten minutes, so a session still open in another terminal is never closed early, and
tries each one at most twice.

To finish one by hand instead, run:

```bash
cogit backfill <session-id> --tail --close
```

## What cogit cannot cover

An environment that throws away the project directory when it ends, such as a CI job on a fresh
machine or a container without volumes: cogit still writes the record, but it is thrown away with
the directory, and a run cut off there leaves no mark or transcript to finish it from. To keep
records there, put `.cogit/` and Claude Code's directory on storage that outlives the run (a
volume, a cache, a mounted path), or share the record with `git push` before the run ends
(see [Teams and git](teams-and-git.md)).

## Checklist

- **Headless sessions** on **Auto** (or **All**).
- `.cogit/` and Claude Code's directory on storage that outlives the run.
- On Windows, start the loop's sessions with `COGIT_RECORD=1`.
- If the provider is not Anthropic, check that it maps the `sideModel` name.
