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
   * "Quality" in the panel and the default: a side model often, and the session's
   * own model once at session end with the technical reasons only it knows), or only the side model
   * (`side`, "Economical": the agent is never interrupted, its reasons are read
   * from the outside). The session-end pass writes the branches in both.
   */
  recorder: z.enum(["agent", "mixed", "side"]).default("mixed"),
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
   * Whether the record carries a per-message `summary`: what came of it. On by
   * default since 1.0.2: without it a message that only discussed or advised
   * kept nothing but its title, and the map and search lost what was said.
   */
  messageSummaries: z.boolean().default(true),
  /** One-time config changes already applied (see `migrateConfig`); never shown. */
  migrated: z.array(z.string().min(1).max(60)).max(50).optional(),
  /**
   * Whether a message that landed commits gets a Shape (Story 13.6): a small
   * plain-language or diagram view of what the change does, written by whoever
   * records. Off writes nothing; the map then says so.
   */
  shapes: z.boolean().default(true),
  /**
   * Whether the side model distils each session's leftover work into a short
   * curated list (Story 15.1). Off writes nothing; items already in the store
   * are kept and come back when it is turned on again. Off by default since
   * 1.4.0 for new installs; a config written before keeps the value it stored.
   */
  captures: z.boolean().default(false),
  /**
   * Whether the map's search also finds messages by meaning, through an
   * embedding model in the local Ollama. Off by default: it needs Ollama and a
   * model download, which not every machine can spare.
   */
  semanticSearch: z.boolean().default(false),
  /** The Ollama embedding model the meaning search uses. */
  embeddingModel: z.string().trim().min(1).max(64).default("bge-m3"),
  /**
   * Whether SessionStart hands the agent the lineage of the previous session and
   * how to read the record (`log` / `show`). On by default; costs only tokens.
   */
  startupContext: z.boolean().default(true),
  /**
   * Which sessions started without a person (`claude -p`, an SDK) are recorded.
   * `off`: none. `all`: every one, other plugins' background runs included.
   * `auto` (new installs): those a person or a script started (a loop like
   * Ralph, a cron job: no Claude Code process above them) and those a recorded
   * session's own commands started (marked `COGIT_RECORD=1`), but not the ones
   * another plugin's hook starts, one per prompt. A config written while this
   * was a boolean reads `true` as `all` and `false` as `off`, so an existing
   * install keeps what it had.
   */
  recordHeadless: z
    .preprocess(
      (value) => (value === true ? "all" : value === false ? "off" : value),
      z.enum(["off", "auto", "all"]),
    )
    .default("auto"),
  /** Port the local map server binds on `127.0.0.1`. */
  serverPort: z.int().min(1).max(65535).default(4747),
  /**
   * Whether `.cogit/conversations/` (the raw chat text) travels too. Off by
   * default: the session record can be shared while the chat stays local.
   */
  shareConversations: z.boolean().default(false),
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
   * How many days a session stays in the "your turn" inbox (Stories 11.1,
   * 12.2). One day by default: the inbox is for work that is still fresh, not
   * an archive. Raise it to keep rows longer. A config that holds an older value
   * keeps it; only the default changed. Older sessions are hidden, nothing is
   * deleted.
   */
  inboxMaxAgeDays: z.int().min(1).max(3650).default(1),
  /**
   * Whether the "Your turn" inbox shows at all, on the start page and on every
   * map. Off, no row is worked out and no transcript is read for it; the
   * dismissals already made are kept.
   */
  inbox: z.boolean().default(true),
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
/** The 1.0.2 change that turned per-message summaries on for existing configs. */
export const SUMMARIES_ON = "messageSummaries-on";

export function migrateConfig(config: Config): Config {
  let next = config;
  if (next.catchUpModel !== undefined) {
    const { catchUpModel, ...rest } = next;
    next = {
      ...rest,
      sideModel: next.sideModel === DEFAULT_SIDE_MODEL ? catchUpModel : next.sideModel,
    };
  }
  // Every config written before 1.0.2 stores the old default (off), so the new
  // default would reach nobody: turn it on once. A user who turns it off again
  // afterwards keeps it off, since the change is then marked as applied.
  if (!(next.migrated ?? []).includes(SUMMARIES_ON)) {
    next = { ...next, messageSummaries: true, migrated: [...(next.migrated ?? []), SUMMARIES_ON] };
  }
  return next;
}
