import type { PanelOverview } from "../../cli/src/view/model.js";

/** One day on the start page: messages, thought commits, and where the day's first one is. */
export type DayCount = PanelOverview["days"][number];

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

/** Every day from the first in `days` to `today` included; a quiet day is a zero, not a gap. */
export function fillDays(days: readonly DayCount[], today: Date): DayCount[] {
  const first = days[0];
  if (first === undefined) return [];
  const byDay = new Map(days.map((count) => [count.day, count]));
  const out: DayCount[] = [];
  const last = dayOf(today);
  for (let day = first.day; day <= last; day = nextDay(day))
    out.push(byDay.get(day) ?? { day, messages: 0, commits: 0 });
  return out;
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
