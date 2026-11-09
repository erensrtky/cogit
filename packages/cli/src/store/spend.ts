import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { projectPaths } from "./paths.js";

/**
 * What cogit's own headless runs cost (the side model, the closing review,
 * Shapes, captured work), one JSON line per run in `.cogit/state/spend.jsonl`.
 * Claude Code reports it in its `--output-format json` envelope; cogit only
 * keeps it. Local to the machine and never committed.
 */
export interface SpendEntry {
  at: string;
  /** What the run was for: `side`, `review`, `shape`, `captures`. */
  kind: string;
  model: string;
  usd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** The totals the map shows. */
export interface SpendTotals {
  runs: number;
  usd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** The first run counted. */
  since?: string;
}

const number = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;

/** The cost and tokens in a `--output-format json` envelope; undefined when it carries none. */
export function spendOf(stdout: string): Omit<SpendEntry, "at" | "kind" | "model"> | undefined {
  let envelope: unknown;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (envelope === null || typeof envelope !== "object") return undefined;
  const { total_cost_usd: usd, usage } = envelope as { total_cost_usd?: unknown; usage?: unknown };
  if (typeof usd !== "number" && (usage === null || typeof usage !== "object")) return undefined;
  const tokens = (usage ?? {}) as Record<string, unknown>;
  return {
    usd: number(usd),
    inputTokens: number(tokens.input_tokens),
    outputTokens: number(tokens.output_tokens),
    cacheReadTokens: number(tokens.cache_read_input_tokens),
    cacheWriteTokens: number(tokens.cache_creation_input_tokens),
  };
}

/** Appends one run's spend; a run that reported none, or a failed write, is skipped. */
export async function recordSpend(
  root: string,
  kind: string,
  model: string,
  stdout: string,
  now: Date = new Date(),
): Promise<void> {
  const spent = spendOf(stdout);
  if (spent === undefined) return;
  const entry: SpendEntry = { at: now.toISOString(), kind, model, ...spent };
  const file = projectPaths(root).spend;
  try {
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, `${JSON.stringify(entry)}\n`);
  } catch {
    // The cost is a convenience; the record never waits on it.
  }
}

/** Adds up the recorded runs; undefined when there are none. Unreadable lines are skipped. */
export async function readSpend(root: string): Promise<SpendTotals | undefined> {
  let text: string;
  try {
    text = await readFile(projectPaths(root).spend, "utf8");
  } catch {
    return undefined;
  }
  const totals: SpendTotals = {
    runs: 0,
    usd: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    let entry: Partial<SpendEntry>;
    try {
      entry = JSON.parse(line) as Partial<SpendEntry>;
    } catch {
      continue;
    }
    totals.runs += 1;
    totals.usd += number(entry.usd);
    totals.inputTokens += number(entry.inputTokens);
    totals.outputTokens += number(entry.outputTokens);
    totals.cacheReadTokens += number(entry.cacheReadTokens);
    totals.cacheWriteTokens += number(entry.cacheWriteTokens);
    if (typeof entry.at === "string" && (totals.since === undefined || entry.at < totals.since))
      totals.since = entry.at;
  }
  return totals.runs === 0 ? undefined : totals;
}
