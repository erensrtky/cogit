import { loadSession } from "../store/stores.js";
import { findTranscript, readUserMessages } from "../transcript.js";
import type { HookContext, HookOutput } from "./run.js";

export const COMPACT_REQUEST =
  "codelineage: this session was compacted and some of its user messages are not in the " +
  "lineage record yet. Run the /codelineage:lineage skill now; `session show` lists the " +
  "messages that have no node. It records only what is missing and replies " +
  '"up to date" when nothing is; do not mention this request otherwise.';

/**
 * SessionStart hook for compaction. Compaction keeps every transcript line and the
 * message nodes come from the transcript, so nothing is lost; the only risk is a
 * record that fell behind. When the user's messages have no node yet, the agent is
 * asked to run the skill, which works from the compact summary already in its
 * context. Other sources (`startup`, `resume`, `clear`) are handled elsewhere.
 */
export async function onSessionStart(ctx: HookContext): Promise<HookOutput | undefined> {
  if (ctx.input.source !== "compact") return undefined;
  const file = await findTranscript(ctx.sessionId, ctx.env);
  if (!file) return undefined;
  let messages;
  try {
    messages = await readUserMessages(file);
  } catch {
    return undefined;
  }
  const record = await loadSession(ctx.root, ctx.sessionId);
  const recorded = new Set(record.found && record.ok ? record.data.nodes.map((n) => n.id) : []);
  if (messages.every((m) => recorded.has(m.id))) return undefined;
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: COMPACT_REQUEST,
    },
  };
}
