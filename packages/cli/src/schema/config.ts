import { z } from "zod";
import { IsoDate } from "./common.js";

export const CONFIG_SCHEMA = 1;

export const Config = z.object({
  schema: z.literal(CONFIG_SCHEMA),
  /** "auto" = the conversation's language, otherwise a fixed language name or code. */
  language: z.string().min(1).max(32).default("auto"),
  updateEveryTurns: z.int().min(1).max(100).default(5),
  sessionEndCatchUp: z.boolean().default(true),
  /** Model for the headless catch-up (SessionEnd) and, later, backfill. */
  catchUpModel: z.string().trim().min(1).max(64).default("haiku"),
  /**
   * Whether the agent writes a per-message `summary`. Off by default: the branch
   * summary is the outer layer and the drill-down already shows the reply.
   */
  messageSummaries: z.boolean().default(false),
  /**
   * Whether SessionStart hands the agent the lineage of the previous session and
   * how to read the record (`log` / `show`). On by default; costs only tokens.
   */
  startupContext: z.boolean().default(true),
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
   * How many days a session stays in the "your turn" inbox (Story 11.1). Older
   * sessions are hidden; nothing is deleted.
   */
  inboxMaxAgeDays: z.int().min(1).max(3650).default(7),
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
