import pkg from "../../package.json" with { type: "json" };
import { defaultAgent } from "../agents/index.js";
import { installedCliVersion, versionNotice } from "../cli-version.js";
import { branchesOf, type LogBranch } from "../commands/log.js";
import { findGitRoot } from "../git.js";
import { isRecorded, readSessionMessages, upgradeSessionIds } from "../messages.js";
import type { Session } from "../schema/session.js";
import { uncommittedSession } from "../session-git.js";
import { applyEvents, readEvents } from "../store/events.js";
import { loadAllSessions, loadConfig, loadSession } from "../store/stores.js";
import { buildMessages } from "../view/lineage.js";
import { retryUnclosed } from "./close-retry.js";
import type { HookContext, HookOutput } from "./run.js";

/** The compaction request, naming the skill the way the agent spells it. */
export function compactRequestText(skill: string): string {
  return (
    "cogit: this session was compacted and some of its user messages are not in the " +
    `lineage record yet. Run the ${skill} skill now; \`session show\` lists the ` +
    "messages that have no node. It records only what is missing and replies " +
    '"up to date" when nothing is; do not mention this request otherwise.'
  );
}

export const COMPACT_REQUEST = compactRequestText(defaultAgent().skill);

/**
 * Budget for the handoff context SessionStart injects. The record is meant to
 * orient the agent, not to carry the project: the agent can always read more
 * with `log` / `show`.
 */
export const STARTUP_CONTEXT_TOKEN_CAP = 1500;

/** Token estimate from character count: good enough for a budget this loose. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** The bundled CLI, as the agent should spell it in a project without `init`. */
function cli(ctx: HookContext): string {
  const root = ctx.env[ctx.agent.pluginRootEnv] ?? `\${${ctx.agent.pluginRootEnv}}`;
  return `node "${root}/dist/cli.js"`;
}

/**
 * The setup offer for a project without `.cogit/`. It only reaches the agent:
 * nothing is set up or registered unless the user asks for it.
 */
export function setupHint(ctx: HookContext): string {
  return (
    "cogit is not set up in this project, so no lineage map is recorded here. " +
    "Say this once, in one line, and do not repeat it in later turns. If the user asks " +
    "you to set it up, ask the install questions in the chat (whether to commit " +
    ".cogit/, whether to keep transcripts longer, whether the lineage skill may run " +
    "without asking, whether to turn the plugin on for the whole project and stop " +
    "sessions that start without it, and the summary language), then run " +
    `${cli(ctx)} init --yes --git <ignore|commit> --retention <days|keep> --language <lang>` +
    " (add --allow-skill and --project-settings for what the user agreed to). Never run init or register the project on " +
    `your own. If the user wants no more hints here, run ${cli(ctx)} config hint-off. ` +
    "A plugin update reaches a running session only after /reload-plugins or a new chat."
  );
}

/**
 * SessionStart hook. Compaction keeps every transcript line and the message nodes
 * come from the transcript, so nothing is lost; the only risk is a record that fell
 * behind. When the user's messages have no node yet, the agent is asked to run the
 * skill, which works from the compact summary already in its context. On a startup
 * or resume in a project without `init`, the agent gets the setup offer instead; in
 * an initialized project it gets the handoff (Story 8.11).
 */
export async function onSessionStart(ctx: HookContext): Promise<HookOutput | undefined> {
  const output = await sessionStartOutput(ctx);
  // Once per new chat: the user hears when the plugin and the cogit command drifted apart.
  if (ctx.input.source !== "startup") return output;
  const notice = versionNotice(pkg.version, await installedCliVersion(ctx.env));
  return notice === undefined ? output : { ...output, ...ctx.agent.userNotice(notice) };
}

async function sessionStartOutput(ctx: HookContext): Promise<HookOutput | undefined> {
  if (ctx.input.source === "compact") return compactRequest(ctx);
  const source = ctx.input.source;
  if (source !== "startup" && source !== "resume" && source !== "clear") return undefined;
  if (!ctx.initialized) {
    // The setup offer stays on startup and resume, as in 4.6.
    if (source === "clear") return undefined;
    const config = await loadConfig(ctx.env);
    // "Don't ask again in this project" lives outside the project.
    if (config.setupHintOff.includes(ctx.root)) return undefined;
    // `init` needs a git repository, so outside one there is nothing to offer.
    if ((await findGitRoot(ctx.root)) === undefined) return undefined;
    return additionalContext(ctx, setupHint(ctx));
  }
  // Sessions whose closing pass never finished get it now, detached (a failure
  // here must not cost the handoff).
  await retryUnclosed(ctx).catch(() => undefined);
  const config = await loadConfig(ctx.env);
  // SessionStart runs inside the chat's startup budget: opt out and it is silent.
  if (!config.startupContext) return undefined;
  return additionalContext(ctx, await startupContext(ctx, config.recordCommit));
}

function additionalContext(ctx: HookContext, text: string): HookOutput {
  return ctx.agent.additionalContext("SessionStart", text);
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
  return additionalContext(ctx, COMPACT_REQUEST);
}

