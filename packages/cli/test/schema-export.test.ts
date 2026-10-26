import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { jsonSchemas, SCHEMA_DOCUMENTS, schemaText } from "../src/schema/export.js";

/**
 * The published JSON Schemas must be the zod schemas themselves, or a tool
 * reading `docs/format.md` would follow a format the code no longer has.
 * Regenerate after a schema change with `npm run schemas`.
 */
const schemaDir = join(dirname(fileURLToPath(import.meta.url)), "../../../docs/schema");
const update = process.env.UPDATE_SCHEMAS === "1";

describe("docs/schema", () => {
  it("matches the zod schemas, with no extra or missing file", async () => {
    const files = schemaText();
    if (update) {
      await mkdir(schemaDir, { recursive: true });
      for (const [name, text] of files) await writeFile(join(schemaDir, name), text);
    }
    expect((await readdir(schemaDir)).sort()).toEqual([...files.keys()].sort());
    for (const [name, text] of files) {
      expect(`${name}\n${await readFile(join(schemaDir, name), "utf8")}`).toBe(`${name}\n${text}`);
    }
  });

  it("publishes one document per record type", () => {
    expect(Object.keys(SCHEMA_DOCUMENTS)).toEqual([
      "session.json",
      "session-input.json",
      "session-event.json",
      "project.json",
      "config.json",
      "registry.json",
      "hook-state.json",
    ]);
    const schemas = jsonSchemas();
    for (const schema of Object.values(schemas)) expect(schema).toMatchObject({ type: "object" });
    expect(schemas["session-input.json"]).toMatchObject({
      type: "object",
      properties: { sessionId: { type: "string" } },
    });
  });
});
