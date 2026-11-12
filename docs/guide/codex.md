# Codex

cogit records [Codex CLI](https://github.com/openai/codex) sessions the way it records Claude
Code's: one node per message, the commits they led to, and the same map. A project can mix
both agents; the map marks the sessions that ran on Codex with a small label.

Tested on Linux with Codex CLI 0.167.

## Install

1. The command, if you do not have it yet:

   ```bash
   npm install -g @cogit/cli
   ```

2. The plugin, in a terminal:

   ```bash
   codex plugin marketplace add erensrtky/cogit
   codex plugin add cogit@cogit
   ```

3. **Trust the hooks.** Start Codex in a project (`codex`). It says that cogit's hooks need
   review; accept them, or trust them later in `/hooks`. Until you do, Codex skips the hooks
   without a word, and nothing is recorded.

4. In your project:

   ```bash
   cogit init
   ```

`cogit doctor` says which of these steps is still missing.

## After every update, review the hooks again

Codex trusts a plugin's hooks together with a fingerprint of the whole plugin. Any new cogit
version changes that fingerprint, even when the hooks themselves are the same, so after each
update Codex holds the hooks back until you review them again:

- an interactive Codex says the hooks need review when it starts;
- `codex exec` prints `hook: Stop Failed` and the like, and records nothing.

To update:

```bash
codex plugin marketplace upgrade cogit
codex plugin add cogit@cogit
```

Then start Codex once and accept the review. `cogit doctor` notices when you have not:
"cogit changed since you trusted its hooks".

## Recording

Recording needs nothing from you: the hooks ask the agent to keep the record up to date, and a
side run fills the gaps. To record by hand, use the skill: `$cogit:record` in Codex
(`/cogit:record` in Claude Code).

cogit's own runs for a Codex session (the side runs and the closing pass) run on Codex too,
with your Codex login: `codex exec` in a read-only sandbox, with hooks off, leaving no session
of their own behind.

- **Model.** A ChatGPT account refuses Claude model names, so the side model setting (Haiku by
  default) does not apply: these runs use Codex's default model.
- **Cost.** Codex reports tokens but no price. The spend log keeps the tokens; the dollar
  figure on the map's home page leaves Codex runs out and says so.

## `codex exec`

Headless runs follow the **Background work** setting, as `claude -p` does
([Loops, sandboxes and agent factories](loops-and-sandboxes.md)):

- with it on, a `codex exec` that a script, a loop or cron starts is recorded, and its record
  is finished before `codex exec` returns;
- with it off, only the sessions you type into are recorded;
- `COGIT_RECORD=1` in the environment always records a run.

A run needs write access to the project's `.cogit/` directory and to Codex's own directory
(`~/.codex`, or `CODEX_HOME`), where the session transcripts are.

## Resume and fork

`codex resume <id>` and `codex fork <id>` continue a Codex session; the map's Resume and Fork
buttons copy these commands for a Codex session. A fork hangs from the session it came from.

## Limits

- **Who started an interactive session.** An interactive Codex runs its hooks from a
  background server, so cogit cannot see what started the session, and every interactive
  Codex session counts as one a person typed into. A Codex chat also cannot pass cogit's
  mark to the commands it runs, the way a Claude Code chat does.
- **Session end.** Codex gives the session-end hook at most three seconds and can send it
  late. The closing pass runs in the background, and when it never ran, the next session in
  the project closes the session.
- **Compressed transcripts.** Codex compresses old transcripts to `.jsonl.zst`. cogit reads
  them on Node 22.15 or later; on an older Node it skips them, and `cogit doctor` counts them.
- **Retention.** Codex keeps its transcripts until you delete them, so `cogit init` asks no
  retention question for Codex.
- **Steps.** Codex does not describe the steps of a tool call, so a Codex message lists its
  tool counts without them.