/** One line of prose, however the record stored it. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * What the agent needs to continue the project: where the lineage lives, how to
 * read it, and the compressed view of the last session before this one. Under
 * `recordCommit: ask` (Story 9.3) it also says when that session's record is
 * still uncommitted, so the agent can offer to commit it.
 */
async function startupContext(ctx: HookContext, recordCommit: string): Promise<string> {
  const command = cli(ctx);
  const header =
    `cogit records this project's lineage (one node per user message, hanging from the ` +
    `message it reacts to, grouped in sessions with branch summaries). Read it with ` +
    `\`${command} log -C "${ctx.root}"\`, find where something was discussed with ` +
    `\`${command} search "<text>" -C "${ctx.root}"\`, and one message with ` +
    `\`${command} show <ref> -C "${ctx.root}"\` (a ref is a message hash, an h+hex prefix of ` +
    `six or more characters, or <session-id>:mN). When the user mentions a message hash or ` +
    `another session's mN, run show before answering.`;

  const sessions = await loadAllSessions(ctx.root, () => {});
  const previous = mostRecentOtherSession(sessions, ctx.sessionId);
  if (previous === undefined) return header;

  const events = await readEvents(ctx.root, previous.sessionId);
  const messages = buildMessages(applyEvents(previous.nodes, events));
  const recordLine =
    recordCommit === "ask" && (await uncommittedSession(ctx.root, previous.sessionId, ctx.env))
      ? recordCommitLine(previous)
      : "";
  return composeStartupContext(
    header,
    previous,
    branchesOf(previous.sessionId, messages),
    recordLine,
  );
}

/** The offer the agent makes for a record the last code commit did not carry. */
export function recordCommitLine(session: Session): string {
  const title = session.title.trim() === "" ? session.sessionId : clip(oneLine(session.title), 120);
  return (
    "The last session's record is not committed. Offer to commit it with the message " +
    `\`chore(cogit): record ${title}\`, only the .cogit/sessions/ paths (never other staged ` +
    "changes), and run it only if the user agrees."
  );
}

/** The session with the newest activity, ignoring this one. */
export function mostRecentOtherSession(
  sessions: readonly Session[],
  sessionId: string,
): Session | undefined {
  return sessions
    .filter((session) => session.sessionId !== sessionId)
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) ||
        b.startedAt.localeCompare(a.startedAt) ||
        a.sessionId.localeCompare(b.sessionId),
    )[0];
}

/** The handoff text under the token cap; the oldest branches are cut first. */
export function composeStartupContext(
  header: string,
  session: Session,
  branches: readonly LogBranch[],
  recordLine = "",
): string {
  const head = [
    header,
    ...(recordLine === "" ? [] : ["", recordLine]),
    "",
    ...statusLines(session),
  ];
  const blocks = branches.map(branchLines);
  const cutNote = (cut: number): string[] =>
    cut === 0
      ? []
      : [
          `  … ${cut} older branch summar${cut === 1 ? "y" : "ies"} cut; ` +
            "read them with `log --branches`.",
        ];

  const render = (kept: string[][], cut: number): string =>
    [...head, ...kept.flat(), ...cutNote(cut)].join("\n");

  const kept = [...blocks];
  let cut = 0;
  while (kept.length > 0 && estimateTokens(render(kept, cut)) > STARTUP_CONTEXT_TOKEN_CAP) {
    // `branchesOf` is in send order, so the first block is the oldest branch.
    kept.shift();
    cut += 1;
  }
  const text = render(kept, cut);
  if (estimateTokens(text) <= STARTUP_CONTEXT_TOKEN_CAP) return text;
  // Only reachable with a huge status block; keep the budget anyway.
  return `${text.slice(0, STARTUP_CONTEXT_TOKEN_CAP * 4 - 2).trimEnd()}…`;
}

/** Session title, goal, pending items and next step — the "squash message". */
function statusLines(session: Session): string[] {
  const title = session.title.trim() === "" ? session.sessionId : clip(oneLine(session.title), 120);
  const lines = [`Earlier session: ${title} (${session.sessionId})`];
  const { goal, pending, next } = session.status;
  if (goal.trim() !== "") lines.push(`  goal: ${clip(oneLine(goal), 400)}`);
  const shown = pending.slice(0, 5);
  for (const item of shown) {
    const needsUser = item.needsUser ? " (needs the user)" : "";
    lines.push(`  pending: ${clip(oneLine(item.text), 200)}${needsUser}`);
  }
  if (pending.length > shown.length)
    lines.push(`  pending: … ${pending.length - shown.length} more`);
  if (next.trim() !== "") lines.push(`  next: ${clip(oneLine(next), 400)}`);
  return lines;
}

function branchLines(branch: LogBranch): string[] {
  const count = `${branch.count} message${branch.count === 1 ? "" : "s"}`;
  return [
    `  ╭ ${clip(oneLine(branch.title), 80)}  ${branch.start.label}–${branch.end.label}, ${count}`,
    `    asked: ${clip(oneLine(branch.asked), 300)}`,
    `    outcome: ${clip(oneLine(branch.outcome), 600)}`,
    `    open: ${branch.open.trim() === "" ? "—" : clip(oneLine(branch.open), 300)}`,
  ];
}
