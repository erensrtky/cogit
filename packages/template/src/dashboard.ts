import type { ViewFile, ViewSession } from "../../cli/src/view/model.js";
import { graphFiles } from "./fileGraph.js";

/**
 * The numbers the map's home shows, from the record alone: how the talk and
 * the code it led to went day by day, the decisions taken and the options
 * turned down, and the files most discussed.
 */

/** One day's work: messages recorded and thought commits (commits a message led to). */
export interface DayCount {
  /** Local date, `YYYY-MM-DD`. */
  day: string;
  messages: number;
  commits: number;
  /** The day's first message that led to a commit, to open on the map. */
  first?: { sessionId: string; messageId: string };
}

/** `YYYY-MM-DD` in the viewer's time zone. */
export function dayOf(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The day after `day`, both `YYYY-MM-DD`. */
export function nextDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return dayOf(new Date(year, month - 1, date + 1));
}

/**
 * Messages and thought commits per day, oldest first, every day from the first
 * message to `today` included (a quiet day is a zero, not a gap). A commit
 * counts once, on the day of the message that led to it.
 */
export function dailyActivity(sessions: readonly ViewSession[], today: Date): DayCount[] {
  const days = new Map<string, DayCount>();
  const seen = new Set<string>();
  const messages = sessions
    .flatMap((session) =>
      session.messages
        .filter((node) => node.kind === "message" && node.at !== undefined)
        .map((node) => ({ session, node, at: new Date(node.at as string) })),
    )
    .filter((entry) => !Number.isNaN(entry.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const { session, node, at } of messages) {
    const day = dayOf(at);
    const count = days.get(day) ?? { day, messages: 0, commits: 0 };
    count.messages += 1;
    const fresh = (node.commits ?? []).filter((hash) => !seen.has(hash));
    for (const hash of fresh) seen.add(hash);
    count.commits += fresh.length;
    if (fresh.length > 0 && count.first === undefined)
      count.first = { sessionId: session.sessionId, messageId: node.id };
    days.set(day, count);
  }
  const first = messages[0];
  if (first === undefined) return [];
  const out: DayCount[] = [];
  const last = dayOf(today);
  for (let day = dayOf(first.at); day <= last; day = nextDay(day))
    out.push(days.get(day) ?? { day, messages: 0, commits: 0 });
  return out;
}

/** The decisions in the record, the share the agent took on its own, and the options turned down. */
export interface DecisionCounts {
  /** Messages with a why or rejected options, plus every decision the agent took on its own. */
  decisions: number;
  byAgent: number;
  rejected: number;
}

/** Counts decisions the way `cogit why` lists them. */
export function decisionCounts(sessions: readonly ViewSession[]): DecisionCounts {
  const counts: DecisionCounts = { decisions: 0, byAgent: 0, rejected: 0 };
  for (const session of sessions)
    for (const node of session.messages) {
      const alternatives = node.alternatives ?? [];
      if (alternatives.length > 0 || (node.why ?? "").trim() !== "") counts.decisions += 1;
      counts.rejected += alternatives.length;
      for (const decision of node.agentDecisions ?? []) {
        counts.decisions += 1;
        counts.byAgent += 1;
        counts.rejected += decision.alternatives?.length ?? 0;
      }
    }
  return counts;
}

/** The code files the most messages touched, most first. */
export function topFiles(
  files: readonly ViewFile[] | undefined,
  codeFiles: readonly string[] | undefined,
  limit = 5,
): ViewFile[] {
  return [...graphFiles(files ?? [], codeFiles)]
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
    .slice(0, limit);
}

/** Recorded messages in all sessions. */
export function messageCount(sessions: readonly ViewSession[]): number {
  return sessions.reduce(
    (sum, session) => sum + session.messages.filter((node) => node.kind === "message").length,
    0,
  );
}

/** The weeks of a contribution calendar ending on `today`: columns of seven days, Sunday first. */
export function calendarWeeks(
  activity: readonly DayCount[],
  today: Date,
  weeks = 53,
): (DayCount | null)[][] {
  const byDay = new Map(activity.map((count) => [count.day, count]));
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
  start.setDate(start.getDate() - (weeks - 1) * 7);
  const last = dayOf(today);
  const out: (DayCount | null)[][] = [];
  for (let week = 0; week < weeks; week += 1) {
    const column: (DayCount | null)[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const day = dayOf(
        new Date(start.getFullYear(), start.getMonth(), start.getDate() + week * 7 + weekday),
      );
      column.push(day > last ? null : (byDay.get(day) ?? { day, messages: 0, commits: 0 }));
    }
    out.push(column);
  }
  return out;
}

/** A calendar cell's shade, 0 (none) to 4, by its share of the busiest day. */
export function shade(count: number, busiest: number): number {
  if (count <= 0 || busiest <= 0) return 0;
  return Math.min(4, Math.ceil((count / busiest) * 4));
}
