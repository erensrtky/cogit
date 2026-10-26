import { z } from "zod";
import { Config, Registry } from "./config.js";
import { SessionEvent } from "./events.js";
import { Project } from "./project.js";
import { Session, SessionInput } from "./session.js";
import { HookState } from "./state.js";

/**
 * The record documents published as JSON Schema under `docs/schema/` (Story
 * 9.6): enough for a tool in another language to read and write `.cogit/`
 * without running cogit. Generated from the zod schemas here, never edited by
 * hand; `npm run schemas` regenerates them and a test fails when they drift.
 */
export const SCHEMA_DOCUMENTS = {
  "session.json": Session,
  "session-input.json": SessionInput,
  "session-event.json": SessionEvent,
  "project.json": Project,
  "config.json": Config,
  "registry.json": Registry,
  "hook-state.json": HookState,
} as const;

export type SchemaDocument = keyof typeof SCHEMA_DOCUMENTS;

/** A document's JSON Schema; `session-input.json` describes what the agent sends. */
export function jsonSchema(name: SchemaDocument): object {
  return z.toJSONSchema(
    SCHEMA_DOCUMENTS[name],
    name === "session-input.json" ? { io: "input" } : {},
  );
}

/** Every published schema, keyed by its file name in `docs/schema/`. */
export function jsonSchemas(): Record<string, object> {
  return Object.fromEntries(
    (Object.keys(SCHEMA_DOCUMENTS) as SchemaDocument[]).map((name) => [name, jsonSchema(name)]),
  );
}

/** The exact file contents: pretty JSON with a trailing newline. */
export function schemaText(
  schemas: Readonly<Record<string, object>> = jsonSchemas(),
): Map<string, string> {
  return new Map(
    Object.entries(schemas).map(([name, schema]) => [name, `${JSON.stringify(schema, null, 2)}\n`]),
  );
}
