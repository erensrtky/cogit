# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Fixed
- A headless session cut off before cogit wrote its record (a sandbox, container or loop script that ends right after `claude -p` takes the background recorder with it) is now finished by a later session in the project, once it has been idle ten minutes; in a loop, a later turn. Before, such a session was never recorded. A new guide page, [Loops, sandboxes and agent factories](docs/guide/loops-and-sandboxes.md), covers what these setups need and the one case cogit cannot cover.
- When the settings file holds one value this version cannot read, such as a choice a newer version added, cogit keeps every other setting and puts only that one back to its default. Before, it ignored all your settings at once.

## [1.4.1] - 2026-11-11
### Added
- **Headless sessions** has three choices instead of on and off. **Auto**, the default for new installs, records the `claude -p` sessions you or your scripts start (a loop like Ralph, a cron job) and the ones your recorded chats start through a command (a task handed to another `claude -p`), and leaves out the ones other plugins start in the background, often once per prompt. **Off** records only the chats you type into; **All** records every one. An existing install keeps what it had: off reads as Off, on as All. Auto tells them apart by what started the session, read from the process list on Linux and macOS; a tool can also mark its sessions with `COGIT_RECORD=1`, which Auto always records, and on Windows that mark is how a script's sessions are recorded. `cogit doctor` counts the unrecorded tail of a headless session that was recorded.

### Fixed
- The map's **Pull request** view asks for the branch again when you come back to the window, so a `git switch` in a terminal shows without reloading the page.
- A Shape Flow whose node id is a word Mermaid reserves (`box`, `end`, `loop`…) drew as plain text in the map and broke its `mermaid` block in `cogit pr`; the diagram now uses its own ids.
- The Pull request view's title, and the base in `cogit pr --json`, name the branch you track (`→ main`, `→ origin/main`, or the branch you stacked on) instead of `@{upstream}`.
- A thought's Shape in the Pull request view opens fitted in a short box you drag and zoom with its buttons, instead of a preview with scrollbars both ways. The wheel keeps scrolling the page over it.

## [1.4.0] - 2026-11-10
### Added
- A **Pull request** view in the map, beside the Git and Graph views: the branch you are on as `cogit pr` describes it, with the goal, a card per thought (its reason, rejected options, the messages that led to it and its Shape diagram) and the commits no thought is behind. A thought opens its card with the diff, and **Copy as PR description** copies the Markdown. On `main` itself the view says there is nothing to merge. The view asks the local server for the branch checked out each time it opens, so switching branches does not need a rebuild.
- `cogit pr` and the pull request Action now include each message's **Shape**: a Flow, a Mermaid diagram or a sequence as a `mermaid` block GitHub draws, a Before / After table as a table, and steps or examples as text. When a description would pass GitHub's size cap, the Shapes go after the file lists and summaries.
- **Your turn** can be turned off in Settings (`cogit config set inbox false`): the box goes from the start page and from every map, and cogit stops reading transcripts for it. Rows closed with × stay closed when it is turned back on.
- **Search by meaning** (off by default): the map's search also finds messages that say the same thing in other words, ranked closest first and followed by the word matches. It uses an embedding model in your local Ollama (`bge-m3` by default, `cogit config set embeddingModel <name>` to change it), so nothing leaves the machine and no model call is paid. Each map build fingerprints only the new or changed messages into the project's local state. Turn it on in Settings or from the one-time offer under the search box; when Ollama is not running or the model is missing, the box says what to run.
- The map's search narrows to what is open: while a session or a message is open, **All · This session · This branch** under the search box keeps the hits to that session or to the branch the message sits in. The box's hint now says it takes words or a message hash.

