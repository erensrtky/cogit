# The map

```bash
cogit open .      # this project's map
cogit open        # the panel: every project on this machine
```

`cogit open` builds the page and serves it on `127.0.0.1` (port 4747, `serverPort`), starting
the server in the background if it is not running. The page refreshes itself whenever the
record changes and keeps your place: the selected message, the unfolded branches, the scroll
and the zoom. Nothing is sent anywhere; the server answers only this machine. The server
stops on its own after 30 minutes without a page open; the next `cogit open` starts it again.

The panel lists every project `cogit init` set up on this machine. A project whose directory
was deleted or moved stays as a card marked "missing"; `cogit config prune` removes those
(`--dry-run` lists them first).

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../images/map-dark.png">
  <img src="../images/map-light.png" alt="The map: sessions, branches and the decision behind a message">
</picture>

## Sessions and branches

The map reads like a git graph of your conversations. Time runs down the page.

- **A session** is one Claude Code chat. Its header shows the title and when it ran.
- **A row** is one message you sent, titled in your words and saying what came of it.
- **A branch** is a chain of messages that answer each other. It gets its own coloured lane;
  its first message is a hollow ring carrying the branch's title. A new topic in the same chat
  starts a new branch, and a message that goes back to an older thread curves out of that
  thread.
- **A return** to an earlier message without continuing it is a dashed arrow, marked
  `↩ m22` on the row.
- **Long branches fold** to their first and last message and a "⋮ N more" row. "Unfold all"
  and "Fold all" open and close every branch at once.
- **"Left off here"** marks the newest message you sent. The map opens there.

A message with commits carries them as small chips with the commit subject, and a
`+1 240 −80 · 14 files` chip saying how much code landed after it.

## Message details

Click a row to open its details on the right:

- the branch it belongs to, with the branch summary: what was asked, what came of it, what is
  still open
- what was decided, who decided (you, the agent, or both), why, and the options considered
  and rejected
- what the agent did and decided on its own
- the commits and files, each one opening git's own diff
- the conversation turn itself: your message as written and the agent's written replies (tool
  output is left out). This comes from your machine only; see [Privacy](privacy.md).
- previous and next message buttons, and two small buttons that copy a command for the
  whole session: **Resume** (`cd '<project>' && claude --resume <session-id>`) reopens the
  chat where it left off, and **Fork** adds `--fork-session`, so the chat goes on as a new
  session with the same history and the original stays as it was.

## "Your turn"

Above the panel's project cards, and folded in a project map's head, the "Your turn" inbox
lists the sessions waiting on you: the agent wrote last, or the record says it needs your
answer. Each row shows the project, the session and the agent's last words, with a link
straight to that message. The × hides a row until the agent writes in that session again.
Sessions older than a day (`inboxMaxAgeDays`) leave the inbox; the map still has them.

## Unread

"Unread, most code first" lists the messages with commits you have not opened yet, the ones
that changed the most code first. It is the quickest way to catch up on what a teammate's
sessions did. Messages past `bigChangeLines` get a quiet highlight. Read state stays on your
machine. In the terminal: `cogit log --unread`.

## Files

The Files view lists every file a recorded message touched, most recently first, with a
count. Opening a file lists the messages that changed it; opening one of those jumps to it on
the map. In the terminal: `cogit log --file <path>` and `cogit why <path>`.

## Search

The search box in the top bar (Ctrl+F or Cmd+F) finds text in message titles, decisions,
branch summaries, session titles and the stored conversation, ignoring case and accents. Enter
and Shift+Enter step through the hits, Esc clears. A pasted message hash jumps straight to that
message. In the terminal: `cogit search "<text>"`.

## Switching projects

Under the project's name, a strip of the most recently active projects and
**Switch project** (Ctrl+K, Cmd+K on macOS) search every project on this machine. Each shows
where it left off. "← All projects" goes to the panel.

## Theme

The icon next to Settings switches the theme: a screen follows your system's light or dark
mode, a sun is light, a moon is dark. Hover it to see which is on. The choice is remembered in this browser.

## Settings

**Settings** in the top bar changes the global settings. A "?" next to each one explains it;
there is one Save for all changes. See [Settings](settings.md).

## Without the server

`.cogit/map.html` is a single file and opens without the server too, read-only. It is never
committed: it can contain conversation text.
