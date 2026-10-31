# Privacy

cogit has no server and no account. Everything runs on your machine; the only network calls
are the ones your own Claude Code login makes for the side model.

## What is recorded

The record (`.cogit/sessions/`) holds titles, short summaries, decisions with their reasons
and rejected options, the agent's work items, commit hashes and file paths. Never tool output,
never file contents. The agent is told never to record secrets, credentials or personal data,
and a redaction pass for key and token patterns runs over everything the map writes or shows.

## What stays on your machine

- **The raw conversation.** `.cogit/conversations/` keeps a copy of each transcript so the map
  still works after Claude Code deletes it. It stays out of git unless you turn
  `shareConversations` on. Turn it on only if everyone who can read the repository may read
  your chats, and never in a public repository.
- **The map** (`.cogit/map.html`) shows the conversation, so it is never committed.
- **Local state:** the inbox, the map view, locks.

## What git carries

Under the default commit policy, the record travels with your branch. Anyone who can read the
repository can read the titles, decisions and reasons. If the repository is public, so is the
record. Choose the ignore policy for a project where that is not wanted; see
[Teams and git](teams-and-git.md).

`cogit pr` reads only the record, never the conversation, so its output is safe to paste into
a public pull request.

## Transcripts

Claude Code deletes transcripts after `cleanupPeriodDays` (30 days by default). `init` offers
to raise it and never changes it without asking. The conversation store keeps what cogit
already read either way.
