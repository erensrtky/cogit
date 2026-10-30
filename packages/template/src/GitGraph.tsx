import { type MouseEvent, useMemo } from "react";
import { formatChange, isBigChange } from "../../cli/src/view/change.js";
import type { ViewNode } from "../../cli/src/view/model.js";
import { dayOf, formatClock, formatStamp } from "./format.js";
import {
  branchPath,
  type GitLayout,
  type GitMessageRow,
  type GitRow,
  LANE_COLORS,
} from "./gitLayout.js";

/**
 * Draws one session's messages as a git graph (Story 8.2): time-ordered rows on
 * the right, dots, lanes and branch starts on the left. The geometry
 * comes from `gitLayout.ts`; this file only renders it.
 */

function color(index: number): string {
  return `var(--l${index % LANE_COLORS})`;
}

/** Date and time on a day's first row; the rows under it on the same day show the time only. */
function rowRange(row: GitRow, sameDay: boolean): string {
  if (row.kind === "more" || !row.message.at) return "";
  return sameDay ? formatClock(row.message.at) : formatStamp(row.message.at);
}

function Row({
  row,
  sameDay,
  selected,
  branchSelected,
  searchHit,
  searchActive,
  read,
  bigChangeLines,
  onSelect,
  onUnfold,
  onContinue,
}: {
  row: GitRow;
  /** The row above is on the same day, so this one shows only the time. */
  sameDay: boolean;
  selected: boolean;
  branchSelected: boolean;
  /** The message matches the search (Story 8.14). */
  searchHit: boolean;
  /** The hit the ↑/↓ counter is on. */
  searchActive: boolean;
  /** The user marked this message read (Story 10.3). */
  read: boolean;
  /** Unread messages at or above this many lines get the quiet highlight. */
  bigChangeLines: number;
  onSelect: (row: GitMessageRow) => void;
  onUnfold: (segmentId: string) => void;
  onContinue: (continues: NonNullable<ViewNode["continues"]>) => void;
}) {
  const style = {
    top: row.y - row.height / 2,
    height: row.height,
    borderColor: branchSelected ? color(row.colorIndex) : undefined,
  };

  if (row.kind === "more") {
    return (
      <button
        type="button"
        className="git-row git-more"
        style={style}
        onClick={(event) => {
          event.stopPropagation();
          onUnfold(row.segmentId);
        }}
        title="Show the folded messages of this branch"
      >
        <span className="git-title">⋮ {row.hidden.length} more — open</span>
      </button>
    );
  }

  const message = row.message;
  // A fact, not a verdict: the row is only quiet-highlighted when the user has
  // not read it and its commits changed at least `bigChangeLines` lines.
  const unreadBig =
    message.change !== undefined && !read && isBigChange(message.change, bigChangeLines);
  const className = [
    "git-row",
    selected ? "is-selected" : "",
    branchSelected ? "in-branch" : "",
    searchHit ? "is-search-hit" : "",
    searchActive ? "is-search-active" : "",
    unreadBig ? "is-unread-big" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={className}
      style={style}
      data-message={message.id}
      onClick={(event: MouseEvent) => {
        event.stopPropagation();
        onSelect(row);
      }}
      title={message.summary || message.title}
    >
      <span className="git-time">{rowRange(row, sameDay)}</span>
      <span className="git-id">{message.label ?? message.id}</span>
      <span className="git-title">{message.title}</span>
      {row.tags.length > 0 ? (
        <span className="git-tags">
          {row.tags.map((tag) => (
            // A span, not a button: the whole row is already a button.
            <span
              key={tag.hash}
              className={`git-tag${tag.missing ? " is-missing" : ""}`}
              title={
                tag.missing
                  ? `commit ${tag.short} is not in this repository`
                  : `${tag.short} ${tag.subject ?? ""}`
              }
              onClick={(event: MouseEvent) => {
                event.stopPropagation();
                onSelect(row);
              }}
            >
              {tag.short}
            </span>
          ))}
        </span>
      ) : null}
      {message.change ? (
        <span
          className="git-change"
          title={`The commits linked to this message changed ${message.change.added} lines added, ${message.change.removed} removed${read ? " (read)" : ""}`}
        >
          {formatChange(message.change)}
        </span>
      ) : null}
      {message.continues ? (
        <span
          className="git-continues"
          title={`Open ${message.continues.sessionTitle} at ${message.continues.label ?? message.continues.id}`}
          onClick={(event: MouseEvent) => {
            event.stopPropagation();
            onContinue(message.continues as NonNullable<ViewNode["continues"]>);
          }}
        >
          ↑ {message.continues.label ?? message.continues.id}
        </span>
      ) : null}
      {row.head ? <span className="left-off">left off here</span> : null}
      {message.unsummarized ? <span className="unsummarized">not summarized yet</span> : null}
    </button>
  );
}

