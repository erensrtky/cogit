import { useEffect, useMemo, useRef, useState } from "react";
import type { PanelOverview, ViewSpend } from "../../cli/src/view/model.js";
import { calendarWeeks, type DayCount, dayOf, fillDays, shade } from "./dashboard.js";
import { isLivePage } from "./data.js";

/**
 * The top of the start page: every project at a glance. Talk and the code it
 * led to day by day, then the decisions, the options turned down, what cogit
 * itself cost and the most discussed files, then a year of thought commits.
 */
export function Overview({
  overview,
  today = new Date(),
}: {
  overview: PanelOverview;
  today?: Date;
}) {
  const activity = useMemo(() => fillDays(overview.days, today), [overview.days, today]);
  return (
    <section className="home" aria-label="All projects at a glance">
      {activity.length === 0 ? null : <ActivityChart activity={activity} />}
      <div className="home-tiles">
        <section className="home-tile">
          <h3>Decisions</h3>
          <p className="home-number">{formatCount(overview.decisions)}</p>
          <p className="home-note">
            {formatCount(overview.byAgent)} taken by the agent on its own, without asking
          </p>
        </section>
        <section className="home-tile">
          <h3>Options turned down</h3>
          <p className="home-number">{formatCount(overview.rejected)}</p>
          <p className="home-note">Considered and rejected, with the reason kept</p>
        </section>
        <SpendTile spend={overview.spend} days={overview.days} />
        <section className="home-tile home-files">
          <h3>Most discussed files</h3>
          {overview.files.length === 0 ? (
            <p className="home-note">No files recorded yet.</p>
          ) : (
            <ol>
              {overview.files.map((file) => (
                <li key={`${file.projectPath}|${file.path}`}>
                  <a
                    className="home-file"
                    href={mapLink(file.projectPath, file.mapUrl, { f: file.path })}
                    title={`${file.path} · open ${file.projectName}'s map on it`}
                  >
                    <span className="home-file-path">
                      <span className="home-file-project">{file.projectName}</span> {file.path}
                    </span>
                    <span className="home-file-count">{file.count}</span>
                  </a>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      {activity.length === 0 ? null : <Calendar activity={activity} today={today} />}
    </section>
  );
}

/** A project's map: a page of the local server when live, its `file://` copy otherwise. */
function mapLink(projectPath: string, mapUrl: string, hash: Record<string, string>): string {
  const base =
    typeof document !== "undefined" && isLivePage()
      ? `/map?dir=${encodeURIComponent(projectPath)}`
      : mapUrl;
  return `${base}#${new URLSearchParams(hash).toString()}`;
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function formatCount(value: number): string {
  return value < 10_000 ? value.toLocaleString("en") : compact.format(value);
}

function formatUsd(value: number): string {
  return value < 0.01 && value > 0 ? "< $0.01" : `$${value.toFixed(2)}`;
}

/** What cogit's own background runs cost, and per message since the first one. */
function SpendTile({ spend, days }: { spend: ViewSpend | undefined; days: readonly DayCount[] }) {
  if (spend === undefined)
    return (
      <section className="home-tile">
        <h3>cogit's own cost</h3>
        <p className="home-number home-number-quiet">Not measured yet</p>
        <p className="home-note">
          Each background run cogit makes (recording, review, Shapes) notes its cost from 1.3.0 on.
        </p>
      </section>
    );
  const tokens =
    spend.inputTokens + spend.outputTokens + spend.cacheReadTokens + spend.cacheWriteTokens;
  const since = spend.since === undefined ? undefined : new Date(spend.since);
  const from = since === undefined ? "" : dayOf(since);
  const messages = days.reduce((sum, day) => (day.day >= from ? sum + day.messages : sum), 0);
  return (
    <section className="home-tile">
      <h3>cogit's own cost</h3>
      <p className="home-number">{formatUsd(spend.usd)}</p>
      <p className="home-note">
        {compact.format(tokens)} tokens in {formatCount(spend.runs)} background run
        {spend.runs === 1 ? "" : "s"}
        {messages > 0 && spend.unpriced === undefined ? (
          <>, about {formatUsd(spend.usd / messages)} a message</>
        ) : null}
        {since === undefined ? null : <>, since {since.toLocaleDateString("en")}</>}
      </p>
      {spend.unpriced === undefined ? null : (
        <p className="home-note">
          {formatCount(spend.unpriced)} of the runs went to Codex, which reports tokens but no
          price; the dollar figure leaves them out.
        </p>
      )}
    </section>
  );
}

const CHART = { width: 760, height: 200, left: 34, right: 12, top: 12, bottom: 24 };

/** Messages and thought commits per day, one axis (both are counts), with a hover readout. */
function ActivityChart({ activity }: { activity: readonly DayCount[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const busiest = Math.max(1, ...activity.map((day) => Math.max(day.messages, day.commits)));
  const top = niceTop(busiest);
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const x = (index: number) =>
    CHART.left +
    (activity.length === 1 ? plotWidth / 2 : (index / (activity.length - 1)) * plotWidth);
  const y = (value: number) => CHART.top + plotHeight - (value / top) * plotHeight;
  const line = (pick: (day: DayCount) => number) =>
    activity.map((day, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(pick(day))}`).join(" ");
  const ticks = [0, top / 2, top];
  const labels = axisDays(activity);
  const current = hover === null ? null : (activity[hover] ?? null);
  const totals = activity.reduce(
    (sum, day) => ({ messages: sum.messages + day.messages, commits: sum.commits + day.commits }),
    { messages: 0, commits: 0 },
  );
  return (
    <section className="home-chart">
      <header className="home-chart-head">
        <h3>Talk and the code it led to</h3>
        <ul className="home-legend">
          <li>
            <span className="home-swatch is-messages" /> Messages{" "}
            <strong>{formatCount(totals.messages)}</strong>
          </li>
          <li>
            <span className="home-swatch is-commits" /> Thought commits{" "}
            <strong>{formatCount(totals.commits)}</strong>
          </li>
        </ul>
      </header>
      <div className="home-chart-plot">
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          role="img"
          aria-label={`Messages and thought commits per day, ${activity[0]?.day} to ${activity.at(-1)?.day}`}
          onMouseMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const at = ((event.clientX - box.left) / box.width) * CHART.width;
            const index = Math.round(((at - CHART.left) / plotWidth) * (activity.length - 1));
            setHover(Math.max(0, Math.min(activity.length - 1, index)));
          }}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((tick) => (
            <g key={tick} className="home-grid">
              <line x1={CHART.left} x2={CHART.width - CHART.right} y1={y(tick)} y2={y(tick)} />
              <text x={CHART.left - 6} y={y(tick)} dy="0.32em" textAnchor="end">
                {Math.round(tick)}
              </text>
            </g>
          ))}
          {labels.map(({ index, text }) => (
            <text
              key={index}
              className="home-axis"
              x={x(index)}
              y={CHART.height - 6}
              textAnchor={index === 0 ? "start" : index === activity.length - 1 ? "end" : "middle"}
            >
              {text}
            </text>
          ))}
          <path className="home-line is-messages" d={line((day) => day.messages)} />
          <path className="home-line is-commits" d={line((day) => day.commits)} />
          {hover === null || current === null ? null : (
            <g className="home-cross">
              <line x1={x(hover)} x2={x(hover)} y1={CHART.top} y2={CHART.top + plotHeight} />
              <circle className="is-messages" cx={x(hover)} cy={y(current.messages)} r={4} />
              <circle className="is-commits" cx={x(hover)} cy={y(current.commits)} r={4} />
            </g>
          )}
        </svg>
        {hover === null || current === null ? null : (
          <div
            className="home-tip"
            style={{ left: `${(x(hover) / CHART.width) * 100}%` }}
            role="status"
          >
            <strong>{formatDay(current.day)}</strong>
            <span>
              <span className="home-swatch is-messages" /> {current.messages} message
              {current.messages === 1 ? "" : "s"}
            </span>
            <span>
              <span className="home-swatch is-commits" /> {current.commits} thought commit
              {current.commits === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

/** A round top for the axis: 5, 10, 20, 50, 100… at or above `value`. */
function niceTop(value: number): number {
  const step = 10 ** Math.floor(Math.log10(value));
  for (const factor of [1, 2, 5, 10]) if (factor * step >= value) return factor * step;
  return 10 * step;
}

/** Up to six evenly spread day labels. */
function axisDays(activity: readonly DayCount[]): { index: number; text: string }[] {
  const count = Math.min(6, activity.length);
  if (count <= 1)
    return activity.length === 1 ? [{ index: 0, text: formatDay(activity[0]?.day ?? "") }] : [];
  return Array.from({ length: count }, (_, step) => {
    const index = Math.round((step / (count - 1)) * (activity.length - 1));
    return { index, text: formatDay(activity[index]?.day ?? "") };
  });
}

function formatDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, date).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}

const WEEKDAYS = ["", "Mon", "", "Wed", "", "Fri", ""];

function dayTitle(day: DayCount): string {
  return `${formatDay(day.day)}: ${day.commits} thought commit${day.commits === 1 ? "" : "s"}, ${day.messages} message${day.messages === 1 ? "" : "s"}`;
}

/** The month a week column starts, shown above it when it differs from the week before. */
function monthLabel(
  week: readonly (DayCount | null)[],
  before: readonly (DayCount | null)[] | undefined,
) {
  const month = (column: readonly (DayCount | null)[] | undefined) =>
    column?.find((day) => day !== null)?.day.slice(0, 7);
  const own = month(week);
  if (own === undefined || own === month(before)) return "";
  const [year, number] = own.split("-").map(Number) as [number, number];
  return new Date(year, number - 1, 1).toLocaleDateString("en", { month: "short" });
}

/** A year of thought commits, a square a day like a GitHub profile; a square opens that day's first. */
function Calendar({ activity, today }: { activity: readonly DayCount[]; today: Date }) {
  const weeks = useMemo(() => calendarWeeks(activity, today), [activity, today]);
  const days = weeks.flat().filter((day): day is DayCount => day !== null);
  const busiest = Math.max(0, ...days.map((day) => day.commits));
  const total = days.reduce((sum, day) => sum + day.commits, 0);
  // Today is at the right edge; a narrow page starts scrolled there, like GitHub.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = scroller.current;
    if (element !== null) element.scrollLeft = element.scrollWidth;
  }, []);
  return (
    <section className="home-calendar">
      <h3>
        {formatCount(total)} thought commit{total === 1 ? "" : "s"} in the last year
      </h3>
      <div className="home-calendar-scroll" ref={scroller}>
        <div className="home-calendar-grid">
          <div className="home-weekdays" aria-hidden="true">
            <span />
            {WEEKDAYS.map((name, index) => (
              <span key={`${name}${index}`}>{name}</span>
            ))}
          </div>
          {weeks.map((week, column) => (
            <div key={week.find((day) => day !== null)?.day ?? "empty"} className="home-week">
              <span className="home-month" aria-hidden="true">
                {column === 0 ? "" : monthLabel(week, weeks[column - 1])}
              </span>
              {week.map((day, index) =>
                day === null ? (
                  <span key={index} className="home-day is-future" />
                ) : day.first === undefined ? (
                  <span
                    key={day.day}
                    className={`home-day shade-${shade(day.commits, busiest)}`}
                    title={dayTitle(day)}
                  />
                ) : (
                  <a
                    key={day.day}
                    className={`home-day shade-${shade(day.commits, busiest)}`}
                    title={dayTitle(day)}
                    aria-label={dayTitle(day)}
                    href={mapLink(day.first.projectPath, day.first.mapUrl, {
                      s: day.first.sessionId,
                      m: day.first.messageId,
                    })}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="home-calendar-key" aria-hidden="true">
        Less
        {[0, 1, 2, 3, 4].map((level) => (
          <span key={level} className={`home-day shade-${level}`} />
        ))}
        More
      </p>
    </section>
  );
}
