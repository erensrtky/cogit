import { z } from "zod";
import { IsoDate } from "./common.js";

export const CONFIG_SCHEMA = 1;

export const Config = z.object({
  schema: z.literal(CONFIG_SCHEMA),
  /** "auto" = the conversation's language, otherwise a fixed language name or code. */
  language: z.string().min(1).max(32).default("auto"),
  /**
   * How often the main agent is asked to record (Story 12.1). The default is the
   * mixed mode's interval: the side model records in between, so the agent can
   * check in rarely.
   */
  updateEveryTurns: z.int().min(1).max(100).default(15),
  sessionEndCatchUp: z.boolean().default(true),
  /**
   * Who writes the record (Story 12.1): the main agent (`agent`), both (`mixed`,
   * "Detailed" in the panel: a side model often, the agent rarely), or only the
   * side model (`side`, "Economical", the default since 0.21: the agent is never
   * interrupted and the session-end pass writes the branches).
   */
  recorder: z.enum(["agent", "mixed", "side"]).default("side"),
  /** Model the side runs use: the headless catch-up and the periodic records. */
  sideModel: z.string().trim().min(1).max(64).default("haiku"),
  /** How often the side model records, in turns (Story 12.1). */
  sideEveryTurns: z.int().min(1).max(100).default(5),
  /**
   * @deprecated Renamed to `sideModel` in Story 12.1. Still read once and
   * migrated, so a config written before the rename keeps its model.
   */
  catchUpModel: z.string().trim().min(1).max(64).optional(),
  /**
   * Whether the agent writes a per-message `summary`. Off by default: the branch
   * summary is the outer layer and the drill-down already shows the reply.
   */
  messageSummaries: z.boolean().default(false),
  /**
   * Whether a message that landed commits gets a Shape (Story 13.6): a small
   * plain-language or diagram view of what the change does, written by whoever
   * records. Off writes nothing; the map then says so.
   */
  shapes: z.boolean().default(true),
  /**
   * Whether SessionStart hands the agent the lineage of the previous session and
   * how to read the record (`log` / `show`). On by default; costs only tokens.
   */
  startupContext: z.boolean().default(true),
  /**
   * Whether sessions started without a person (`claude -p`, an SDK) are recorded.
   * Off by default: other plugins start them in the background, one per prompt,
   * and they would fill the map and the inbox.
   */
  recordHeadless: z.boolean().default(false),
  /** Port the local map server binds on `127.0.0.1`. */
  serverPort: z.int().min(1).max(65535).default(4747),
  /** Default for new projects; `init` asks per repo. Story 9.3: the record travels. */
  gitPolicy: z.enum(["ignore", "commit"]).default("commit"),
  /**
   * Whether `.cogit/conversations/` (the raw chat text) travels too. Off by
   * default: the session record can be committed while the chat stays local.
   */
  shareConversations: z.boolean().default(false),
  /**
   * What happens to the session files the last code commit left behind: ask the
   * user at the next session start, commit them at session end, or do nothing.
   */
  recordCommit: z.enum(["ask", "auto", "off"]).default("ask"),
  /**
   * How long `.cogit/HEAD` stays fresh for the `Thought:` trailer (Story 9.4).
   * A commit made hours after the last message is probably not that message.
   */
  trailerMaxAgeHours: z.int().min(1).max(8760).default(6),
  /**
   * An unread message whose commits changed at least this many lines gets the
   * quiet "a lot landed here" highlight on the map (Story 10.3). A threshold,
   * not a judgement: it never hides or ranks anything by itself.
   */
  bigChangeLines: z.int().min(1).max(1_000_000).default(300),
  /**
   * Whether the agent is told, before editing a file, about options earlier
   * thoughts considered and rejected for that file (Story 10.4). A note from
   * the record, never a rule; off means silence.
   */
  tryBeforeNotes: z.boolean().default(true),
  /**
   * How many days a session stays in the "your turn" inbox (Stories 11.1,
   * 12.2). One day by default: the inbox is for work that is still fresh, not
   * an archive. Raise it to keep rows longer. A config that holds an older value
   * keeps it; only the default changed. Older sessions are hidden, nothing is
   * deleted.
   */
  inboxMaxAgeDays: z.int().min(1).max(3650).default(1),
  agents: z.array(z.string().min(1)).default(["claude-code"]),
  /** Project roots ("don't ask again" in this project) where the setup hint stays silent. */
  setupHintOff: z.array(z.string().min(1)).default([]),
});

export const RegistryEntry = z.object({
  path: z.string().min(1),
  name: z.string().min(1).max(200),
  addedAt: IsoDate,
});

export const Registry = z.object({
  schema: z.literal(CONFIG_SCHEMA),
  projects: z.array(RegistryEntry).default([]),
});

export type Config = z.infer<typeof Config>;
export type RegistryEntry = z.infer<typeof RegistryEntry>;
export type Registry = z.infer<typeof Registry>;

/** The side model's default, named so the rename below can spot an untouched value. */
export const DEFAULT_SIDE_MODEL = "haiku";

/**
 * Reads a config written before Story 12.1: `catchUpModel` became `sideModel`.
 * The old key is dropped, so the next write stores only the new name. An
 * explicit new name wins; the plain default yields to the old one.
 */
export function migrateConfig(config: Config): Config {
  if (config.catchUpModel === undefined) return config;
  const { catchUpModel, ...rest } = config;
  return {
    ...rest,
    sideModel: config.sideModel === DEFAULT_SIDE_MODEL ? catchUpModel : config.sideModel,
  };
}