export function GitGraph({
  git,
  selectedId,
  activeSegmentId,
  highlightIds,
  activeHitId,
  readIds,
  bigChangeLines,
  onSelect,
  onUnfold,
  onContinue,
}: {
  git: GitLayout;
  /** Message id of the open drill-down, if it belongs to this session. */
  selectedId: string | null;
  /** Branch the drill-down belongs to. */
  activeSegmentId: string | null;
  /** Messages that match the map search (Story 8.14); undefined when none. */
  highlightIds: ReadonlySet<string> | undefined;
  /** The search hit the counter is on, if it belongs to this session. */
  activeHitId: string | null;
  /** Messages the user marked read (Story 10.3). */
  readIds: ReadonlySet<string>;
  /** Unread messages at or above this many lines get the quiet highlight. */
  bigChangeLines: number;
  onSelect: (row: GitMessageRow) => void;
  onUnfold: (segmentId: string) => void;
  /** Opens the earlier session this message continues, at that message. */
  onContinue: (continues: NonNullable<ViewNode["continues"]>) => void;
}) {
  const branches = useMemo(
    () => new Map(git.segments.map((segment) => [segment.id, segment])),
    [git.segments],
  );
  return (
    <div className="git-graph" style={{ width: git.width, height: git.height }}>
      <svg
        className="git-lanes"
        width={git.graphWidth}
        height={git.height}
        aria-hidden="true"
        focusable="false"
      >
        {git.segments.map((segment) => {
          const start = branchPath(segment, git.laneX);
          const rows = git.rows.filter((row) => row.segmentId === segment.id);
          const x = git.laneX[segment.lane] ?? 0;
          return (
            <g key={segment.id} stroke={color(segment.colorIndex)} fill="none">
              {start ? <path d={start} strokeWidth={2.5} /> : null}
              {rows.slice(1).map((row, at) => {
                const previous = rows[at] as GitRow | undefined;
                if (!previous) return null;
                const folded = previous.kind === "more" || row.kind === "more";
                return (
                  <path
                    key={`${row.segmentId}-${at}`}
                    d={`M${x},${previous.y} L${x},${row.y}`}
                    strokeWidth={folded ? 6 : 2.5}
                    opacity={folded ? 0.3 : 1}
                  />
                );
              })}
            </g>
          );
        })}
        {git.rows.map((row) => {
          if (row.kind !== "message") return null;
          const x = git.laneX[branches.get(row.segmentId)?.lane ?? 0] ?? 0;
          return row.first ? (
            <circle
              key={row.message.id}
              cx={x}
              cy={row.y}
              r={6}
              fill="var(--bg)"
              stroke={color(row.colorIndex)}
              strokeWidth={3}
            />
          ) : (
            <circle key={row.message.id} cx={x} cy={row.y} r={4.5} fill={color(row.colorIndex)} />
          );
        })}
        {git.rows.map((row) => {
          if (row.kind !== "message") return null;
          const x = git.laneX[branches.get(row.segmentId)?.lane ?? 0] ?? 0;
          // An invisible, larger target so a click on the dot does what a click on its row does.
          return (
            <circle
              key={`${row.message.id}-hit`}
              className="git-dot-hit nodrag nopan"
              cx={x}
              cy={row.y}
              r={10}
              fill="transparent"
              onClick={(event) => {
                event.stopPropagation();
                onSelect(row);
              }}
            />
          );
        })}
      </svg>
      <div className="git-rows" style={{ left: git.graphWidth + 8, width: git.rowWidth }}>
        {git.rows.map((row, at) => {
          const messageId = row.kind === "message" ? row.message.id : null;
          const above = git.rows[at - 1];
          const day = row.kind === "message" ? dayOf(row.message.at) : null;
          const sameDay =
            day !== null && above?.kind === "message" && dayOf(above.message.at) === day;
          return (
            <Row
              key={row.kind === "more" ? `${row.segmentId}-more` : row.message.id}
              row={row}
              sameDay={sameDay}
              selected={messageId !== null && selectedId !== null && messageId === selectedId}
              branchSelected={activeSegmentId !== null && row.segmentId === activeSegmentId}
              searchHit={messageId !== null && highlightIds?.has(messageId) === true}
              searchActive={messageId !== null && activeHitId !== null && messageId === activeHitId}
              read={messageId !== null && readIds.has(messageId)}
              bigChangeLines={bigChangeLines}
              onSelect={onSelect}
              onUnfold={onUnfold}
              onContinue={onContinue}
            />
          );
        })}
      </div>
    </div>
  );
}
