# cogit

**Cogito, ergo commit.**

Git remembers what changed. cogit remembers why.

The lineage of your AI coding sessions: every user message hangs from the message
it reacts to, and the map draws each session as a git graph you can zoom into.

## Quick start

```bash
npm install -g cogit
cogit init          # answer the setup questions in the project you work in
cogit open          # open the map in the browser
```

`init` also installs the Claude Code side: the lineage skill updates the record as
you work, the hooks rebuild the map after each turn and at the end of a session.

## Privacy

- The skill records decisions and rationale, never raw chat; session files hold
  titles and summaries only.
- The map's Conversation panel needs the real turns, so `build` reads them from
  Claude Code's local transcript and keeps a copy in
  `.cogit/conversations/<sessionId>.jsonl.gz`. This store lets the panel keep
  working after Claude Code deletes the transcript.
- That copy never goes into git: `init` writes `.cogit/.gitignore` with
  `conversations/`, even when you chose to commit `.cogit/`, and every build
  makes sure the line is there.
- Both the page and the conversation store go through the same redaction pass
  (common key and token patterns) before anything is written.
- Claude Code deletes transcripts after `cleanupPeriodDays` (30 days by default).
  `init` offers to raise it, never silently.
