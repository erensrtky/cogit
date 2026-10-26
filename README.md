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

## Privacy and what travels with the repo

- The skill records decisions and rationale, never raw chat; session files hold
  titles and summaries only.
- `init` asks whether to commit the session records and now answers **yes** by
  default: `.cogit/sessions/` and `project.json` travel with a clone, while
  `.cogit/.gitignore` keeps local state (`conversations/`, `state/`, `locks/`,
  `inbox/`, `map.html`, `HEAD`, backups) out. Switch an existing project with
  `cogit config git commit|ignore`.
- A git `pre-commit` hook stages the current session's record with the code
  commit, so a clone keeps the "why". It never creates a record-only commit.
- The map's Conversation panel needs the real turns, so `build` reads them from
  Claude Code's local transcript and keeps a copy in
  `.cogit/conversations/<sessionId>.jsonl.gz`. This store lets the panel keep
  working after Claude Code deletes the transcript.
- That copy stays on this machine by default. Turn on `shareConversations`
  (Settings → Recording, or `cogit config set shareConversations true`) to commit
  it too; a clone without it says "This conversation is not on this machine".
- Each session records its author (git `user.name`, else the OS user) on its
  first write, shown on the map and in `cogit log`.
- `recordCommit` controls the last messages after the last code commit: `ask`
  (default) offers a `chore(cogit): record <title>` commit at the next session
  start, `auto` commits exactly the record paths at session end, `off` does
  nothing. Both settings are in Settings → Recording.
- Both the page and the conversation store go through the same redaction pass
  (common key and token patterns) before anything is written.
- Claude Code deletes transcripts after `cleanupPeriodDays` (30 days by default).
  `init` offers to raise it, never silently.
