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
  /** Default for new projects; `init` asks per repo. */
  gitPolicy: z.enum(["ignore", "commit"]).default("ignore"),
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
