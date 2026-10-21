import type { z } from "zod";

export type Parsed<T> =
  | { ok: true; data: T; warnings: string[] }
  | { ok: false; error: string; warnings: string[] };

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Parses a versioned JSON document. Older versions are migrated step by step;
 * a newer version is parsed best-effort with a warning.
 */
export function parseVersioned<S extends z.ZodType>(
  raw: unknown,
  schema: S,
  current: number,
  migrations: Record<number, Migration> = {},
): Parsed<z.infer<S>> {
  const warnings: string[] = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "not a JSON object", warnings };
  }
  let doc = raw as Record<string, unknown>;
  const version = doc.schema;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: "missing or invalid schema version", warnings };
  }
  if (version > current) {
    warnings.push(`schema v${version} is newer than supported v${current}; reading best-effort`);
    doc = { ...doc, schema: current };
  }
  for (let v = version; v < current; v++) {
    const step = migrations[v];
    if (!step) return { ok: false, error: `no migration from schema v${v}`, warnings };
    doc = { ...step(doc), schema: v + 1 };
  }
  const result = schema.safeParse(doc);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    return { ok: false, error: issues.join("; "), warnings };
  }
  return { ok: true, data: result.data, warnings };
}
