# Troubleshooting

## `cogit init` says the directory is not in a git repository

cogit ties its record to commits, so it needs git. Run `git init` (or work in a clone), then
`cogit init` again.

## Nothing is recorded

1. **Is the plugin on in this session?** Run `/plugin` in Claude Code and look for cogit. A
   session that started before the plugin was installed or updated records nothing until
   `/reload-plugins` or a new chat.
2. **Is recording switched off?** `COGIT_DISABLE=1` in the environment turns every hook off.
3. **Is the project set up?** `.cogit/project.json` must exist in the project (or in the main
   checkout, for a worktree).
4. **Did the side model fail?** Its output goes to `.cogit/state/detached.log`. The usual
   causes: `claude` is not on the `PATH` of the hook, or it is not logged in.

A message without a record yet is picked up by the next side run or at the session end. With
`sessionEndCatchUp` off, the map says how many messages of a session are not recorded.

## The map looks old after an upgrade

The map server keeps running in the background with the version it started with, and it
rebuilds the map with that version. Stop it (it listens on `127.0.0.1:4747`) and run
`cogit open .` again.

## The port is taken

```bash
cogit config set serverPort 4848
```

## The agent asks permission every time it records

`init` offers to allow the cogit skill in `~/.claude/settings.json`. Run
`cogit init --allow-skill` in the project to add it later.

## A sandbox or container loses the settings

cogit keeps its global settings and project list in `~/.config/cogit/` (or `$COGIT_HOME`). A
sandbox that does not write through to that directory loses them after each run; bind it into
the sandbox or set `COGIT_HOME` to a directory that persists. Project records in `.cogit/` are
not affected.

## A setup hint keeps appearing

In a repository without cogit, a new session mentions once that cogit is not set up. To stop
it in that project:

```bash
cogit config hint-off
```

## Something else

Open an issue at <https://github.com/erensrtky/cogit/issues> with the output of
`cogit --version`, what you ran and, if it is about recording, the end of
`.cogit/state/detached.log`.
