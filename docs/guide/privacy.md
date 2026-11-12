# Privacy

cogit has no server and no account. Everything runs on your machine. The network calls are:

- the ones your own Claude Code or Codex login makes for cogit's background runs (the side model
  and the closing pass);
- once a day, one question to npm: "what is the newest version of @cogit/cli?" Nothing about you,
  your code or your chats goes with it. It lets cogit say when an update is out; turn it off with
  `cogit config set updateCheck false`.

## What is recorded

The record (`.cogit/sessions/`) holds titles, short summaries, decisions with their reasons
and rejected options, the agent's work items, commit hashes and file paths. Never tool output,
never file contents. The agent is told never to record secrets, credentials or personal data,
and a redaction pass runs over everything the map writes or shows: provider tokens through
[secretlint](https://github.com/secretlint/secretlint)'s recommended rules, and passwords typed on
a command line (`mysql -p…`, `PGPASSWORD=`, `curl -u`, `--password …`) through cogit's own
patterns. It is a safety net, not a guarantee: a secret in a shape neither knows gets through.

## What stays on your machine

- **The raw conversation.** `.cogit/conversations/` keeps a copy of each transcript so the map
  still works after Claude Code deletes it. It is never sent unless you turn
  `shareConversations` on in a project that shares its record. Turn it on only if everyone who
  can read the repository may read your chats, and never in a public repository.
- **The map** (`.cogit/map.html`) shows the conversation, so it is never committed or sent.
- **Local state:** the inbox, the map view, locks.
- **The record itself**, unless you choose to share it. `cogit init` asks, and no answer means
  no. Private is the default for public and private repositories alike.

## What sharing sends

If you share the record, `git push` also sends it to your own repository, on refs outside your
branches (`refs/cogit/`). It does not appear in the file tree, in pull requests or on GitHub's
pages, but **hidden is not private**: anyone who can read the repository can download the titles,
decisions and reasons with one command. If the repository is public, so is the record. Each push
prints how many session records will follow it. A repository you share in while it is private shows
that record to everyone if it later goes public.

`cogit pr` reads only the record, never the conversation, so its output is safe to paste into
a public pull request.

## Deleting

`cogit prune --older-than 1y` deletes your old sessions here and in the repository. Use it to
keep the record small, not to take back a secret: copies already on teammates' machines stay
until they delete them, and a host can keep deleted data for a while. To remove a secret, treat
it as leaked and rotate it.

## Transcripts

Claude Code deletes transcripts after `cleanupPeriodDays` (30 days by default). `init` offers
to raise it and never changes it without asking. The conversation store keeps what cogit
already read either way.
