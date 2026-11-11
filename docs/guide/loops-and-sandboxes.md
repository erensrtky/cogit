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

## What the record needs from your setup

cogit writes most of a headless session's record after the session ends, in the background: a
small model reads the conversation and records it, which usually takes a minute or two. Two
directories must still be there when it runs:

- the project's `.cogit/` directory, where the record goes;
- Claude Code's own directory (`~/.claude`, or `CLAUDE_CONFIG_DIR`), where the transcript is.

Most sandboxes keep both, since Claude Code needs its directory to log in at all.

That background run uses the session's own environment. A loop that runs Claude Code on another
provider records with that provider's model for the name cogit asks for (`sideModel`, `haiku` by
default), so check that the provider maps it. Each session's record costs one small-model call;
a loop runs many sessions.

## When the environment ends first

If the sandbox, the container or the script ends right after `claude -p` returns, it can take the
background run with it. Some examples:

- bubblewrap with `--unshare-pid` ends every process inside the sandbox when the sandbox closes;
- stopping a container stops every process in it;
- a job runner that kills the whole process group when a step ends.

Nothing is lost. The session's hook state and its transcript stay on disk, and a later session in
the project finishes the record: the first one that starts after the cut-off session has been
idle for ten minutes (so a session still open in another terminal is never closed early). In a
loop that is a later turn; the last turn's record is finished by the next session you open in
the project, within three days. You do not need to configure anything. Each session start
finishes up to three such sessions, and tries each one at most twice.

To finish one by hand instead, run:

```bash
cogit backfill <session-id> --tail --close
```

## What cogit cannot cover

An environment that throws away the project directory or Claude Code's directory when it ends,
such as a CI job on a fresh machine or a container without volumes: the transcript goes with it,
so nothing is left to finish the record from. To record there, keep both directories on storage
that outlives the run (a volume, a cache, a mounted path); the next run then finishes what the
previous one could not.

## Checklist

- **Headless sessions** on **Auto** (or **All**).
- `.cogit/` and Claude Code's directory on storage that outlives the run.
- On Windows, start the loop's sessions with `COGIT_RECORD=1`.
- If the provider is not Anthropic, check that it maps the `sideModel` name.
