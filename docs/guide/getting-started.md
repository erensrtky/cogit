# Getting started

## Requirements

- Node 22.13 or later
- Claude Code 2.1.275 or later, or Codex CLI 0.167 or later ([Codex](codex.md) has its own
  install steps)
- A git repository: cogit ties its record to your commits, so `cogit init` stops in a
  directory that is not in one. Run `git init` first.
- `git config user.name` and `git config user.email` set: cogit stamps each session with
  them and, like git, tells people apart by email. Without an email `cogit init` warns, and
  people are told apart by name instead, which is easier to get wrong.

## Install

```bash
npm install -g @cogit/cli    # the CLI; the command is `cogit`
npx @cogit/cli --help        # or run it without installing
```

The Claude Code plugin adds the skill that keeps the record and the hooks that maintain it:

```text
/plugin install cogit --marketplace erensrtky/cogit
```

### Updates

The plugin and the `cogit` command update separately:

- **Plugin**: Claude Code updates plugins on its own only for marketplaces that have
  auto-update on, and it is off for every marketplace outside Anthropic's. Turn it on once:
  `/plugin` → Marketplaces → cogit → Enable auto-update. Or update by hand with
  `claude plugin update cogit@cogit`.
- **Command**: `npm install -g @cogit/cli` again.

A plugin update reaches a running session only after `/reload-plugins` or a new chat. When a
new chat starts and the two versions differ, cogit says which one to update. Recording
keeps working meanwhile: the plugin's hooks run the plugin's own copy of cogit.

## Set up a project

```bash
cd your-project
cogit init
```

`init` asks at most two questions (a third only to build a code graph, below); the rest have
sensible defaults, and every one has a flag so `cogit init --yes` runs without asking.

| Question | Default | Flag |
|---|---|---|
| Share the session records with your team? | no | `--git share\|ignore` |
| Keep Claude Code transcripts longer? Claude Code deletes them after 30 days by default. | keep as is | `--retention <days\|keep>` |

The record holds your messages' titles, branch summaries, decisions and open items. Sharing
sends all of that with every `git push` to anyone who can read the repository; if the repository
is public, that means everyone. So it stays on your machine unless you say yes.

Without asking, `init` lets the agent run the cogit skill without a permission prompt (so it
updates the record as it works), turns the plugin on for the project (writes
`.claude/settings.json`, which a teammate's session reads to load the plugin and stops one
that started without it), and sets the summary language to the conversation's.
`--no-allow-skill`, `--no-project-settings` and `--language <lang|auto>` override them, and
`--yes` leaves Claude Code's settings unchanged.

`init` backs up `~/.claude/settings.json` before the first change and prints what it changed.

A code graph is optional. With one, the map's **Graph view** links the files your sessions
touched by which file imports which. cogit reads the graph
[graphify](https://github.com/safishamsi/graphify) writes and never installs or refreshes it:

- graphify installed and the project has a graph: `init` says it found it.
- graphify installed, no graph yet: `init` offers to build one (`graphify update .`, no model
  calls; default no, `--graph` / `--no-graph`).
- graphify not installed: `init` prints one line on how to add it.

Keep the graph fresh your way, by hand or with `graphify hook install`.

Running `init` again in a set-up project changes nothing except what you pass as flags, and
refreshes the git hooks.

## Your first session

Open Claude Code in the project and work as usual. Nothing needs to be started by hand:

- Every message you send becomes a node in the record, with the message it answered.
- The record is written outside the chat by a small side model, and when the session ends the
  model it ran on reviews it once with the whole conversation in view. The agent is never
  interrupted. See [Recording and cost](recording-and-cost.md).
- When the session ends, whatever was left unrecorded is recorded.
- Each code commit gets a `Thought:` trailer naming the message it came from.

Then open the map:

```bash
cogit open .      # this project's map
cogit open        # the panel: every project on this machine
```

It runs a small server on `127.0.0.1:4747` and the page refreshes itself while you work. See
[The map](map.md).

In the next session the agent gets a short note on where the previous one left off.

## Set up a team

If you agreed to turn the plugin on for the repository, `init` wrote the project's
`.claude/settings.json`. Commit it. Then for everyone who opens the repository:

- Claude Code offers to install the cogit plugin.
- A session that started without the plugin records nothing, so a small hook stops its first
  message once, with the install command. Send the message again to go on without recording.
  Headless runs (`claude -p`) are never stopped.

Each teammate runs `npm install -g @cogit/cli` and `cogit init` once on their machine; `init` sees
the project is already set up, registers it on their machine and installs the git hooks in
their clone. In a project that shares its record, everyone's sessions then arrive with `git pull`.
See [Teams and git](teams-and-git.md).

## Stop recording

- For one session: start Claude Code with `COGIT_DISABLE=1`.
- For a project: remove `.cogit/` (and `.claude/settings.json`'s cogit lines if you added
  them). `cogit hooks uninstall` removes the git hooks.
