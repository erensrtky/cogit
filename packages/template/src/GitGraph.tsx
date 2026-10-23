import { type MouseEvent, type ReactElement, useMemo } from "react";
import { formatStamp } from "./format.js";
import {
  branchPath,
  type GitLayout,
  type GitMessageRow,
  type GitRow,
  LANE_COLORS,
  linkArrow,
  linkPath,
  ROW_HEIGHT,
} from "./gitLayout.js";

/**
 * Draws one session's messages as a git graph (Story 8.2): time-ordered rows on
 * the right, dots, lanes, branch starts and returns on the left. The geometry
 * comes from `gitLayout.ts`; this file only renders it.
 */

function color(index: number): string {
  return `var(--l${index % LANE_COLORS})`;
}

function rowRange(row: GitRow): string {
  if (row.kind === "more") return "";
  return row.message.at ? formatStamp(row.message.at) : "";
}

function returnMark(row: GitMessageRow): ReactElement | null {
  if (row.returns.length === 0) return null;
  return (
    <span className="git-returns">
      {row.returns.map((back) => (
        <span key={back.id} className="git-return" style={{ color: color(back.colorIndex) }}>
          ↩ {back.id}
        </span>
      ))}
    </span>
  );
}

function Row({
  row,
  branchTitle,
  selected,
  branchSelected,
  onSelect,
  onUnfold,
}: {
  row: GitRow;
  branchTitle: string;
  selected: boolean;
  branchSelected: boolean;
  onSelect: (row: GitMessageRow) => void;
  onUnfold: (segmentId: string) => void;
}) {
  const style = {
    top: row.y - ROW_HEIGHT / 2,
    height: ROW_HEIGHT,
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
        <span className="git-branch" style={{ background: color(row.colorIndex) }}>
          {branchTitle}
        </span>
        <span className="git-title">⋮ {row.hidden.length} more — open</span>
      </button>
    );
  }

  const message = row.message;
  return (
    <button
      type="button"
      className={`git-row${selected ? " is-selected" : ""}${branchSelected ? " in-branch" : ""}`}
      style={style}
      data-message={message.id}
      onClick={(event: MouseEvent) => {
        event.stopPropagation();
        onSelect(row);
      }}
      title={message.summary || message.title}
    >
      <span className="git-time">{rowRange(row)}</span>
      {row.first ? (
        <span className="git-branch" style={{ background: color(row.colorIndex) }}>
          {branchTitle}
        </span>
      ) : null}
      <span className="git-id">{message.id}</span>
      <span className="git-title">{message.title}</span>
      {returnMark(row)}
      {row.head ? <span className="left-off">left off here</span> : null}
      {message.unsummarized ? <span className="unsummarized">not summarized yet</span> : null}
    </button>
  );
}

export function GitGraph({
  git,
  selectedId,
  activeSegmentId,
  onSelect,
  onUnfold,
}: {
  git: GitLayout;
  /** Message id of the open drill-down, if it belongs to this session. */
  selectedId: string | null;
  /** Branch the drill-down belongs to. */
  activeSegmentId: string | null;
  onSelect: (row: GitMessageRow) => void;
  onUnfold: (segmentId: string) => void;
}) {
  const branches = useMemo(
    () => new Map(git.segments.map((segment) => [segment.id, segment])),
    [git.segments],
  );
  const segmentOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const segment of git.segments) for (const id of segment.ids) map.set(id, segment.id);
    return map;
  }, [git.segments]);

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
        {git.links.map((link) => {
          const target = segmentOf.get(link.toId);
          const from = segmentOf.get(link.fromId);
          const targetX = git.laneX[branches.get(target ?? "")?.lane ?? 0] ?? 0;
          const fromX = git.laneX[branches.get(from ?? "")?.lane ?? 0] ?? 0;
          return (
            <g key={`${link.fromId}-${link.toId}`} fill="none" stroke={color(link.colorIndex)}>
              <path d={linkPath(link, targetX, fromX)} strokeWidth={1.8} strokeDasharray="5 3" />
              <path d={linkArrow(link, fromX)} strokeWidth={1.8} />
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
      </svg>
      <div className="git-rows" style={{ left: git.graphWidth + 8 }}>
        {git.rows.map((row) => {
          const branch = branches.get(row.segmentId);
          return (
            <Row
              key={row.kind === "more" ? `${row.segmentId}-more` : row.message.id}
              row={row}
              branchTitle={branch?.branch.title ?? ""}
              selected={
                row.kind === "message" && selectedId !== null && row.message.id === selectedId
              }
              branchSelected={activeSegmentId !== null && row.segmentId === activeSegmentId}
              onSelect={onSelect}
              onUnfold={onUnfold}
            />
          );
        })}
      </div>
    </div>
  );
}
