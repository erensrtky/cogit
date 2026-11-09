import { atomicWriteJson, readJson } from "../store/fs.js";
import { projectPaths } from "../store/paths.js";
import type { SpendTotals } from "../store/spend.js";
import { graphFiles } from "./code-files.js";
import type {
  LineageViewModel,
  OverviewDay,
  PanelOverview,
  ProjectOverview,
  ViewSpend,
} from "./model.js";

/**
 * The start page's numbers (the panel at `cogit open`): how talk and the code
 * it led to went day by day, the decisions taken, the options turned down and
 * the most discussed files. Each map build works out its project's share from
 * the model it just built, so the two pages always agree; the panel adds the
 * projects up.
 */

/** How many files a project keeps; the page shows the top few across projects. */
const PROJECT_FILES = 10;
/** The most discussed files the page lists. */
export const TOP_FILES = 5;

/** `YYYY-MM-DD` in this machine's time zone. */
export function dayOf(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A project's numbers from its built map model. A commit counts once, on the day of the message that led to it. */
export function projectOverview(model: LineageViewModel): ProjectOverview {
  const days = new Map<string, OverviewDay>();
  const seen = new Set<string>();
  const overview: ProjectOverview = {
    generatedAt: model.project.generatedAt,
    days: [],
    decisions: 0,
    byAgent: 0,
    rejected: 0,
    files: [],
  };
  const messages = model.sessions
    .flatMap((session) => session.messages.map((node) => ({ sessionId: session.sessionId, node })))
    .filter(({ node }) => node.kind === "message")
    .map((entry) => ({ ...entry, at: new Date(entry.node.at ?? "") }))
    .sort((a, b) => (a.at.getTime() || 0) - (b.at.getTime() || 0));
  for (const { sessionId, node, at } of messages) {
    const alternatives = node.alternatives ?? [];
    if (alternatives.length > 0 || (node.why ?? "").trim() !== "") overview.decisions += 1;
    overview.rejected += alternatives.length;
    for (const decision of node.agentDecisions ?? []) {
      overview.decisions += 1;
      overview.byAgent += 1;
      overview.rejected += decision.alternatives?.length ?? 0;
    }
    if (Number.isNaN(at.getTime())) continue;
    const day = dayOf(at);
    const count = days.get(day) ?? { day, messages: 0, commits: 0 };
    count.messages += 1;
    const fresh = (node.commits ?? []).filter((hash) => !seen.has(hash));
    for (const hash of fresh) seen.add(hash);
    count.commits += fresh.length;
    if (fresh.length > 0 && count.first === undefined)
      count.first = { sessionId, messageId: node.id };
    days.set(day, count);
  }
  overview.days = [...days.values()];
  overview.files = graphFiles(model.files ?? [], model.codeFiles)
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
    .slice(0, PROJECT_FILES)
    .map((file) => ({ path: file.path, count: file.count }));
  return overview;
}

/** Saves a project's numbers for the start page; a failed write only leaves the old ones. */
export async function writeProjectOverview(root: string, overview: ProjectOverview): Promise<void> {
  try {
    await atomicWriteJson(projectPaths(root).overview, overview);
  } catch {
    // The start page is derived; the map never fails over it.
  }
}

/** A project's saved numbers, or undefined when no map was built yet or the file is unreadable. */
export async function readProjectOverview(root: string): Promise<ProjectOverview | undefined> {
  try {
    const read = await readJson(projectPaths(root).overview);
    if (!read.found || !("value" in read)) return undefined;
    const value = read.value as Partial<ProjectOverview> | null;
    if (value === null || typeof value !== "object" || !Array.isArray(value.days)) return undefined;
    return {
      generatedAt: String(value.generatedAt ?? ""),
      days: value.days,
      decisions: Number(value.decisions) || 0,
      byAgent: Number(value.byAgent) || 0,
      rejected: Number(value.rejected) || 0,
      files: Array.isArray(value.files) ? value.files : [],
    };
  } catch {
    return undefined;
  }
}

/** One registered project's share, as the panel collected it. */
export interface OverviewPart {
  name: string;
  path: string;
  mapUrl: string;
  overview?: ProjectOverview | undefined;
  spend?: SpendTotals | undefined;
}

/** Every project's numbers added up; undefined when no project has any yet. */
export function mergeOverviews(parts: readonly OverviewPart[]): PanelOverview | undefined {
  const withNumbers = parts.filter(
    (part) => part.overview !== undefined || part.spend !== undefined,
  );
  if (withNumbers.length === 0) return undefined;
  const days = new Map<string, PanelOverview["days"][number]>();
  const merged: PanelOverview = { days: [], decisions: 0, byAgent: 0, rejected: 0, files: [] };
  let spend: ViewSpend | undefined;
  for (const part of withNumbers) {
    const overview = part.overview;
    if (overview !== undefined) {
      merged.decisions += overview.decisions;
      merged.byAgent += overview.byAgent;
      merged.rejected += overview.rejected;
      for (const day of overview.days) {
        const sum = days.get(day.day) ?? { day: day.day, messages: 0, commits: 0 };
        sum.messages += day.messages;
        sum.commits += day.commits;
        if (sum.first === undefined && day.first !== undefined)
          sum.first = { projectPath: part.path, mapUrl: part.mapUrl, ...day.first };
        days.set(day.day, sum);
      }
      for (const file of overview.files)
        merged.files.push({
          projectName: part.name,
          projectPath: part.path,
          mapUrl: part.mapUrl,
          ...file,
        });
    }
    if (part.spend !== undefined) {
      const was: ViewSpend = spend ?? {
        runs: 0,
        usd: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      };
      const since =
        was.since === undefined || (part.spend.since !== undefined && part.spend.since < was.since)
          ? part.spend.since
          : was.since;
      spend = {
        runs: was.runs + part.spend.runs,
        usd: was.usd + part.spend.usd,
        inputTokens: was.inputTokens + part.spend.inputTokens,
        outputTokens: was.outputTokens + part.spend.outputTokens,
        cacheReadTokens: was.cacheReadTokens + part.spend.cacheReadTokens,
        cacheWriteTokens: was.cacheWriteTokens + part.spend.cacheWriteTokens,
        ...(since === undefined ? {} : { since }),
      };
    }
  }
  merged.days = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  merged.files = merged.files
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.projectName.localeCompare(b.projectName) ||
        a.path.localeCompare(b.path),
    )
    .slice(0, TOP_FILES);
  if (spend !== undefined) merged.spend = spend;
  return merged;
}
