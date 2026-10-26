# cogit

**Cogito, ergo commit.**

Git remembers what changed. cogit remembers why.

![The map: sessions, branches and the thoughts behind them](docs/images/map.png)

cogit records every message you send to an AI coding agent as a *thought commit*, with what
came of it and the message it answered. Code commits point back to the thought through a
`Thought:` trailer, so `git log` and `cogit log` tell two halves of one story. Your agent reads
the lineage with `cogit log`, `show`, `blame` and `search`; you read it as a map of sessions,
branches and decisions.

## Install

```bash
npm install -g cogit      # the CLI; Node >= 22.13
npx cogit --help          # or run it without installing
```

The Claude Code plugin adds the skill that keeps the record and the hooks that maintain it
(Claude Code 2.1.275 or later):

```text
/plugin install cogit --marketplace sainthardrock/cogit
```

## Quick start

```bash
cd your-project
cogit init        # asks about git, transcript retention and summary language
cogit open        # builds the map and serves it on 127.0.0.1
```

Then work as usual. The skill updates the record every few turns (`updateEveryTurns`, default
5) and at session end; the hooks write `.cogit/HEAD`, rebuild the map and, if `recordCommit`
is `auto`, commit the record. Nothing cogit installs can block a prompt or a commit: every
hook failure is silent and exits 0.

## Read the lineage

```bash
cogit log                     # like git log: messages and branches, newest first
cogit log --branches          # only the branch summaries
cogit log --file src/auth.ts  # the thoughts that touched this file
cogit show h3f9c2a1b4d6e      # one message: the turn, what came of it, its commits
cogit blame src/auth.ts:42    # which recorded message produced this line
cogit search "refresh token"  # titles, summaries, decisions and the stored conversation
```

Each takes `[dir]` (or `-C <dir>`), the list verbs take `-n <count>` and `--json`. A message is
addressed by its hash (`h` plus 12 hex), `<session-id-prefix>:mN`, or — for `show` — a commit
hash with a `Thought:` trailer.

## What git sees

- `.cogit/sessions/` and `.cogit/project.json` are committed by default, so the record travels
  with a clone. `cogit config git commit|ignore` switches an existing project; local state
  (conversations, locks, inbox, map, `HEAD`) is always ignored.
- A `pre-commit` hook stages the current session's record with your next code commit. It never
  creates a record-only commit. `recordCommit` decides what happens to messages recorded after
  the last commit: `ask` (default), `auto` or `off`.
- A `prepare-commit-msg` hook adds `Thought: h<id>` to a commit it can attribute — skipped for
  merges and squashes, and when `.cogit/HEAD` is older than `trailerMaxAgeHours`. `build`,
  `log`, `blame` and the Files view read the trailers back with `git log`.

## Privacy

- The raw conversation stays on this machine. `.cogit/conversations/` holds a local copy of the
  transcript so the panel keeps working after Claude Code deletes it; `.cogit/.gitignore` keeps
  it out of git unless `shareConversations` is on.
- The record holds titles, summaries, decisions and work items — never tool output.
- A redaction pass for keys and token patterns runs over everything the map writes or shows.
- Claude Code keeps transcripts for `cleanupPeriodDays` (30 days by default); `init` offers to
  raise it and never changes it silently.

## Settings

`cogit config get [key]` and `cogit config set <key> <value>`, or **Settings** in the map.

| Key | Default | What it does |
|---|---|---|
| `language` | `auto` | Summary language: the conversation's, or a fixed one |
| `updateEveryTurns` | `5` | Turns between record updates |
| `sessionEndCatchUp` | `true` | Summarize the last messages when a session ends |
| `catchUpModel` | `haiku` | Model for the session-end catch-up |
| `messageSummaries` | `false` | A summary on every message, not just every branch |
| `startupContext` | `true` | Hand the agent the previous session's lineage at session start |
| `gitPolicy` | `commit` | Whether new projects commit the record |
| `shareConversations` | `false` | Commit the raw conversation too |
| `recordCommit` | `ask` | What to do with messages after the last code commit |
| `trailerMaxAgeHours` | `6` | How old `.cogit/HEAD` may be for a `Thought:` trailer |
| `serverPort` | `4747` | Port for the local map server |

## Docs and licence

The record format — `.cogit/` layout, message ids, events, the `Thought:` trailer — is
[docs/format.md](docs/format.md), with generated JSON Schemas in
[docs/schema/](docs/schema/). The design and the full CLI surface are in
[specs/cogit-mvp.md](specs/cogit-mvp.md), kept up to date with the code. MIT —
see [LICENSE](LICENSE).
