import type { MouseEvent } from "react";
import type { LineageViewModel, ViewSession } from "../../cli/src/view/model.js";
import { formatStamp } from "./format.js";
import { branchPath, type GitMessageRow, type GitRow, LANE_COLORS } from "./gitLayout.js";
import type { SessionGraph } from "./sessionLayout.js";

/**
 * Draws the project's sessions as a git graph (Story 8.7): one dot per session
 * in start order, lanes for branches of sessions, an epoch tag on each dot and
 * the session title as its label. Clicking a row opens that session's messages
 * in place. The geometry comes from `sessionLayout.ts`; this file only renders.
 */

/** How far below the session row the line into its opened messages turns right. */
export const OPEN_LINK_DROP = 18;

function color(index: number): string {
  return `var(--l${index % LANE_COLORS})`;
}

/** A neutral, outlined epoch tag — deliberately unlike a branch label. */
function TagIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M2 2h5.2l6.3 6.3-5.2 5.2L2 7.2V2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="5.2" cy="5.2" r="1.2" fill="currentColor" />
    </svg>
  );
}

function SessionRow({
  row,
  session,
  epochTitle,
  selected,
  open,
  searchHit,
  onOpen,
  onContinue,
}: {
  row: GitMessageRow;
  session: ViewSession;
  epochTitle: string | null;
  selected: boolean;
  /** Its messages are open below the row. */
  open: boolean;
  /** The session's title or status matches the search (Story 8.14). */
  searchHit: boolean;
  onOpen: (sessionId: string) => void;
  onContinue: (continues: NonNullable<ViewSession["messages"][number]["continues"]>) => void;
}) {
  const continues = session.messages[0]?.continues;
  const style = { top: row.y - row.height / 2, height: row.height };
  const count = session.messages.length;
  const className = [
    "git-row session-row",
    selected ? "is-selected" : "",
    open ? "is-open" : "",
    searchHit ? "is-search-hit" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={className}
      style={style}
      aria-expanded={open}
      onClick={(event: MouseEvent) => {
        event.stopPropagation();
        onOpen(session.sessionId);
      }}
      title={session.status.goal || session.title}
    >
      <span className="session-toggle" aria-hidden="true">
        {open ? "▾" : "▸"}
      </span>
      <span className="git-time">{session.startedAt ? formatStamp(session.startedAt) : ""}</span>
      {epochTitle ? (
        <span className="epoch-tag" title={`Epoch: ${epochTitle}`}>
          <TagIcon />
          {epochTitle}
        </span>
      ) : null}
      <span className="git-title">{session.title || session.sessionId}</span>
      <span className="muted session-count">
        {count} message{count === 1 ? "" : "s"}
      </span>
      {session.unrecordedMessages ? (
        <span className="muted unrecorded" title="The SessionEnd catch-up is off">
          {session.unrecordedMessages} not recorded
        </span>
      ) : null}
      {continues ? (
        <span
          className="git-continues"
          title={`Open ${continues.sessionTitle} at ${continues.label ?? continues.id}`}
          onClick={(event: MouseEvent) => {
            event.stopPropagation();
            onContinue(continues);
          }}
        >
          ↑ continues {continues.sessionTitle} · {continues.label ?? continues.id}
        </span>
      ) : null}
      {row.head ? <span className="left-off">left off here</span> : null}
    </button>
  );
}

export function SessionMap({
  model,
  graph,
  selectedSessionId,
  openIds,
  highlightSessionIds,
  onOpen,
  onContinue,
}: {
  model: LineageViewModel;
  graph: SessionGraph;
  selectedSessionId: string | null;
  /** Sessions whose messages are open below their rows. */
  openIds: ReadonlySet<string>;
  /** Sessions whose title or status matched the map search. */
  highlightSessionIds: ReadonlySet<string>;
  onOpen: (sessionId: string) => void;
  onContinue: (sessionId: string, messageId: string) => void;
}) {
  const { git } = graph;
  const epochTitles = new Map(model.epochs.map((epoch) => [epoch.id, epoch.title]));
  const segments = new Map(git.segments.map((segment) => [segment.id, segment]));

  const open: (row: GitRow) => void = (row) => {
    if (row.kind === "message") onOpen(row.message.id);
  };

  return (
    <div className="git-graph session-map" style={{ width: git.width, height: git.height }}>
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
                const previous = rows[at];
                if (!previous) return null;
                return (
                  <path
                    key={`${row.segmentId}-${at}`}
                    d={`M${x},${previous.y} L${x},${row.y}`}
                    strokeWidth={2.5}
                  />
                );
              })}
            </g>
          );
        })}
        {git.rows.map((row) => {
          if (row.kind !== "message" || row.spaceTop === undefined) return null;
          // An opened session: a line from its dot down into its messages below.
          const x = git.laneX[segments.get(row.segmentId)?.lane ?? 0] ?? 0;
          const y = row.spaceTop + OPEN_LINK_DROP;
          return (
            <path
              key={`${row.message.id}-open`}
              d={`M${x},${row.y} L${x},${y} L${git.graphWidth + 4},${y}`}
              stroke={color(row.colorIndex)}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              fill="none"
            />
          );
        })}
        {git.rows.map((row) => {
          if (row.kind !== "message") return null;
          const x = git.laneX[segments.get(row.segmentId)?.lane ?? 0] ?? 0;
          return row.first ? (
            <circle
              key={row.message.id}
              cx={x}
              cy={row.y}
              r={6}
              fill="var(--bg)"
              stroke={color(row.colorIndex)}
              strokeWidth={3}
              className="session-dot"
              onClick={() => open(row)}
            />
          ) : (
            <circle
              key={row.message.id}
              cx={x}
              cy={row.y}
              r={4.5}
              fill={color(row.colorIndex)}
              className="session-dot"
              onClick={() => open(row)}
            />
          );
        })}
      </svg>
      <div className="git-rows" style={{ left: git.graphWidth + 8, width: git.rowWidth }}>
        {git.rows.map((row) => {
          const session = row.kind === "message" ? graph.sessions.get(row.message.id) : undefined;
          if (row.kind !== "message" || !session) return null;
          const epochTitle = session.epoch ? (epochTitles.get(session.epoch) ?? null) : null;
          return (
            <SessionRow
              key={row.message.id}
              row={row}
              session={session}
              epochTitle={epochTitle}
              selected={selectedSessionId === session.sessionId}
              open={openIds.has(session.sessionId)}
              searchHit={highlightSessionIds.has(session.sessionId)}
              onOpen={onOpen}
              onContinue={(continues) => onContinue(continues.sessionId, continues.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
