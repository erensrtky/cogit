# Pull requests

A reviewer reading a diff sees what changed, not why. `cogit pr` turns a branch into a
description with the goal, the decisions behind the code and the options that were rejected.

On the branch, before opening the pull request:

```bash
cogit pr main --copy   # Markdown on stdout, also copied to the clipboard
```

Without a base it uses the branch's upstream merge base, else `main`, else `master`. Paste the output into
the pull request description on github.com, or with the GitHub CLI:

```bash
gh pr create --body "$(cogit pr)"
```

## What it prints

The goal, the sessions the work came from, each message with its decisions and rejected
options, and its commits and files. For example:

```markdown
## Goal
- Add refresh-token rotation — Refresh tokens (9c32ab18)

## Sessions
Open a whole session with `cogit log --session <id>` or the map.
- Refresh tokens (9c32ab18) · m12–m29 · 2026-10-24 09:12 → 2026-10-24 11:40

## Thoughts

### `hb7a9882` 9c32ab18:m24 — Rotate refresh tokens on use

- Why: A leaked refresh token should stop working as soon as it is used.
- Decided by: agreed
- considered and rejected: shorten the token lifetime — it logs people out too often

Commits:
- `a1b2c3d` feat(auth): rotate refresh tokens on use
  - `src/auth/tokens.ts`

## Commits without a recorded thought
- `e4f5a6b` chore: bump deps — thought `h9c8b7a6` not recorded yet

## Dig deeper
- `cogit show <message-hash>` opens a thought: its decisions, the options it rejected, and the conversation turn for whoever has it locally.
- `cogit show <sha>` opens the thought behind a commit.
- This branch commits its record, so a reviewer who checks it out gets the same `cogit show` output.
```

## Safe on a public pull request

`cogit pr` reads only the record's titles, summaries and decisions, never the conversation
text or your prompts as written.

## For the reviewer

Under the default commit policy the record travels with the branch, so a reviewer who checks
it out and has cogit installed can run `cogit show <hash>` or open the map on the same
messages. Under the ignore policy the description says the hashes resolve only on the author's
machine.

cogit does not promise a faster review; nothing has measured that yet. It hands the reviewer
the intent they would otherwise have to ask for in comments.
