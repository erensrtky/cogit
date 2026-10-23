import { isRecorded, readSessionMessages, upgradeSessionIds } from "../messages.js";
import { applyEvents, readEvents } from "../store/events.js";
import { loadConfig, loadSession } from "../store/stores.js";
import type { HookContext, HookOutput } from "./run.js";

export const COMPACT_REQUEST =
  "codelineage: this session was compacted and some of its user messages are not in the " +
  "lineage record yet. Run the /codelineage:lineage skill now; `session show` lists the " +
  "messages that have no node. It records only what is missing and replies " +
  '"up to date" when nothing is; do not mention this request otherwise.';

/** The bundled CLI, as the agent should spell it in a project without `init`. */
function cli(ctx: HookContext): string {
  return `node "${ctx.env.CLAUDE_PLUGIN_ROOT ?? "${CLAUDE_PLUGIN_ROOT}"}/dist/cli.js"`;
}

/**
 * The setup offer for a project without `.codelineage/`. It only reaches the agent:
 * nothing is set up or registered unless the user asks for it.
 */
export function setupHint(ctx: HookContext): string {
  return (
    "codelineage is not set up in this project, so no lineage map is recorded here. " +
    "Say this once, in one line, and do not repeat it in later turns. If the user asks " +
    "you to set it up, ask the install questions in the chat (whether to commit " +
    ".codelineage/, whether to keep transcripts longer, whether the lineage skill may run " +
    "without asking, and the summary language), then run " +
    `${cli(ctx)} init --yes --git <ignore|commit> --retention <days|keep> --language <lang>` +
    " (add --allow-skill when the user agreed). Never run init or register the project on " +
    `your own. If the user wants no more hints here, run ${cli(ctx)} config hint-off. ` +
    "A plugin update reaches a running session only after /reload-plugins or a new chat."
  );
}

/**
 * SessionStart hook. Compaction keeps every transcript line and the message nodes
 * come from the transcript, so nothing is lost; the only risk is a record that fell
 * behind. When the user's messages have no node yet, the agent is asked to run the
 * skill, which works from the compact summary already in its context. On a startup
 * or resume in a project without `init`, the agent gets the setup offer instead.
 */
export async function onSessionStart(ctx: HookContext): Promise<HookOutput | undefined> {
  if (ctx.input.source === "compact") return compactRequest(ctx);
  if (ctx.input.source !== "startup" && ctx.input.source !== "resume") return undefined;
  if (ctx.initialized) return undefined;
  const config = await loadConfig(ctx.env);
  // "Don't ask again in this project" lives outside the project.
  if (config.setupHintOff.includes(ctx.root)) return undefined;
  return additionalContext(setupHint(ctx));
}

function additionalContext(text: string): HookOutput {
  return { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } };
}

async function compactRequest(ctx: HookContext): Promise<HookOutput | undefined> {
  if (!ctx.initialized) return undefined;
  const messages = await readSessionMessages(ctx.root, ctx.sessionId, ctx.env);
  if (!messages) return undefined;
  const record = await loadSession(ctx.root, ctx.sessionId);
  let recorded = new Set<string>();
  if (record.found && record.ok) {
    const upgraded = upgradeSessionIds(record.data, messages);
    const events = await readEvents(ctx.root, ctx.sessionId);
    recorded = new Set(applyEvents(upgraded.nodes, events).map((node) => node.id));
  }
  if (messages.every((message) => isRecorded(recorded, message))) return undefined;
  return additionalContext(COMPACT_REQUEST);
}