### Changed
- `cogit pr` gives the sessions' times in UTC and says so (`2026-10-24 09:12 → 2026-10-24 11:40 UTC`). They used to be in the local time of the machine that ran it, which on GitHub's runner was UTC without saying it.
- The Graph view keeps what is on the screen in place when **Show files**, **Show commits** or **Open in place** adds or removes a layer; only the new parts settle around it. Its layout is also several times faster on a big project (a thousand parts in about 0.6 s instead of 4 s), so the page no longer freezes.
- Secret masking adds [secretlint](https://github.com/secretlint/secretlint)'s maintained provider rules (Stripe, SendGrid, Shopify, Linear, Groq, Cloudflare, Vercel, Hugging Face and more) beside cogit's own patterns for passwords typed on a command line.
- The record keeps only options about the product or the code under "considered and rejected". How the work was run (which tool or agent did it, this chat or a new one, when to post or release) is left out, so the map and `cogit pr` show the choices a reviewer needs; in a sample of this project's own record, about half of the rejected options were of that kind. Records written before stay as they are.
- The Graph view is one Tab stop instead of one per part: Tab lands on the focus file (or the last part you were on), the arrow keys move to the nearest part that way and bring it on screen, and Enter opens it. On a big project the keyboard no longer has to step through every part to get past the graph.
- **Tasks** is off for new installs (`captures` now defaults to `false`). An existing config keeps the value it stored, so nothing changes for people already using cogit; turn it on in Settings or with `cogit config set captures true`.

### Removed
- The note before each edit ("Earlier, for this file", the `tryBeforeNotes` setting). It gave every rejected option of a message to every file that message touched, so it told the agent about choices that had nothing to do with the edit: in this project's own sessions, none of 38 notes was about the change being made. cogit does not yet know which file a decision is about; until it does, the agent looks decisions up with `cogit why` and `cogit search`. An existing config that still has the setting is read as before.

### Fixed
- On Windows `cogit open` did not open the map when the project's path had an `&` in it (`C:\R&D\app`): the page was handed to `cmd /c start`, which read the rest as another command. It now goes to the default browser without a shell.
- Passwords typed on a command line reached a shared record unmasked: `mysql -p…`, `sshpass -p`, `curl -u user:…`, `--password …` / `--token …`, `PGPASSWORD=` and other prefixed names such as `DB_PASSWORD=` or `MYSQL_PWD=`, `aws_secret_access_key`, `Authorization: Basic` and npm tokens. They are now masked like the other secrets.
- On Windows the side model never started: every background record and close pass failed with `spawn EINVAL`, because Node no longer starts a `.cmd` file without a shell (CVE-2024-27980). cogit now starts plain `claude`, which finds `claude.exe`, and falls back to the `claude.cmd` shim through `cmd.exe` only when that is all there is, refusing a model name with characters `cmd.exe` would read as syntax ([#2](https://github.com/erensrtky/cogit/issues/2)). A run that outlives its time limit on Windows now stops with claude itself, not only the `cmd.exe` in front of it.
- On Windows the map showed each edited file with its full path instead of its path in the project, so it did not match the file git names.
- On Windows cogit did not see an installed graphify (`graphify.exe`), and never told when the plugin and the npm-installed `cogit` command had different versions, because npm lays out a global package differently there.
- `cogit log`, `cogit search` and the map build were slow on a long-used project (about 5.5 s for `log` and 20 s for a build here, over 1.2 GB of Claude Code transcripts): every command read every transcript line by line again. What a transcript says is now kept in `~/.cache/cogit` while the file is unchanged, which brings `log` and `search` under a second. A recorded commit that is gone from the repository no longer makes the build ask git about each commit one by one.
- A "Your turn" row closed with × came back when the page was reloaded: the server stored the dismissal but kept serving the page built before it until the next recording. It now rebuilds the project's map and the start page before it answers.

## [1.3.1] - 2026-11-09
### Changed
- The **Home** view moved from the map to the start page `cogit open` shows, above "Your turn", and adds up every project: messages and thought commits per day, the decisions and the options turned down, what cogit itself cost, the most discussed files (with their project; a click opens that project's map on the file) and a year of thought commits. Each map build saves its project's numbers in `.cogit/state/overview.json` for it. The map is back to the git and Graph views.

## [1.3.0] - 2026-11-09
### Added
- The map has a **Graph view** beside the git view: the work recorded on the project's code, peeled like an onion. It opens on all the sessions; a click goes inside a session to its branches and inside a branch to its messages, each in a lane colour, and the trail above it or Esc steps back (**Open in place** opens them where they are instead). Parts are linked when they touched the same code files, a rare file counting for more than one everything touches. Picking a file in the Files panel narrows it to the work on that file and the files it imports or is imported by; **All files** goes back. A ringed part landed a commit; **Show files** draws the files and their imports, **Show commits** the commits as squares. Clicking a message opens its card, the same one the git view opens. The git view's own buttons stay in place, disabled, so the toolbar does not move. The map remembers per project, in the browser, which view and side panel were open and where you were in the Graph view, so a refresh or a switch between the views comes back to it. The import links come from the code graph [graphify](https://github.com/safishamsi/graphify) writes; cogit only reads it, and `cogit init` says whether it found one, offers to build one when graphify is installed (`--graph` / `--no-graph`), or prints how to add it.

- A message's card has a folded **Related** section: up to three other branches, in this or another session, that worked on the same code files, rare files counting for more, with the files they share. A click opens that branch's message that touched most of them.

- In the git view, picking a file in the **Files** panel fades the sessions and messages that did not touch it, while the panel is open; **All files** clears it. The picked file is the same one the Graph view is drawn around, so switching views keeps it.

- The map has a **Home** view beside the git and Graph views: the project at a glance. On top, messages and thought commits per day; in the middle the decisions recorded (and how many the agent took on its own, without asking), the options turned down, what cogit itself cost, and the five most discussed files (a click opens the git view on that file); below, a year of thought commits a square a day, like a GitHub profile, where a square opens that day's first one.
- cogit notes what its own background runs cost (recording, the closing review, Shapes, captured work): the cost and tokens Claude Code reports for each run go to `.cogit/state/spend.jsonl`, local to the machine and never shared. The map's Home adds them up.

### Changed
- The map's **Files** list shows code files only, in both views: documents, config, lockfiles and build folders are left out (by the code graph when there is one, by name otherwise), and it has a search box. `cogit log --file` still answers for any path.

## [1.2.1] - 2026-11-08
### Added
- `cogit pr` shows a **Led here** list under a thought: the earlier messages of the same thread that decided something, back to the previous commit. A commit made on a plain "commit it" now carries the decision behind it, with the options that were rejected. `--json` has them as `ledHere`.

### Changed
- Quality recording no longer stops the agent mid-chat, and a short session no longer misses its review. When a session ends in Quality mode, the model it ran on reopens the whole conversation in the background (`claude --resume -p`, nothing written back to the transcript, no plugins or hooks) and corrects the record as the agent that did the work, for about one more message while its cache is warm. Before, the agent was asked every 15 turns, so a session that ended earlier was never reviewed. `cogit backfill --close --review` runs it by hand; a session end that was missed is closed by the next session with the side model only.
- Recording defaults to **Quality** (`recorder: mixed`, shown as "Detailed" before): besides the small background model, the model you worked with reviews the conversation once when the session ends and adds the technical decisions only it knows. The small model reads the chat from the outside and missed what the agent noticed in the code without saying it, such as a pitfall left only in a code comment. Setups that never chose a mode move to Quality; `cogit config set recorder side` (Economical, under 2 cents per 20 messages) keeps the old behaviour. The settings text now explains the difference, and the read-only settings view names the mode instead of its key.
- The map's Resume and Fork buttons carry a copy sign (⧉ Resume, ⧉ Fork): they copy the command for a terminal and never start Claude Code, which a bare "Resume" seemed to promise. The "Your turn" inbox no longer shows them; its link opens the map at the message.

### Fixed
- In Quality (mixed) recording most messages got no agent decisions: the side model was told to leave them to the agent, but it records most messages before the agent's turn and the agent only sees the ones still unrecorded. The side model now writes the agent's technical decisions in every mode; the agent can still replace them, and a later side run never takes the agent's back.
- A commit hash from another repository, pasted into the chat, could be recorded as one of the session's commits. `cogit session write` now keeps only commits this repository has and warns about the rest.
- A commit made before cogit first wrote the session's record (as with short sessions recorded only when they close) lost its thought: `cogit pr`, `cogit log`, `cogit blame` and the map read `Thought:` trailers only from the record's write time on, so `cogit pr` listed the commit with no thought and the PR Action stayed silent. They now read from the session's first message, and `cogit pr` dates sessions by their messages.
- `cogit pr --install-action` in a clone where cogit was never set up now says to run `cogit init` first, instead of asking to share records the project does not have yet.

## [1.2.0] - 2026-11-07
### Added
- `cogit pr --install-action` writes a GitHub Action (`.github/workflows/cogit.yml`) that posts the decisions behind each pull request's branch as one comment and updates it on every push; fork pull requests and branches with no recorded thought get no comment. The first `cogit pr` you run at a terminal mentions it once.

### Fixed
- `cogit pr` keeps describing the whole branch after you push it: a branch pushed with `git push -u` tracks its own remote copy, and `cogit pr` took that as its base, so the description came out empty right when the pull request is opened, and after one more commit it held only that commit. The base is now where the branch will merge (the remote's default branch, or the branch it is stacked on).
- The cost claims match what we measured: the default recording costs under 2 cents per 20 messages with message summaries on (the settings panel said "about a cent per session"), and the README no longer gives the default mode the 1–2% figure that belongs to Detailed.
- A `prepare-commit-msg` hook of your own that sets its own `trap ... EXIT` or ends with `exec` no longer drops the `Thought:` trailer: cogit now runs your lines as a child and adds the trailer once they finish. Existing hooks update on the next chat message.
- With an SSH key that has a passphrase and no ssh-agent, the records that follow a push are no longer lost: the background send used to retry the remote every 3 seconds for 10 minutes (each a failed login) and then drop them. It now stops at the first failure and keeps them queued, and `cogit doctor` says to add the key to ssh-agent (`ssh-add`), or for HTTPS to store your login (`gh auth login`).

## [1.1.0] - 2026-11-06
### Changed
- Every message now gets a one-line summary of what came of it (`messageSummaries` is on by default, and turned on once for existing setups). Without it, a message that only discussed or advised kept nothing but its title, so the map and search lost what the agent said. Turn it off with `cogit config set messageSummaries false`; it then stays off.

### Fixed
- With a hooks folder shared by every repository (a global `core.hooksPath`), cogit's hooks no longer act in repositories that are not the project: a commit there no longer takes the project's `Thought:` trailer, and a push there no longer announces the project's records.
- With Husky, cogit's hook blocks no longer vanish for good after `npm install` (Husky rewrites `.husky/_`): the next chat message puts them back. `cogit hooks uninstall` is remembered, so blocks you removed on purpose stay out.
- A session the side model left untitled takes its first thread's title (or its first message's) at session end, instead of showing only its id on the map and in `cogit log`; `cogit log` also stops printing such an id twice.

## [1.0.1] - 2026-11-06
### Fixed
- A git hook of your own that ended with `exit 0`, or read the push's input, no longer stops cogit: its block now sits at the top of the hook, hands git's input on to your lines, and adds the `Thought:` trailer after them. Existing hooks move on the next chat message; a Python or Node hook is left alone and `cogit doctor` says so.
- `git push --dry-run` no longer sends the record (Linux and macOS).
- The first download of a team's records shows git's progress meter without one line per session (300 sessions printed over 600 lines), and when it fails, `cogit doctor` shows git's reason instead of "the download failed".
- After upgrading from a version that committed the record, `cogit doctor` asks you to commit the rewritten `.cogit/.gitignore` too; without it teammates and new clones saw `.cogit/sessions/` in `git status`.
- A map with thousands of sessions no longer freezes on "Unfold all" and "Fold all": only the open sessions near the screen are drawn, and the session list no longer does quadratic work (10,000 sessions: 11 s down to 2 s).
- `cogit init --help` and `cogit config git --help` named the removed `commit` policy; they now say `share` or `ignore`.
- `cogit pr` and `cogit show <sha>` no longer tell a reviewer that a teammate's thought is "not recorded yet" when it may never arrive: for someone else's commit they say it is not in this clone's record, because its author has not pushed it or it came from a fork.
- `cogit build` in a fresh clone of a shared project downloads the team's sessions first, instead of writing an empty map.
- The map's outline follows the search: it marks and scrolls to the hit you are on, and scrolls to a message you click on the map.
- Git older than 2.29 can download the team's records again: cogit no longer passes it `--no-write-fetch-head`, and a failed download names git's error instead of a line of its usage text.
- A Shape diagram in the message panel keeps legible text: it shrinks to the panel's width but not below half size, and a tall or wide one scrolls inside its box instead of shrinking until the labels cannot be read.
- A message is no longer lost from the record when the side model gets one of its fields wrong, or (in mixed mode) writes a field that belongs to the agent: only that field is left out, and the message keeps its title, summary and the rest.
- A chat that commits into another repository no longer stamps that commit with a `Thought:` trailer the other repository can never resolve: the trailer is added only when the chat runs in the project being committed (or in that working tree).
- The agent is told at session start that the `Thought:` trailer comes from cogit, so it stops warning you about a line it did not write.

## [1.0.0] - 2026-11-04
### Changed
- **Breaking:** the record no longer enters commits. Each session sits on its own ref in your repository, outside every branch, so pull requests, `git status` and `git grep` show only code and a normal clone stays small. If you shared your record before, run `git rm -r --cached .cogit/sessions` once and commit; `cogit doctor` reminds you. Teammates' files come back from history on their next cogit run. Old commits keep the files they had.
- **Breaking:** the record is private unless you say otherwise. `cogit init` asks one question, "Share the session records with your team?", and no answer means no. `cogit init --git` and `cogit config git` take `share` or `ignore`.
- `git push` sends the record of a project that shares it, in the background once the push has landed: it prints how many, never slows or fails the push, and only goes to `origin` or your only remote. A rejected push sends nothing. What cannot be sent stays queued and `cogit doctor` says why.
- The first time cogit runs in a clone of a shared project it downloads the team's records, and from then on a plain `git pull` brings them. An empty map says whether the download failed.
- A linked worktree always uses the main checkout's record, so a session outlives its worktree.

### Added
- `cogit prune --older-than <age>` deletes old sessions here and in the repository, after listing them and asking. Your own by default, `--all` for everyone's.
- `git clean -fdx` no longer loses a shared project's sessions: cogit puts the files back from their refs.

### Removed
- **Breaking:** the `gitPolicy` and `recordCommit` settings, the commit policy, the `pre-commit` hook and the record commit. An old `pre-commit` block is removed on its own.

## [0.31.1] - 2026-11-04
### Fixed
- The conversation store keeps the agent's full answer. A turn stored while the agent was still answering stayed empty or partial for good, so the map showed those messages without their answer; the next build fills in what the transcript still holds.
- `.cogit/map.html` holds its data one value per line, so a text search like `grep -r` that matches it prints far less.
- The recorder writes only rejected options someone named in the conversation, and `agreed` only when the user approved in that message.

## [0.31.0] - 2026-11-01
### Added
- A saved map can carry its diffs: when the page embeds patches, the Code rows open them without the local server, and the "open the map with `cogit open`" notice gives way. The demo page under `docs/demo/` is built this way.

### Fixed
- A rebase or cherry-pick during a session no longer links old commits that had no `Thought:` trailer to the session's newest message.
- A squashed commit keeps the link to every message it folded in, including commits already squashed: `cogit why`, `blame`, `pr` and the map read every `Thought:` line of the message, not only the last block. In `cogit pr --json`, a commit's `thought` is now `thoughts`, a list.
- The diagram script is loaded relative to the page, so a map published under a subpath (the demo on GitHub Pages) draws its Shapes instead of falling back to the diagram's source.

## [0.30.0] - 2026-11-01
### Added
- A changed file in a message's card opens its history: the Files view opens on that file and lists every message that touched it, each with the reason it happened or the option it rejected — the map's side of `cogit why <path>`.

### Changed
- The README gallery gains a fourth still, the file history above.

## [0.29.0] - 2026-11-01
### Changed
- A message's card shows its Shape as a diagram first, with the steps under it, and the preview fits the drawing to the box instead of cropping it mid-shape; the **Open** window still holds every tool.
- The Shape writer draws a Flow whenever data or control crosses more than one file or layer — even when the change also reads like a list — and keeps Steps for logic that stays inside one function or module, with no path across files to draw.
- The README opens with three screenshots — the map, a message's Shape and the Tasks list — instead of a 29-second recording.

## [0.28.3] - 2026-11-01
### Changed
- The captured list is called **Tasks** now — in the map's toolbar, the session card and the settings — and it says what it is: "what your sessions left undone — cogit drafts, you decide." Each item carries a task bullet, and the sections read **Suggested** (drafted at session close), **Open** and **Done (last 10)**.

## [0.28.2] - 2026-11-01
### Fixed
- The session-end catch-up no longer loses the whole record when the model's answer is only slightly off: nulls inside the status take the schema's defaults, a message summary written as an object keeps its text, and in mixed mode the side model's status, branch summaries and agent decisions are dropped instead of failing the write.

## [0.28.1] - 2026-11-01
### Changed
- `cogit init` asks where the session records should live — with a note on what committing `.cogit/` shares — and, below 90 days, whether to keep transcripts longer. The project takes its directory's name. It lets the agent run the cogit skill, writes the project's `.claude/settings.json` and sets the summary language to the conversation's without asking; `--git`, `--name`, `--retention`, `--no-allow-skill`, `--no-project-settings` and `--language` still override them, and `--yes` leaves Claude Code's settings untouched.
- The user-facing "lineage" labels say cogit now: the settings label is **Record at session start**, `cogit log` describes what it prints as recorded sessions, and the record skill replies `cogit updated`.

## [0.28.0] - 2026-11-01
### Added
- Captured work is a curated list now: when a session ends, the side model drafts at most three user-level items from what the record left undone, and you accept, dismiss or close each one on the map or with `cogit captures accept|dismiss|done <id>`. `cogit captures distill [--session <id> | --all] [--dry-run]` backfills older sessions; the list lives in `.cogit/state/captures.json`, local and never committed.
- A `captures` setting (on by default, with a **?** in the settings panel) turns the drafting off; items already in the list are kept, not deleted.

### Changed
- Captured items belong to their session, not to one message: the store is schema 2 (a schema-1 file is read with its message dropped and written back on the next change), an item's source opens the session's first message, and `cogit captures` names the session as the source.
- The captured-work count is a button on the session row, expanded or folded, and opens that session's card; the card lists the session's items under **Captured work** (read-only), and the message row no longer carries the mark.
- The map's **Captured** button and `cogit captures` show the curated store instead of rows derived from the record, and the button appears only while the setting is on and something waits or is open.
- The captured-work pass drafts from the record's own pending items: the done list is a veto, a branch open line only helps to word an item, and the steps of one goal fold into a single item.
- A session's row opens its card; the arrow at the left opens and folds the messages, so the card never covers them.
- Pending items are written in the user's words when a session ends, and a session that closed before the agent's first record pass gets its status filled by the close pass instead of leaving it empty. The record skill's reply says `cogit updated` instead of the retired `Lineage` name.

## [0.27.0] - 2026-10-31
### Added
- Diagrams take their colours from the map's palette: the light and dark themes each render a diagram in their own colours, including in the Shape's Open window and the panel preview, and switching the theme repaints an open diagram in place.
- A diagram in the Shape's Open window opens fitted to the window and can be dragged, zoomed with the wheel or the **−** / **Fit** / **+** buttons, moved with the arrow keys and fitted again with a double-click, instead of being read through a horizontal scrollbar.
- Captured work: `cogit captures` and the map's **Captured** list gather what the sessions left open — each session's pending items and each branch summary's open line — with the source message, who recorded it and how old it is; items waiting for you come first. Read-only and derived from the record; cogit keeps no planning state.

## [0.26.0] - 2026-10-31
### Removed
- The read/unread tracking: the **Mark as read** button in the message details, the **Unread** view and its toolbar button, the panel's "Unread big changes" count, the `POST /api/read` route with its state file, and `cogit log --unread`. The map still marks messages whose commits crossed `bigChangeLines`.

### Changed
- A tool's **?** only explains how to read it; the kinds it listed are already named in the legend above the Shape.

## [0.25.7] - 2026-10-31
### Added
- The Shape modal has a **Regenerate** button under the Shape: it asks the side model to write that message's Shape again — for an answer a small model missed, or one you want differently — and it replaces a Shape the agent wrote too. It works on the map `cogit open` serves.

### Changed
- The writer's last instruction says again that a change across two or more files always includes a Flow, so a small model stops dropping it.

## [0.25.6] - 2026-10-31
### Changed
- An ordered **Flow** is drawn as a sequence diagram with the kind symbols.

### Fixed
- A wide diagram in **Open** keeps its size and scrolls sideways instead of shrinking its text until it cannot be read.

## [0.25.5] - 2026-10-31
### Fixed
- A **?** explanation that opens above its button (every Shape tool but the last, and Settings rows near the bottom) shows again; it was pushed off the window.

## [0.25.4] - 2026-10-31
### Added
- A **Flow** Shape tool: the writer names each box's kind (function, data store, event, condition, …) with the project's own label, and cogit draws the fixed symbol and shape. A legend above the tools shows the kinds a Shape uses, and the Flow/Steps help lists all of them.

### Changed
- The Shape writer no longer gets the raw Mermaid flowchart and sequence tools; Flow replaces them, and old records still validate and draw. Steps start each line with its kind's symbol.

## [0.25.3] - 2026-10-31
### Added
- Every Shape tool's caption has a **?** that says how to read it: which way the arrows go, what a row means. Diagrams, examples and steps also list how names are written: a role in plain words, a file with its extension, a function with `()`, a field with its owner, a command after `$`, printed text in quotes.

### Changed
- The Shape writer follows that notation, names diagram actors and boxes by their role with the code name in parentheses, labels arrows with plain verbs, and gives no tool at all for a change nobody would notice from outside.

### Fixed
- A **?** explanation near the edge of a window or a scrolling panel opens on the side with room instead of being cut off; this also applies to the Settings explanations.

## [0.25.2] - 2026-10-31
### Added
- Three more Shape tools: **Sequence** (a Mermaid sequence diagram for work handed between a hook, a queue, a server or a background job), **Interface** (one row per command, flag, exported function, config key or schema field that changed) and **Example** (one concrete run with real values). A new or changed command always gets an example.
- `cogit shape --commit <sha> --dry-run` prints the Shape a commit would get without saving or queueing anything.

### Changed
- The Shape writer gives at most three tools, the ones that say the most, and a flowchart stays under 10 nodes.

## [0.25.1] - 2026-10-31
### Added
- A third Shape tool, **Before / After**: a table with one row per case, saying how the change behaved before and how it behaves now. The side model adds it for a fix or any change you can see; a pure refactor gets none.

### Changed
- A change that touches two or more files gets a diagram of its path as well as the steps, instead of the writer usually stopping at the steps. A record holding a Shape tool this CLI does not know still loads, and the map shows that tool as text.

### Fixed
- A Mermaid diagram with long labels is drawn again: the node limit counted every word in a label as a node, so most real diagrams were shown as source.
- A long diff on the Code tab of **Open** scrolls inside the window instead of running past its bottom edge.

## [0.25.0] - 2026-10-31
### Added
- Intent, Shape and Code: a message that landed commits gets a **Shape** — numbered plain-language steps or a Mermaid diagram of what the change does — between its recorded Intent and its diff. The side panel previews it and **Open** shows the three layers with 1/2/3 tabs. The side model writes it after a commit (detached, behind its own lock) in the mixed and side modes, on the message the commit's `Thought:` trailer names; a commit that lands before its message is recorded waits for the record, the agent writes it in the record skill, and `shapes` (on by default) turns it off. Release bumps, lockfiles, CHANGELOG-only changes and changes under five lines are skipped without holding back older messages; an invalid diagram is kept as text. Mermaid ships once beside the CLI and the local server hands it to the map, so `map.html` stays about 550 kB; a map opened from `file://` shows the diagram's source instead.
- `cogit why <file>:<line>` (or `--line N`) shows only the thought behind that line: git blames the line to its commit, the commit's `Thought:` trailer names the message, and `why` prints that message's decision and rejected options. When the commit carries no thought it says so and lists the file's other thoughts; a line past the end of the file is an error.
- `cogit doctor` explains why the map may stay empty: read-only checks for Node, the Claude Code plugin and its version, git identity, the project and its hooks, the skill permission, transcripts and their retention, recorded sessions and the unrecorded tail (headless runs such as `claude -p` are left out unless `recordHeadless` is on), the map server and the close-pass log. Each line says `ok`, `warn` or `fail` with the command that fixes it; `--json` prints the report, and a failed check exits 1.
- `cogit init --retention <days>` also applies to a project that is already set up, as `cogit doctor` suggests.
- `cogit init` warns when git has no `user.email`, since sessions are now told apart by it.
- The map tells your sessions from your teammates': a teammate's session always shows their name and yours never needs to, the side panel marks yours "(you)", and a new Everyone / You / teammate choice in the toolbar fades the other people's sessions.

### Changed
- `cogit init` and `cogit hooks install` also add a `post-commit` block now, which queues a Shape after a commit without blocking it; `cogit doctor` flags it when missing. Existing projects get it with `cogit hooks install`.
- The README and the guide now describe what 0.20–0.25 ship: the map without epochs (row widths, open sessions remembered, the panel beside the map, one date shape, the person filter), Resume and Fork, forked sessions, `cogit doctor`, `why <file>:<line>` and the git-email identity. The map screenshots and the README demo are recorded again from the current map.
- A session records its author's git email next to their name, and people are told apart by email, as in git.
- A session only continues its author's own earlier sessions: after a pull, a teammate's sessions are no longer offered as the start of yours, and the map no longer draws a session as the continuation of someone else's.

## [0.24.0] - 2026-10-30
### Fixed
- A forked session (`claude --resume <id> --fork-session`, the map's **Fork** button) is no longer recorded as a copy of the session it came from: the messages it copied are left out, and its first own message hangs from the last message it shares with the original.
- Sessions the map search opened no longer stay open after a reload: they close again when the search is cleared or stops matching them, unless you clicked into one.

### Changed
- The large "Copy resume command" button is now two small buttons for the session: **Resume** copies `claude --resume <id>`, and **Fork** copies the same with `--fork-session`, so the chat goes on as a new session and the original stays. The command shows only when copying fails.
- Dates read the same everywhere: the side panel, the inbox and the project panel show `2026-10-30 21:09` like the map's rows, and the project tabs `10-30`, instead of the browser's locale (`10/30/2026, 9:09:30 PM`, `Oct 30`).
- The side panel opens beside the map instead of over it, and the map column grows into the empty right margin while it is open; a narrow window still lays it over the map.

## [0.23.2] - 2026-10-30
### Changed
- Clicking a message on the map selects only that message, as the outline does, instead of also tinting its whole branch; the side panel shows the message's branch either way.
- A selected message no longer also highlights its session's row; the session row is highlighted only when the session itself is selected.

## [0.23.1] - 2026-10-30
### Fixed
- `cogit --version` said 0.22.0 in the 0.23.0 package: publishing now always builds first, so the bundled version matches the package.

## [0.23.0] - 2026-10-30
### Fixed
- After an upgrade the map no longer shows the old version's page until the next message: every map is stamped with the cogit version that built it, and the server rebuilds one another version wrote before serving it.
- A session the closing pass left untitled no longer shows as a bare id on the map and in the inbox: it takes its first message's title, and the side model is now told to write a title when the record has none.

### Changed
- Map rows show the date only on a day's first row (the rest show the time), the `mN` label is quieter, and "↑ continues <session> · m37" is now "↑ m37" with the session in its tooltip.

### Removed
- Epochs are gone: no `cogit epoch` command, no epoch in the record skill or the closing pass, and the Outline lists sessions in start order instead of grouping them. Older `project.json` and session files still read; their epoch fields are ignored.
- The map header's "N epochs · N sessions" counter and "generated …" line, and the "↑ mN" mark on a session's first message row (the session row keeps it).
- The map is quieter: no "experimental" badge or "you" labels in the Outline, no dot grid, minimap or React Flow credit, and the toolbar shows only the session count. The author shows only when more than one person recorded sessions.
- The map no longer draws the dashed return arrow and the "↩ mN" mark (a branch already shows the return; the details panel still lists it), nor the epoch tag on session rows.

### Changed
- Each session on the map now keeps its own message row width: dragging one session's edge leaves the others alone. The width is stored in the project's local `.cogit/state/map.json` (never committed, so teammates keep their own), and survives a reload or a different browser.
- Sessions left open on the map stay open after a reload; the view still lands on where you left off. Stored in the same local `.cogit/state/map.json`.

## [0.22.0] - 2026-10-30
### Added
- Drag the right edge of an open session's messages to make the rows wider or narrower, so long titles wrap into fewer lines; double-click the edge to reset. The width applies to every session and is remembered in this browser.

## [0.21.2] - 2026-10-29
### Changed
- The map no longer draws the coloured branch-name pill in front of a branch's first row and its "⋮ N more" row; it mostly repeated the message title. The lane colour still marks the branch, and the branch summary stays in the detail panel.
### Fixed
- A new session shows on the map while its first turn is still running; 0.21.1 listed it only once that turn ended.
- The side model's message ids are checked against the transcript: a node with an id it made up is no longer stored, so the real message stays unrecorded and the next catch-up records it. Before, the made-up nodes counted as recorded, the real messages were never recorded, and the closing pass wrote a stale "where it left off" line without them.

## [0.21.1] - 2026-10-29
### Changed
- The session-end pass writes each thread's outcome, what is still open and where the session left off as things stood at the end: a problem a later message fixed no longer shows as open.
### Fixed
- A session whose closing pass never finished (the machine was shut down within a minute or two of leaving, the terminal was closed, or the model run failed) is closed at the next session start in the project, in the background; before, it kept no "where it left off" line and no branch summaries. Each session is retried at most twice, and only sessions from the last three days that have been idle for ten minutes are touched.
- A side-model run that hangs is stopped after five minutes and logged as such (`COGIT_CLAUDE_TIMEOUT_MS` changes the limit); before, it waited silently until the machine shut down.
- A new session shows on the map from its first message. Before, it appeared only once its first record was written, a few turns in.

## [0.21.0] - 2026-10-29
### Added
- A session-end pass: when a session ends, the side model (Haiku by default) reads the whole session once, splits it into threads and says what each grew from. The parents follow from that, so a detour becomes a side branch and a return to earlier work hangs from where that work stopped; before, the side model chained nearly every message to the previous one. The same call writes each thread's summary and one line on where the session left off (`leftOff`). It costs about a cent per session and keeps every parent and note the main agent wrote. Run it on any recorded session with `cogit backfill <session-id> --tail --close`.
- In side-only mode the session-end pass also hangs a session's first message from the earlier session it continues, which the side model never did before.
### Changed
- Settings → Recording is one choice: **Economical** (the default for new installs: a small model records in the background and closes each session) or **Detailed** (the main agent also records its own decisions every 15 turns). The turn intervals, the side model and the session-end switch left the panel and stay on `cogit config set`; so does the main-agent-only mode. An existing config keeps the mode it has.
- A message's detail panel puts the reason first: why, what was considered and rejected and who decided, then the agent's own decisions and work, then the code. The conversation and the branch context come last, folded.
- "Message summaries" is now "One-line summary under each message", and its help says that branch summaries and where a session left off are written either way.
- A new session's first message is offered the eight most recent other sessions, each with where it left off, its branches and the message each branch ends at, instead of the last three messages of three sessions. Work from further back or the middle of a session can now be continued.
- The side model's prompt now includes what the agent did in each turn: the questions it asked with their options, the files it edited and its steps. It finds the agent's decisions and the topic of a turn in these.
### Fixed
- A map or panel whose record contains `$'`, `$&` or `` $` `` (for example a price written as "0,02 $'ın") no longer breaks with "The embedded cogit data is not valid JSON": those characters were read as a replace pattern when the data went into the page.
- A side-model catch-up no longer fails the whole write when the model sends an empty note as `null` (for example `"why": null`); such fields are left out.

## [0.20.0] - 2026-10-28
### Added
- When a new chat starts and the plugin and the `cogit` command on the PATH are different versions, a one-line notice says which one to update and how. Recording is not affected either way; the plugin's hooks run its own copy.
- A new setting, `recordHeadless` (Settings → Headless sessions), off by default. Sessions started without a person, such as `claude -p`, are no longer recorded: some plugins start one in the background for every prompt, and each turned up as an empty session on the map and a new row in the "Your turn" inbox. Turn it on to record your own `claude -p` work.
### Changed
- The README and the getting-started guide say how to keep cogit updated: turn on auto-update for the cogit marketplace once (Claude Code leaves it off for marketplaces outside Anthropic's), and update the command with npm.
- The README opens with a short recording: the panel, the map, a message hash opening the decision behind it, and `cogit why` on a file.
### Fixed
- `cogit why` works from any directory inside the project, with the path relative to where you are, as git does; it used to say the project was not initialized.
- A cogit command piped into `head` or another reader that stops early exits quietly instead of printing a `write EPIPE` stack.

## [0.19.1] - 2026-10-28
### Changed
- `cogit init` ends with the next step that fits: when Claude Code already lists the plugin as installed it says to work with Claude Code and open the map, otherwise it names the install command. It used to ask for the plugin even when it was there.
- A panel card marked "missing" says on hover that `cogit config prune` removes it, and the map guide explains the panel's list, `prune` and that the map server stops after 30 idle minutes.

## [0.19.0] - 2026-10-28
### Changed
- `/plugin install cogit` failed with `EALLOWREMOTE` for everyone on npm 12, which refuses the npm download Claude Code makes for a plugin. The plugin now installs from the repository's `plugin` branch, which a GitHub Action rebuilds on every release; the CLI still comes from npm. An existing marketplace needs `/plugin marketplace update cogit` before the install.

## [0.18.2] - 2026-10-28
### Fixed
- A project set up by an earlier `cogit init --project-settings` kept its old missing-plugin guard, which named the install command from before the move to erensrtky/cogit. Running `cogit init` again now replaces an outdated guard and marketplace entry, touching nothing else; the team setup also writes one current guard over an old one.

## [0.18.1] - 2026-10-28
### Changed
- The theme switch is one icon (a screen for the system's theme, a sun, a moon) with its meaning in the tooltip. A map's top bar puts cogit and its slogan, larger, on the left and the project's name and path in the middle. The README shows a plainer screenshot: only the map.

## [0.18.0] - 2026-10-28
### Added
- A theme switch next to Settings on the map and the panel: System (follow the system's light or dark mode), Light or Dark, remembered in the browser.

## [0.17.3] - 2026-10-28
### Changed
- The README and the guide show a current screenshot of the map, in dark or light to match the reader's theme (the map itself follows the system theme). The repository no longer carries the internal spec and test plan.

## [0.17.2] - 2026-10-28
### Changed
- The npm package is `@cogit/cli` (npm refused the bare `cogit` name as too close to an existing package): `npm install -g @cogit/cli`. The command is still `cogit`, and the plugin is still installed as `cogit`.

## [0.17.1] - 2026-10-27
### Fixed
- The project lives at github.com/erensrtky/cogit: the plugin install command, the marketplace `cogit init` writes for a team, the package links and the docs point there.

## [0.17.0] - 2026-10-27
### Added
- A user guide in `docs/guide/`: getting started, the map, reading the lineage, pull requests, teams and git, recording and cost, privacy, settings and troubleshooting. The README is now a short page with a feature list that links into it. `docs/guide/settings.md` is generated from the same texts as the panel's "?", and a test fails when it drifts.
- `cogit config --help` also explains the settings only the CLI changes: inbox age, big change, trailer age and server port, besides git policy and agents.

### Changed
- `cogit init` needs a git repository and says to run `git init` first: the record is tied to commits (`Thought:` trailers, `blame`, `why`, `pr`) and travels through git, so outside a repository only half of cogit worked. The setup offer at session start stays quiet outside a repository.

## [0.16.0] - 2026-10-27
### Added
- What the detached hook runs (the map build, the side model) print goes to `.cogit/state/detached.log` (local, never committed, starts over past 256 KB); a failed side run used to leave no trace.

### Changed
- A setting's "?" explanation now appears on hover or keyboard focus, floating over the settings, instead of opening on a click inside the row and pushing the rest of the list down.
- The side model has one name everywhere: the panel's "Catch-up model" and "Catch up on session end" are now "Side model" and "Side model at session end", and the CLI and map texts follow.
- The panel no longer lists Git policy and Agents, which it could not change: the git policy is per project and `cogit config git` without a policy now shows the current project's; `cogit config get` lists both.
- The settings modal has one Save at its bottom instead of one per setting: it saves every changed setting at once, counts the unsaved ones and marks their rows; a value the server refuses keeps its edit and shows why.

## [0.15.0] - 2026-10-27
### Added
- Recording modes (`recorder`): `mixed` (the default) records with a small side model every `sideEveryTurns` turns outside the chat and asks the main agent every `updateEveryTurns`; `agent` keeps the agent writing its own record; `side` never interrupts the agent. The side model runs detached behind the session lock, writes message nodes, titles, parents and user decisions, and never overwrites a field the main agent wrote (per-field ownership, and the agent's parent corrections survive later side runs). `sideModel` (renamed from `catchUpModel`, which is still read and migrated) names the model. Every setting gains a "?" in the panel with a plain-language explanation — what it does, when to change it, what it costs — and `cogit config --help` prints the same text.
- A logo: the c of cogito drawn as a git lane with commits, with a branch that leaves and merges back (`docs/images/cogit-mark.svg`). It heads the README and is the browser tab icon of the map and the panel, which used to ask the server for a missing `favicon.ico`. Under the slogan the README shows Descartes, after the Frans Hals portrait, with git branches running through his hair.

- `cogit init` can set the project up for a team (`--project-settings`): it enables the plugin in the project's `.claude/settings.json` and adds a hook that stops the first message of an interactive session that started without the plugin, once per session, with the install command. Headless `claude -p` runs pass through.
- The README states what recording costs: about 3–7% of a session's tokens in measured sessions.

### Changed
- The "Your turn" inbox is quieter: `inboxMaxAgeDays` now defaults to 1 day (a config that already holds a value keeps it), and a row shows the agent's last message as plain text — bold, inline code, headings, list markers and links are stripped and line breaks stay — so no `**` or backticks reach the page.
- The main agent's record interval defaults to 15 turns (was 5), and the side model records every 5 turns in between; the README states the measured cost of each mode (about 1–2% of a session with the mixed default, 3–7% with `recorder: agent`).
- The "Your turn" inbox: each row closes with an × in its top-right corner (hidden until the agent writes in that session again), rows of different projects carry their own lane colour on the left, and on a project's map the inbox starts folded to one "Your turn" line so it no longer pushes the map off the page.

## [0.14.0] - 2026-10-27
### Added
- A "Your turn" inbox above the panel's project cards and in a project map's head: one row per session whose transcript ends with the agent (read through the agent adapter) or whose record has `needsUser` items, oldest first, with the project, session title, how long it has waited, the agent's last message (first 300 characters, verbatim), the record's goal/last decision/open items labelled as the record's, and buttons to open the map at the session's newest message, copy the resume command, and dismiss. The dismissal lives in `.cogit/state/inbox.json` (local, never committed) and a newer agent turn brings the row back; `inboxMaxAgeDays` (default 7) hides older sessions, and the local server writes a dismissal through `POST /api/inbox/dismiss`.

## [0.13.0] - 2026-10-27
### Added
- A message's details show the change itself: every commit row and every changed-file row opens git's own patch (`GET /api/diff` runs `git show --format= --patch --no-color`, registered projects only, capped at about 400 KB), unified by default with line numbers on both sides, removed lines red and added lines green, and a "Side by side" toggle remembered for that viewer. Binary files read "binary file changed", a commit git no longer has stays a plain greyed row, and a map opened as a file (`file://`) says to use `cogit open` instead of failing on every click.
- `cogit why <file>` follows file → the commits that touched it → their `Thought:` messages → the decisions and rejected alternatives those thoughts recorded, newest first, each with its message hash and date. A Claude Code `PreToolUse` hook on Edit/Write/MultiEdit adds the same information to the agent's context before it writes a file: once per file per session, at most five options and about 600 characters, the rest pointing at `cogit why`; the note never blocks or changes the call, and any failure is silent (`tryBeforeNotes`, on by default, off in Settings). The lookup is exact; the wording is the record's summary.
- The map shows how much code landed after a message: each row with linked commits carries a `+1 240 −80 · 14 files` chip from `git diff --numstat` (the `Thought:` trailer union with the recorded commits, a commit counted once), the details panel states the same numbers and offers a read toggle, and rows you have not marked read above `bigChangeLines` (default 300) get a quiet highlight. The map head gains an "Unread" filter listing unread messages most code first, `cogit log --unread` prints the same list, and the panel card counts a project's unread big changes. The marks live in `.cogit/state/read.json` (local, never committed or shared) and are written by the local map server; nothing reads or classifies message text.
- `cogit pr [base]` turns a branch into a review-ready Markdown description from the thoughts behind its commits: the sessions' goals, each thought's title, summary, decisions and rejected options, its commits and changed files, and the commits with no recorded thought (`thought h… not recorded yet` when the record has not caught up). The base is the upstream's merge base, else `main`, else `master`, with a clear error when none resolves; `--json` prints the same content as data and `--copy` puts the Markdown on the clipboard. It reads only the record — never the conversation text or the user's prompts — and stays under GitHub's body limit by dropping file lists first, then summaries, saying what was left out. The record skill hands its output over instead of writing a PR description itself.

### Changed
- The help is organised for reading: `cogit --help` groups commands into Read, Map, Set up and Agent, every user-facing command carries an `Examples:` block, and the list ends with the README link. The README opens with the review bottleneck — citing Chen and Stratton's working paper on AI code output and review, with the paper's numbers — and a "Review a PR with cogit" walkthrough of `cogit pr`; `docs/format.md` states that `cogit pr` reads only the record, never conversations.
- The panel uses the map's centred 8-of-12 column, and every page names the product: "cogit" with its slogan "Cogito, ergo commit." opens the top bar, and on a served map it leads back to the panel.
- A calmer map head: the top bar holds only "cogit", the search and Settings; the project switcher (recent projects and Ctrl/Cmd+K, its button now "Switch project") sits under the project's name and path. On the panel a click anywhere on a project's card opens its map.
- A project's map has a visible "← All projects" link under its project switcher, and opening the map, "Left off here", a search step or a file click frame the whole message row (lanes and text) in the middle of the map instead of only its dot, so the message no longer sits off to the right; a row wider than the map starts at its left edge.
- A message's details list its commits and changed files as tidy rows: each commit shows its short hash, its Conventional Commits type as a coloured badge (feat, fix, docs…), its scope and description, and each file its name in bold with its folder beside it; both headings carry a count.

### Fixed
- The `Thought:` trailer follows the session that made the commit: when the agent names it (`CLAUDE_CODE_SESSION_ID`, set in every Bash and hook subprocess), `prepare-commit-msg` uses that session's newest message and ignores `.cogit/HEAD`, so two sessions sharing one working tree no longer stamp each other's thought on a commit; a named session with no readable transcript gets no trailer (never a HEAD fallback), and a human commit in a terminal still uses the fresh `.cogit/HEAD` as before. `docs/format.md` describes the three cases.
- A message row's commit tags wrap two to a line instead of being cut off at the row's edge, and the row grows to hold them.
- The git hooks work without a `cogit` on PATH (a plugin-only install): the hook block falls back to the CLI that installed it, run with `node`, and does nothing — no "command not found" — when neither is there; each prompt points an existing block at the current CLI, so a plugin update does not break it. `cogit hooks install` adds or refreshes the blocks by hand.
- The `Thought:` trailer is added in every project, also when the record stays out of git, so `blame` and `show <sha>` follow the exact link locally; only the record staging follows the commit policy. `init`, `cogit config git` and the rename migration install the hooks for both policies.
- The first code commit carries `.cogit/project.json` and `.cogit/.gitignore` with the session record, so a clone gets the project and the local-state rules, not only the sessions.
- `cogit show <sha>` for a commit whose thought is not recorded yet names that thought instead of "no recorded thought"; `cogit open` no longer reuses a map server of another cogit version (the server's health reports its version and an outdated one is asked to stop); the minimap hides on a narrow map instead of covering the messages; the setting reads "Record every N turns".

## [0.12.0] - 2026-10-26
### Added
- The record format is now an open contract: `docs/format.md` documents the `.cogit/` layout, the session file and events log, the canonical message id, parents/links/branches, the conversation store, `HEAD`, the `Thought:` trailer and schema versioning, with JSON Schemas generated from the zod schemas into `docs/schema/` (`npm run schemas`; a test fails when they drift). Everything Claude Code-specific — finding and reading transcripts, parsing hook payloads, the record skill's slash name and permission rule, transcript retention — now sits behind an `AgentAdapter` in `packages/cli/src/agents/` with one implementation, `claude`; no behaviour change.

## [0.11.0] - 2026-10-26
### Added
- npm readiness: the README now says what cogit is, shows the map, the four read verbs (`log`, `show`, `blame`, `search`), what git sees, privacy and every setting; the package carries `repository`, `homepage`, `bugs` and keywords, and `prepack` copies the repository README and LICENSE next to `package.json` so the registry page shows them. `npm pack` still ships only the bundled CLI, the plugin manifest, the skill, the hooks and those two files.

### Changed
- Activity is message time everywhere: the map's session lanes and the project switcher's last-activity date follow the newest message a session holds, so editing an old record no longer makes it look like it ran until now. The local map server watches Claude Code's transcripts while a map page is open (one recursive, debounced watcher) and rebuilds the map itself, so the page is live without the plugin's Stop hook; the watch closes when the last tab does. The `commitBetween` hint asks git for a commit that actually landed in this repository between the two messages instead of trusting a `git commit` line in the transcript, `blame` takes a `[dir]` positional like `log` and `show`, and `session show` gained `--full` for every recorded message and the parent candidates (the default stays compact). The record-update skill text is about half its former size, cutting the fixed cost of every update.

### Added
- The link from code back to the thought: a git `prepare-commit-msg` hook adds a `Thought: h…` trailer naming the newest message of the session in `.cogit/HEAD` (written by the `UserPromptSubmit` hook), so every commit carries the message it came out of. It skips merges and squashes, a `.cogit/HEAD` older than the new `trailerMaxAgeHours` setting (6 hours by default), a project whose records stay out of git and an unreadable transcript, keeps a trailer an `--amend` already had, and never blocks a commit. Build, `log`, `blame` and the Files view read the trailers back with `git log` and attach those commits to their message nodes (a trailer wins over a hash the agent listed elsewhere); `cogit show <commit-sha>` opens the thought behind a commit. `init` and `cogit config git commit` install both hooks into the directory git really uses, and `cogit hooks uninstall` removes only cogit's marked block, leaving the user's own hook lines untouched.
- The record travels with the repo: `init` now answers **yes** to committing the session records, which puts `.cogit/sessions/` and `project.json` in git while a generated `.cogit/.gitignore` keeps the local state (conversations, hooks state, locks, inbox, map, `HEAD`, backups) out; `cogit config git commit|ignore` switches an existing project without deleting anything. A git `pre-commit` hook stages the current session's record files (`.cogit/HEAD`, written by a new `UserPromptSubmit` hook) with the next code commit, but never creates a record-only commit and works with `git commit -a` and `git commit <paths>`. Each session gets an `author` (git `user.name`, else the OS user) on its first write, shown on the map's session row and in `log`, and `project.json` is written with sorted keys and one epoch per line so git merges it. New settings `shareConversations` (commit the raw chat too, off by default) and `recordCommit` (`ask`, `auto` or `off`: what to do with the messages recorded after the last code commit) are in Settings → Recording; a clone without the chat says "This conversation is not on this machine".

### Changed
- Map layout and readability: the head and the map share a centred 8-of-12 content column (full width with 16 px gutters below 1100 px), the page itself no longer scrolls so the head stays put and the map fills the rest of the window, and a wheel anywhere on the page — gutters and head included — pans the map (Ctrl+wheel still zooms, Shift+wheel pans horizontally). A message title keeps a minimum width, so the branch and "continues" chips truncate with an ellipsis instead of squeezing it into a one-letter column. Small text (dates, `mN`, counts, "not summarized yet") now reaches WCAG AA contrast, and the map has a light theme for browsers that ask for one.
- Renamed the product to **cogit** (*Cogito, ergo commit.*): the npm package and `cogit` bin, the Claude Code plugin and its `cogit:record` skill, the project dir `.cogit/`, the global dir `~/.config/cogit`, the env vars `COGIT_HOME` / `COGIT_DISABLE` (the old names still work for one minor version), the map file `map.html` and the page titles. The first cogit command or hook migrates silently: it renames an existing `.codelineage/`, moves `~/.config/codelineage` and fixes the `.gitignore` lines, or leaves both in place and warns once when both directories exist.

## [0.10.0] - 2026-10-26
### Added
- File history: a Files view on the map lists every file a recorded message touched — the paths the agent listed on the message plus the files of its commits read from git at build time — most recently touched first with a count. Opening a file lists the messages that changed it, newest first, with time, short hash, `mN`, the branch and the commits; clicking one opens that message in place on the graph and centres the view on it. `codelineage log --file <path>` prints the same list from the CLI (`--json` prints the model), and a path git knows but no record touched says so plainly.
- Lineage search: `codelineage search <text> [dir]` scans message titles, notes and decisions, branch summaries, session titles and status, and the stored conversation (never tool output) with a case- and accent-insensitive matcher that folds Turkish letters both ways (`I`, `İ` and `ı` all match; `ş`, `ğ`, `ç`, `ö`, `ü` match their plain forms). Each hit prints its short hash, `mN`, time, session, where it matched (title / branch / conversation / session) and a one-line excerpt, newest first; `-n <count>`, `--session <id|prefix>` and `--json` are there too. The map gets a search box in the page head: Ctrl/Cmd+F focuses it (a second press opens the browser's own find), matching messages are highlighted and their sessions open, a `3 / 12` counter with ↑/↓ (Enter / Shift+Enter) steps through the hits, Esc clears, and pasting a message hash (or a unique `h…` prefix) jumps to it like `show`. The session-start context and the lineage skill now point at `search` for "where did we discuss…".
- Settings modal on every page: a ⚙ Settings button in the top bar of both the project map and the panel opens the same dialog (close with ×, Esc or a click outside; focus moves into the dialog and back to the button), with one help line per setting and a "Saved" line per change. The panel's old settings box at the bottom is gone. The dialog reads the current values with `GET /api/config` (same Host / Origin / token checks as the write, and only the editable keys), and the local server now puts its per-start token in map pages too, so a map built before a change still shows the current value; over `file://` it shows the values embedded at build time read-only with a hint to use `codelineage open` or `codelineage config set`.

### Changed
- Map: the page head spans the window like the map; "Unfold all" opens every session and every folded branch, "Fold all" closes them and frames the whole map again; the outline is open by default.

### Fixed
- "Left off here" (the map's HEAD, the jump on load and the project switcher's left-off line) follows the newest message the user sent instead of the most recently updated session record, so fixing an old session's record no longer moves it there.

### Changed
- Map: the status card at the top of the page is gone; the map comes first. What it showed is in the side panel when you click a session (goal, done, pending with "needs you", next), and the agent gets it at session start.

### Added
- Map: it opens where the work left off — the newest session unfolds, the page scrolls to the map and the view centres on the newest message, without opening the side panel; a "↧ Left off here" button does the same at any time. A link with `#s=…&m=…` or `#focus=head` still wins.

## [0.9.0] - 2026-10-25
### Added
- Project switcher on the map: the most recently active projects as a tab strip, plus a Ctrl/Cmd+K (Cmd+K on macOS) search over every registered project. Each entry shows the project name, its last activity and where it left off (the newest session's next step, or its last message title), and choosing one opens that project's map focused on its own "left off here" — a page of the same local map server when the page is served by it, its `lineage.html` over `file://`. Projects whose directory is gone are left out; the registry is read at build time, with no model calls.
- `codelineage log [dir]` prints the recorded lineage like `git log --graph --oneline`, newest first: per message its short hash, `mN`, time, title, `↩` returns and commit tags, a branch's first message with the branch title, and a header line per session (title, epoch, time span). `--session <id|prefix>` narrows to one session, `-n <count>` limits the messages, `--branches` prints only the branch summaries (title, asked, outcome, open) and `--json` prints the model. `codelineage show <ref> [dir]` prints one message — session, time, parent and children as refs, returns, the branch it sits in with that branch's summary, decisions, agent decisions, work, commits with their git subjects, files and its stored conversation turn (`--no-chat` skips it, `--json` prints the model) — and takes a message hash, a unique prefix of at least six hex characters after the `h`, or `<session-id-prefix>:mN`; an ambiguous prefix lists the candidates and exits non-zero. The map's drill-down shows the message's short hash with a copy button ("Ask your agent: codelineage show <hash>").
- Session start handoff: in an initialized project the `SessionStart` hook (`startup`, `resume`, `clear`) now hands the agent what it needs to continue — that the lineage is recorded and how to read it (`codelineage log|show … -C <dir>`, spelled with the exact bundled CLI path), the rule to run `show <ref>` before answering when the user mentions a message hash or another session's `mN`, and the compressed view of the most recent other session: title, status (goal, pending with items that need the user, next) and branch summaries. The text is cut to ~1,500 tokens, oldest branches first, with a line saying how many were cut. The new `startupContext` setting (default `true`, also editable in the served panel) spends no tokens on it when off, and `log` and `show` now accept `-C <dir>` like `blame`.

### Changed
- Map: clicking a session opens its messages in place, right below its row, like an accordion; the other sessions stay on the map and the ones below move down. Several sessions can be open at once and a second click closes one; the "← All sessions" back button is gone. Opening a session no longer covers it with the side panel, which opens on a message click.

### Fixed
- Map: a mouse click on a session dot or row (project view) or on a message dot now opens it; React Flow had turned pointer events off on those nodes, so only keyboard or scripted clicks worked.

## [0.8.0] - 2026-10-24
### Added
- The panel's settings are editable on the page the local map server serves: `messageSummaries`, `language`, `updateEveryTurns`, `sessionEndCatchUp` and `catchUpModel` get a control and a Save button, and the server takes one small `POST /api/config` (same-origin only, a per-server token from the page, JSON body under 4 KB, validated with the config schema). After a write it rebuilds the panel and any open map so the pages refresh; over `file://` the settings stay read-only.
- Message summaries are optional and off by default: the new `messageSummaries` setting (also in `session show` and the catch-up prompt) tells the agent whether to write a message's `summary`; the branch summary remains the outer layer, `decidedBy`/`why`/`alternatives` are written either way, and old summaries keep showing in the drill-down.
- Code in the map: a message whose record lists commits shows them as small tag chips (short hash) on its row; `build` reads each commit's subject from git and the drill-down names it, while a commit git no longer has stays listed and is drawn greyed. `codelineage blame <file>[:<line>]` follows git blame (or every commit that touched the file) back to the messages that recorded those commits and prints the commit, session, message, summary and the map URL that opens that message; with no hit it says so plainly. The map page hands a `#s=<session>&m=<message>` URL to the drill-down, so such a URL lands on the message.
- The project map's top level is a git graph of sessions: one dot per session, titled with the session, hanging from the session its first message continues, with parallel lanes for sessions that run at the same time without a link and the epoch shown as a tag on the dot. Clicking a dot opens that session's message graph in place (a "← All sessions" control returns), and the session panel shows its status as a "squash message" (goal, done, pending, next). The epoch and session boxes and the `elkjs` layout are gone; both levels use the same layout engine. Live rebuilds keep the open session, selection and viewport.
- The conversation store: `build` appends what the drill-down needs for turns not stored yet to `.codelineage/conversations/<sessionId>.jsonl.gz` (one gzip member per append, redacted with the same secret net as the page), reads it before the transcript, and keeps showing a session's conversation after Claude Code deletes the transcript. `init` writes `.codelineage/.gitignore` with `conversations/` even when `.codelineage/` is committed, an existing project gets the line on its next build, and the README explains where the raw chat lives. Stored turns keep the message's stable id, so ids survive the transcript.
- Stable message ids: a message node is now `h` + the first 12 hex of the SHA-256 over `{sessionId, uuid, at, text}`, derived from the user message and not from its parent, so correcting a parent never renames a message (and its notes stay attached). `m1`, `m2`, … stay as display labels; `session show` prints both and `session write` accepts either. Records written before this are renamed on load and persisted on their next write.
- Structure as append-only facts: each session gets `sessions/<sessionId>.events.jsonl` (`{ at, type: parent|link|unlink, msg, target, by }`), replayed to build the graph (last parent wins). Notes stay in the session JSON keyed by the stable id and may be updated freely. A changed parent or link appends an event instead of overwriting; unchanged input writes nothing, and an old record's existing structure is seeded before its first change. The hidden `codelineage migrate [dir]` upgrades a project's old records in one go (idempotent, backup in `.codelineage/backup-pre-8.5/`).
- Cross-session lineage: a session's first message can hang from a message of an earlier session of the same project by writing `parent` as `<sessionId>:<messageId>` (`links` accept the same form). `session write` keeps such a reference only when the other session exists, started no later and holds that message; otherwise it warns and falls back to the previous message, as for any other bad parent. `session show` adds `candidates` (the last three messages of the three most recently updated other sessions) for a session's first unrecorded message, with `continuesHint` when the message says it continues ("devam", "kaldığımız yerden", "continue") or the transcript read a handoff file, and the skill gained the matching parent rule. On the map the message reads as a root of its own session plus a "↑ continues <session> · m67" mark that opens that session at the message.

### Fixed
- Map: long message titles and branch labels in the git graph wrap onto more lines (the row grows) instead of being cut with an ellipsis; a not-yet-summarized message shows up to 200 characters of its text instead of 80.
- Transcript: `[Request interrupted by user]` and `[Request interrupted by user for tool use]` lines are Claude Code's own notes, not user messages; they no longer become message nodes.

## [0.7.0] - 2026-10-23
### Added
- Lineage records: each message node now hangs from the earlier message it reacts to (or is a new root), with up to five `links` back to other messages and a `branch` summary (title, asked, outcome, open) on the first message of each branch. `session write` moves a parent that is not an earlier message to the previous message and drops links that are not earlier messages, with a warning; `session show` hints each unrecorded message with `gapMinutes`, `resumed` (a `/clear` or a resume in between) and `commitBetween` (a commit this session made), and lists the last recorded messages with their parent.

### Changed
- The map draws each session as a git graph of the user's messages: one row per message in send order, one coloured lane per branch, a hollow ring and the branch title at a branch's first row, a curve out of the message a branch reacts to, and a dashed return arrow through a channel left of the lanes with "↩ m22" on the row. Long branches fold to first / "⋮ N more" / last with an "Unfold all" toggle, the newest branch starts unfolded and "left off here" marks the newest message. A clicked row opens the branch summary (range, count, time span, asked / outcome / open) above the existing message drill-down, and the map opens framed on the newest message at a readable zoom. Records whose message parents point at topics render as one chain; the old topic layout and its card sizing are removed. Live rebuilds keep the selected branch, unfolded branches, scroll and zoom.

### Fixed
- `open` adds an initialized project that is missing from the global registry (for example one set up inside a sandbox with its own home) back before serving it; the local map server only shows registered projects, so such a map returned "not found". When the registry cannot be written, `open` opens the file instead.

## [0.6.0] - 2026-10-23
### Added
- Live map server: `codelineage open` makes sure one background server per user runs on `127.0.0.1:<serverPort>` (new setting `serverPort`, default 4747) and opens the map or the panel through it, returning at once. A served page refreshes its data when the map is rebuilt without losing open topics, selection, zoom or scroll, and the panel's links point at those live maps; over `file://` nothing changes. The server serves only registered projects' maps and the panel, rejects a foreign `Host` header (DNS rebinding), binds loopback only and exits after 30 idle minutes. When the port is taken or the server cannot start, `open` opens the file as before and prints one line saying so.
- Live map: the `Stop` hook rebuilds `lineage.html` after every turn, detached like the SessionEnd catch-up and skipped while a build or the session's write holds its lock (a new `build` lock in `build`, `codelineage build --quiet` for the child). The build draws the user messages the record does not hold yet as cards titled with their first words, marked "not summarized yet" and sitting in a "New" topic at the end of the session, so the newest message is on the map before the agent summarizes it; "left off here" marks the newest of them and their drill-down shows the conversation from the transcript.

## [0.5.0] - 2026-10-23
### Added
- SessionEnd catch-up: when a session ends with user messages that have no node yet, the `SessionEnd` hook starts a detached `codelineage backfill <session-id> --tail` and returns at once; the child reads those messages with the agent's replies, runs `claude -p --safe-mode --no-session-persistence` with the skill's record rules on `catchUpModel` (default `haiku`) and passes the answer through `session write` (validation, redaction, transcript times, rebuild). The tail is not stored, so a dead child is retried from the transcript next time. With `sessionEndCatchUp` off no tokens are spent, and the map shows "N messages not recorded" on that session.
- SessionStart setup hint: on `startup` or `resume` in a project without `.codelineage/`, the plugin offers setup to the agent (it says codelineage is not set up and sets it up only when the user asks, running the bundled `init` with the answers), and the hint notes that a plugin update reaches a running session only after `/reload-plugins` or a new chat. `codelineage config hint-off [dir]` silences the hint in that project ("don't ask again", kept in the global `setupHintOff` list, keyed by the main checkout so a worktree is covered) and `codelineage config hint-on [dir] [--all]` turns it back on. `CODELINEAGE_DISABLE=1` still silences every hook.
- Compaction safety net: SessionStart with `source: "compact"` reads the transcript and, when user messages have no lineage node yet, asks the agent through `additionalContext` to run `/codelineage:lineage` (compaction keeps every transcript line, so nothing is lost and no snapshot is taken). `session show` also adds a `transcriptWarning` when the transcript has user lines but none reads as a message, so a Claude Code format change is noticed instead of silently recording nothing.
- The map shows the conversation: a message's drill-down has the message as the user wrote it and the agent's written replies (tool output left out, tool use counted in one line), with buttons to step to the previous or next message across topics. `build` reads it from the Claude Code transcript into `lineage.html` only, which is never committed; session files still hold no raw text. Long entries open folded; a deleted transcript is said so.
- The map is the user's messages: each message the user wrote becomes one node (`kind: "message"`, ids `m1`, `m2`, … in transcript order), titled in the user's words with what came of it, grouped under topics and ordered by when it was sent. `session show` reads the session's Claude Code transcript and lists the messages that have no node yet, and `session write` takes their times from it. The agent's own work moves into the node's detail (`work`, `agentDecisions` with reasons and rejected options, `commits`, `files`), "left off here" marks only the last message, and the `/codelineage:lineage` skill is rewritten for this. Older records keep their step, decision and question nodes.
- Git worktree support: a Claude Code session in a linked worktree (`claude -w`) now records into the main checkout's `.codelineage/` when it is git-ignored (a worktree with its own committed copy keeps it), found by reading `.git` files without running git. Hooks, `session write/show`, `epoch add`, `build` and `open` all resolve it; the session keeps the worktree path and branch, and the map's drill-down shows them.
- Decision detail in the record and the map: nodes take `decidedBy` (`user`, `agent` or `agreed`), `alternatives` (options considered and rejected, with the reason), `commits` and `files`; decision cards show their reason and a short line such as "agreed · 1 commit · 2 options rejected", and the drill-down panel lists the rejected options, the commits and files, who decided, and when the node was recorded and last changed. The `/codelineage:lineage` skill asks the agent to fill them in.
- Map shows where the work left off: `session write` now stamps each node it adds or changes (`touchedAt`, set by the CLI and never taken from agent input), and the map opens the branches down to the nodes the last write of the latest session added or changed, marks each "left off here" and frames that session.
- Claude Code plugin skeleton: the `codelineage` npm package is also the plugin (`.claude-plugin/plugin.json`, bundled `dist/cli.js`), and the repository root carries a `codelineage` marketplace that installs it from npm.

- `/codelineage:lineage` skill: injects this session's compact record and the project's epochs, asks the agent for only what is new or changed, and has it save the JSON with the Write tool and run `session write --file … --consume` (JSON piped through a shell heredoc is blocked by Claude Code's command checks). It is pre-approved for exactly those two actions and answers "up to date" when nothing changed.
- `codelineage session show <id> [-C dir]`: prints the compact record the skill updates (epochs, summary language, title, epoch, status and node ids/parents/kinds/titles, plus the inbox path) as JSON, and reports an uninitialized project or an unreadable record in that JSON instead of failing.
- Stop hook (`hooks/hooks.json`, `codelineage hook stop`): counts completed turns per session in `.codelineage/state/<id>.json` and, every `updateEveryTurns` turns since the record last changed, asks the agent to run `/codelineage:lineage` through `additionalContext` ("Stop hook feedback", not an error). Turns a stop hook continued are not counted; before `init`, with `CODELINEAGE_DISABLE=1`, on a busy lock or on any error it does nothing, and an unreadable state file is replaced.
- `codelineage init` asks whether the agent may run the lineage skill without a prompt each time and, if so, adds `Skill(codelineage:lineage)` to `permissions.allow` in Claude Code's user settings (backed up first, skipped when already there); `--allow-skill` / `--no-allow-skill` answer it, `--yes` alone never adds it, and `--allow-skill` also works on an already initialized project. Without the rule, Claude Code asks before every automatic update.
- `codelineage session write --consume`: deletes the `--file` input once the record is saved and keeps it when the write fails. `gitPolicy=commit` now also ignores `.codelineage/inbox/`.

### Changed
- Map orders topics left to right, and items top to bottom, by when their thread began: `session write` stamps each new node with `addedAt` (set by the CLI, never by the agent), and a topic starts at its earliest item, so renaming or moving topics no longer scrambles the order. Nodes recorded before the stamp keep their stored order, first.
- Map cards size themselves to their text: titles and summaries wrap onto as many lines as they need instead of being cut off with "…", and the cards below move down to make room.
- Map opens like layers of an onion: sessions run down the page in time order, and inside the latest session only its top-level topics show, side by side as columns with an "N items inside" count; an opened topic lists its items down its column, nested ones indented, and any node with children expands and collapses on click (selecting a nested item in the outline opens every layer above it). Phases are labelled "topic", and collapsed session boxes are wide enough for their titles.
- `/codelineage:lineage` skill: organizes nodes by topic instead of by time (topics and sub-topics at any depth, time order kept inside each), reuses existing topics and moves misplaced nodes by resending them with the right `parent`.
- The npm package and the plugin manifest now take their version from `VERSION` (the one `./release` bumps): `npm run build` and `npm pack` copy it through `scripts/sync-version.mjs`, and a test fails while they differ. Both move from 0.1.0 to 0.4.0, so the first release continues at 0.5.0.
- Map: the graph now spans the full window width and nearly its full height (the header and status card stay at a readable width), and a "Full screen" button expands it over the whole window, entering browser full screen when allowed; Esc or the button closes it.
- `commander`, `zod` and `@inquirer/prompts` moved to `devDependencies`: they are bundled into `dist/cli.js`, so installing the package pulls in no runtime dependencies.

### Fixed
- Map: opening or closing a session or topic no longer zooms the whole map out to fit; the zoom stays and the clicked box keeps its place on screen. The mouse wheel now scrolls the map; Ctrl+wheel or a pinch zooms.
- Status card: goal, done, pending and next now come from the most recently updated session that recorded a status, so a newer session without one no longer blanks the card; last activity still tracks the newest session.
- `codelineage build` printed each skipped-session warning twice (once for the map, once for the panel); the panel now stays quiet about the project just built.
- Collapsed session headers in the map show a short date (full time on hover), so the session title is no longer cut off after a few characters.

## [0.4.0] - 2026-10-21
### Added
- `codelineage config prune [--dry-run]`: removes registry entries whose project directory no longer exists, lists every removed entry and leaves the registry untouched with `--dry-run` (a corrupt registry is refused, never treated as empty).
- Global panel: `codelineage build` also refreshes `~/.config/codelineage/panel.html` (honouring `CODELINEAGE_HOME` / `XDG_CONFIG_HOME`) with one card per registered project — last activity, pending `needsUser` count, a `file://` link to its map, a "missing" mark when the directory is gone and read-only settings from `config.json`; `codelineage open` without a directory builds and opens it.

## [0.3.0] - 2026-10-21
### Added
- `codelineage open [dir]`: rebuilds the map and hands `lineage.html` to the OS opener (`xdg-open`, `open` or `start`), printing the path when no opener is found; without a directory it explains that the global panel arrives with Epic 3.
- Experimental outline side view in the map: a collapsible epoch → session → node tree behind a "Show outline" toggle (off by default); selecting a row expands the graph groups it needs, centres that node and opens the drill-down panel, while graph clicks highlight the matching row.
- Drill-down side panel in the map: clicking a node or session shows title, kind, summary, why, timestamps and the owning session, with a "Copy resume command" button (`cd '<path>' && claude --resume <id>`, clipboard plus a `file://` fallback). `build` marks sessions whose Claude Code transcript no longer exists, disabling the button with "session no longer available".
- Nested lineage graph in the map: React Flow 12 renders epochs → sessions → nodes as collapsible groups, ELK lays them out top-down in the page, with a minimap, controls and kind colours; the latest session opens expanded. 495 nodes lay out in ~96–155 ms per change in Chromium from `file://`.
- Status card at the top of the map: goal, done, pending and next from the most recently updated session, with `needsUser` items merged from every session active within 7 days (deduplicated by text, newest first).
- Template workspace (`packages/template`): React 19 + Vite 8 + `vite-plugin-singlefile`, dev fixture and the shared lineage view-model contract (`packages/cli/src/view/model.ts`).
- `codelineage build [dir]`: renders `.codelineage/lineage.html` from `project.json` and `sessions/*.json` (epochs in project order, nested node tree, unassigned sessions grouped), skips unreadable session files with a warning, redacts secrets and embeds the single-file template into the CLI bundle; `session write` rebuilds quietly afterwards.

## [0.2.0] - 2026-10-21
### Added
- `codelineage` CLI skeleton (`--version`, `--help`), MIT license.
- `codelineage init`: creates `.codelineage/`, registers the project, asks for git policy, Claude Code transcript retention (`cleanupPeriodDays`, with backup) and summary language; `--yes` and per-question flags for non-interactive use.
- `codelineage config get/set` and `codelineage epoch add`.
- `codelineage session write`: validates agent JSON from stdin or `--file`, redacts secret-looking values, merges into the session file under a lock.

