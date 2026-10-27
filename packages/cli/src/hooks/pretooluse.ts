import { isAbsolute, relative, resolve, sep } from "node:path";
import { collectWhy, tryBeforeNote } from "../commands/why.js";
import { type HookState, STATE_SCHEMA } from "../schema/state.js";
import { loadConfig, updateState } from "../store/stores.js";
import type { HookContext, HookOutput } from "./run.js";

/**
 * PreToolUse on Edit/Write/MultiEdit (Story 10.4): before the agent writes a
 * file, tell it — once per file per session — about the options earlier
 * thoughts considered and rejected for that file. The note is information from
 * the record, never a rule, and the hook never blocks or changes the call: any
 * failure ends in silence and exit 0 (`hooks/run.ts`).
 */

/** The tools that write a file; their input names it in `file_path`. */
const WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit"]);

export async function onPreToolUse(ctx: HookContext): Promise<HookOutput | undefined> {
  const tool = ctx.input.tool_name;
  if (tool === undefined || !WRITE_TOOLS.has(tool)) return undefined;
  const filePath = ctx.input.tool_input?.file_path;
  if (typeof filePath !== "string" || filePath.trim() === "") return undefined;

  const config = await loadConfig(ctx.env);
  if (!config.tryBeforeNotes) return undefined;

  // The agent passes an absolute path; a relative one is relative to its cwd.
  const absolute = isAbsolute(filePath) ? filePath : resolve(ctx.input.cwd ?? ctx.root, filePath);
  const rel = relative(ctx.root, absolute);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return undefined;
  const key = rel.split(sep).join("/");

  // Claim the file first: one state update decides both "already told?" and
  // "remember that it was looked at", so two quick edits cannot both answer.
  let firstLook = false;
  await updateState(
    ctx.root,
    ctx.sessionId,
    (cur) => {
      const noted = cur?.notedFiles ?? [];
      if (noted.includes(key)) return cur ?? emptyState();
      firstLook = true;
      return { ...(cur ?? emptyState()), notedFiles: [...noted, key].sort() };
    },
    { timeoutMs: 1500 },
  );
  if (!firstLook) return undefined;

  const hits = await collectWhy(ctx.root, key, ctx.env);
  const note = tryBeforeNote(key, hits);
  return note === undefined ? undefined : ctx.agent.additionalContext("PreToolUse", note);
}

function emptyState(): HookState {
  return {
    schema: STATE_SCHEMA,
    turns: 0,
    turnsSinceUpdate: 0,
    recordUpdatedAt: null,
    notedFiles: [],
  };
}
