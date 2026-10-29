import {
  Background,
  Controls,
  MiniMap,
  type Node,
  type NodeProps,
  type NodeTypes,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { unreadViewMessages } from "../../cli/src/view/change.js";
import type { LineageViewModel, ViewSession } from "../../cli/src/view/model.js";
import { hitMessageIds, hitSessionIds } from "../../cli/src/view/search.js";
import { COLUMN_HEAD, ColumnHead, loadColumns, saveColumns } from "./ColumnHead.js";
import { pageToken, saveRead } from "./data.js";
import { type FilesTarget, FilesView } from "./FilesView.js";
import { useFullscreen } from "./fullscreen.js";
import { GitGraph } from "./GitGraph.js";
import { type GitLayout, layoutGitGraph, type RowColumns } from "./gitLayout.js";
import { centreViewport, headOf, type MapPoint } from "./graph.js";
import type { MapSearchState } from "./MapSearch.js";
import { Outline, type OutlineTarget } from "./Outline.js";
import { OPEN_LINK_DROP, SessionMap } from "./SessionMap.js";
import { DrillDown, type Selection } from "./SidePanel.js";
import { usePageWheel } from "./scroll.js";
import { layoutSessionGraph, type SessionGraph } from "./sessionLayout.js";
import { useTheme } from "./ThemeButton.js";
import { UnreadView } from "./UnreadView.js";

/**
 * The project map (Story 8.7). The sessions are a git graph, one dot each;
 * clicking a session opens its messages as their own git graph (8.2) right below
 * its row, accordion-style: the other sessions stay where they are and the ones
 * below move down. Several sessions can be open; clicking again closes one.
 * Both levels share the same layout engine.
 */

/** Gap between a session row and its opened messages, and below them. */
const OPEN_TOP = OPEN_LINK_DROP - 12;
const OPEN_BOTTOM = 20;
/** Room for the "no messages yet" line of an opened session with none. */
const OPEN_EMPTY = 36;

const GraphActions = createContext<{
  selection: Selection | null;
  openIds: ReadonlySet<string>;
  /** Message ids the user marked read (Story 10.3). */
  readIds: ReadonlySet<string>;
  /** Unread messages at or above this many lines get the quiet highlight. */
  bigChangeLines: number;
  openSession: (sessionId: string) => void;
  openNode: (sessionId: string, messageId: string, branchId?: string) => void;
  openContinue: (sessionId: string, messageId: string) => void;
  unfold: (segmentId: string) => void;
  /** Sets the message rows' column widths (the column head's handles). */
  resizeColumns: (columns: RowColumns) => void;
}>({
  selection: null,
  openIds: new Set(),
  readIds: new Set(),
  bigChangeLines: 300,
  openSession: () => {},
  openNode: () => {},
  openContinue: () => {},
  unfold: () => {},
  resizeColumns: () => {},
});

/** An opened session: its message graph and where it sits on the canvas. */
type Opening = { session: ViewSession; git: GitLayout; top: number; left: number };
type ProjectData = {
  model: LineageViewModel;
  graph: SessionGraph;
  openings: Opening[];
  /** Message ids to highlight, by session (Story 8.14). */
  highlights: Map<string, Set<string>>;
  /** Sessions whose title or status matched; their row is marked. */
  sessionHits: ReadonlySet<string>;
  /** The hit the user is on (or a pasted hash), if any. */
  activeHit: { sessionId: string; messageId: string | null } | null;
};

type ProjectFlowNode = Node<ProjectData, "project">;
type MapFlowNode = ProjectFlowNode;

function SessionMessages({
  session,
  git,
  highlights,
  activeHitId,
}: {
  session: ViewSession;
  git: GitLayout;
  highlights: ReadonlySet<string> | undefined;
  activeHitId: string | null;
}) {
  const { selection, readIds, bigChangeLines, openNode, openContinue, unfold, resizeColumns } =
    useContext(GraphActions);
  const own = selection?.sessionId === session.sessionId;
  if (git.rows.length === 0)
    return <p className="graph-status empty">No messages recorded in this session yet.</p>;
  return (
    <>
      <ColumnHead git={git} onResize={resizeColumns} />
      <GitGraph
        git={git}
        selectedId={selection?.type === "node" && own ? selection.nodeId : null}
        activeSegmentId={selection?.type === "node" && own ? (selection.branchId ?? null) : null}
        highlightIds={highlights}
        activeHitId={activeHitId}
        readIds={readIds}
        bigChangeLines={bigChangeLines}
        onSelect={(row) => openNode(session.sessionId, row.message.id, row.segmentId)}
        onUnfold={unfold}
        onContinue={(continues) => openContinue(continues.sessionId, continues.id)}
      />
    </>
  );
}

function ProjectBox({ data }: NodeProps<ProjectFlowNode>) {
  const { openSession, openContinue, selection, openIds } = useContext(GraphActions);
  return (
    <div className="map-node">
      <SessionMap
        model={data.model}
        graph={data.graph}
        selectedSessionId={selection?.sessionId ?? null}
        openIds={openIds}
        highlightSessionIds={data.sessionHits}
        onOpen={openSession}
        onContinue={openContinue}
      />
      {data.openings.map((opening) => {
        const active = data.activeHit;
        return (
          <div
            key={opening.session.sessionId}
            className="session-open"
            style={{ top: opening.top, left: opening.left }}
          >
            <SessionMessages
              session={opening.session}
              git={opening.git}
              highlights={data.highlights.get(opening.session.sessionId)}
              activeHitId={
                active?.sessionId === opening.session.sessionId ? active.messageId : null
              }
            />
          </div>
        );
      })}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  project: ProjectBox,
};

/**
 * The place a URL asks for. `#s=<sessionId>&m=<messageId>` (Story 8.8:
 * `cogit blame` prints such a URL) opens that session and message;
 * `#focus=head` is what the project switcher uses (8.12) — the newest message,
 * i.e. where the work left off. The session opens and the message's drill-down
 * is shown; a message id the record no longer holds opens the session.
 */
type Target = { sessionId: string; messageId?: string; quiet?: boolean };

/** "Left off here": the newest session and its newest message. */
function headTarget(model: LineageViewModel, quiet: boolean): Target | null {
  const head = headOf(model);
  if (head === null) return null;
  const target: Target =
    head.messageId === null
      ? { sessionId: head.sessionId }
      : { sessionId: head.sessionId, messageId: head.messageId };
  return quiet ? { ...target, quiet } : target;
}

/**
 * With no hash the map opens where the work left off: the newest session
 * unfolds and the view centres on its newest message, without opening the
 * side panel (`quiet`).
 */
function readTarget(model: LineageViewModel): Target | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (!params.has("focus") && !params.has("s")) return headTarget(model, true);
  if (params.get("focus") === "head") {
    const head = headOf(model);
    if (head === null) return null;
    return head.messageId === null
      ? { sessionId: head.sessionId }
      : { sessionId: head.sessionId, messageId: head.messageId };
  }
  const sessionId = params.get("s");
  if (sessionId === null || sessionId === "") return null;
  const session = findSession(model, sessionId);
  if (session === undefined) return null;
  const messageId = params.get("m");
  if (messageId !== null && session.messages.some((message) => message.id === messageId))
    return { sessionId, messageId };
  return { sessionId };
}

function findSession(model: LineageViewModel, id: string): ViewSession | undefined {
  for (const epoch of model.epochs) {
    const session = epoch.sessions.find((candidate) => candidate.sessionId === id);
    if (session) return session;
  }
  return model.unassigned.find((session) => session.sessionId === id);
}

function Flow({ model, search }: { model: LineageViewModel; search: MapSearchState }) {
  // One scroller (Story 9.2): a wheel outside the map moves the map.
  usePageWheel();
  // Read once: a live data swap must not move the page back to the hash target.
  const [initial] = useState(() => readTarget(model));
  useEffect(() => {
    // Land on the map, not on the page header, when it opens at a message.
    if (initial?.messageId !== undefined)
      document.querySelector(".lineage-map")?.scrollIntoView({ block: "start" });
  }, [initial]);
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(
    () => new Set(initial === null ? [] : [initial.sessionId]),
  );
  const [selection, setSelection] = useState<Selection | null>(() => {
    if (initial === null || initial.quiet) return null;
    if (initial.messageId === undefined) return { type: "session", sessionId: initial.sessionId };
    return { type: "node", sessionId: initial.sessionId, nodeId: initial.messageId };
  });
  const [unfolded, setUnfolded] = useState<Set<string>>(() => new Set());
  /** Message rows' column widths; the same for every session, kept in this browser. */
  const [columns, setColumns] = useState<RowColumns>(loadColumns);
  useEffect(() => saveColumns(columns), [columns]);
  const [openAll, setOpenAll] = useState(false);
  const [showOutline, setShowOutline] = useState(true);
  // The files, unread and outline views share the left column; only one shows.
  const [showFiles, setShowFiles] = useState(false);
  const [showUnread, setShowUnread] = useState(false);
  const { expanded: fullscreen, toggle: toggleFullscreen } = useFullscreen();
  // Story 10.3: the read marks the page was built with. A live rebuild refreshes
  // them; the toggle updates this set at once so the row answers the click.
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => new Set(model.read ?? []));
  const [readError, setReadError] = useState<string | null>(null);
  useEffect(() => {
    setReadIds(new Set(model.read ?? []));
  }, [model]);
  const bigChangeLines = model.settings?.bigChangeLines ?? 300;
  const toggleRead = useCallback(
    (id: string, next: boolean) => {
      setReadError(null);
      setReadIds((previous) => {
        const copy = new Set(previous);
        if (next) copy.add(id);
        else copy.delete(id);
        return copy;
      });
      // Over `file://` there is no server to write to; the mark lasts for this
      // open page only, which is what the toggle's title says.
      const token = pageToken();
      if (token === null) return;
      void saveRead(model.project.path, id, next, token).catch((err: unknown) => {
        setReadError(err instanceof Error ? err.message : String(err));
        setReadIds((previous) => {
          const copy = new Set(previous);
          if (next) copy.delete(id);
          else copy.add(id);
          return copy;
        });
      });
    },
    [model.project.path],
  );
  const unread = useMemo(
    () =>
      unreadViewMessages(
        [...model.epochs.flatMap((epoch) => epoch.sessions), ...model.unassigned],
        readIds,
      ),
    [model, readIds],
  );
  const unreadBig = useMemo(
    () =>
      unread.filter((message) => message.change.added + message.change.removed >= bigChangeLines),
    [unread, bigChangeLines],
  );
  const [focusedId, setFocusedId] = useState<string | null>(() => {
    if (initial === null) return null;
    if (initial.messageId === undefined) return `session:${initial.sessionId}`;
    return `node:session:${initial.sessionId}:${initial.messageId}`;
  });

  const head = headOf(model);

  // Search (Story 8.14): highlight matching messages, open their sessions and
  // centre the active hit. A pasted hash resolves to one message and shows it
  // like `show`; a session-level hit centres the session's row instead.
  const hashHit = search.hash?.kind === "ok" ? search.hash : null;
  // A live data swap can shrink the hit list under the cursor; clamp instead of
  // pointing at a row that is no longer there.
  const activeHit = search.hits[Math.min(search.active, search.hits.length - 1)] ?? null;
  const searchTarget = useMemo(
    () =>
      hashHit !== null
        ? { sessionId: hashHit.sessionId, messageId: hashHit.messageId }
        : activeHit === null
          ? null
          : { sessionId: activeHit.sessionId, messageId: activeHit.messageId },
    [hashHit?.sessionId, hashHit?.messageId, activeHit?.sessionId, activeHit?.messageId],
  );
  const highlights = useMemo(() => hitMessageIds(search.hits), [search.hits]);
  const sessionHits = useMemo(
    () => new Set(search.hits.flatMap((hit) => (hit.messageId === null ? [hit.sessionId] : []))),
    [search.hits],
  );
  const hitSessions = useMemo(() => hitSessionIds(search.hits), [search.hits]);

  // Opening the accordion for every match is what makes the highlights visible.
  useEffect(() => {
    if (hitSessions.length === 0) return;
    setOpenIds((previous) => {
      let changed = false;
      const next = new Set(previous);
      for (const id of hitSessions) {
        if (next.has(id)) continue;
        next.add(id);
        changed = true;
      }
      return changed ? next : previous;
    });
  }, [hitSessions]);

  /** The open drill-down's message, if any. */
  const target = selection?.type === "node" ? selection : null;

  /** Message graph of every open session. */
  const messageGits = useMemo(() => {
    const out = new Map<string, GitLayout>();
    for (const sessionId of openIds) {
      const session = findSession(model, sessionId);
      if (!session) continue;
      let options = {
        unfolded,
        openAll,
        columns,
        headId: head?.sessionId === sessionId ? head.messageId : null,
      };
      // A search hit inside a folded branch must be visible to be highlighted,
      // so every branch that holds a hit of this session opens.
      const hitIds = highlights.get(sessionId);
      if (hitIds !== undefined && hitIds.size > 0) {
        const folded = layoutGitGraph(session.messages, options);
        const extra = folded.segments
          .filter((segment) => segment.ids.some((id) => hitIds.has(id)))
          .map((segment) => segment.id);
        if (extra.length > 0) options = { ...options, unfolded: new Set([...unfolded, ...extra]) };
      }
      let layout = layoutGitGraph(session.messages, options);
      const targetId = target?.sessionId === sessionId ? target.nodeId : null;
      if (
        targetId !== null &&
        !layout.rows.some((row) => row.kind === "message" && row.message.id === targetId)
      ) {
        // A deep link (`blame` prints one) may point inside a folded branch: open it
        // rather than letting the page land on a row the user cannot see.
        const segment = layout.segments.find((candidate) => candidate.ids.includes(targetId));
        if (segment !== undefined)
          layout = layoutGitGraph(session.messages, {
            ...options,
            unfolded: new Set([...unfolded, segment.id]),
          });
      }
      out.set(sessionId, layout);
    }
    return out;
  }, [
    model,
    openIds,
    unfolded,
    openAll,
    columns,
    highlights,
    head?.sessionId,
    head?.messageId,
    target?.sessionId,
    target?.nodeId,
  ]);

  /** Room under each open session's row for its messages. */
  const spaceAfter = useMemo(() => {
    const out = new Map<string, number>();
    for (const [sessionId, git] of messageGits)
      out.set(
        sessionId,
        OPEN_TOP + (git.rows.length === 0 ? OPEN_EMPTY : COLUMN_HEAD + git.height) + OPEN_BOTTOM,
      );
    return out;
  }, [messageGits]);

  const sessionGraph = useMemo(() => layoutSessionGraph(model, spaceAfter), [model, spaceAfter]);

  const openings = useMemo(() => {
    const out: Opening[] = [];
    for (const row of sessionGraph.git.rows) {
      if (row.kind !== "message" || row.spaceTop === undefined) continue;
      const session = sessionGraph.sessions.get(row.message.id);
      const git = messageGits.get(row.message.id);
      if (!session || !git) continue;
      out.push({
        session,
        git,
        top: row.spaceTop + OPEN_TOP,
        left: sessionGraph.git.graphWidth + 8,
      });
    }
    return out;
  }, [sessionGraph, messageGits]);

  /** Canvas point of a message in an open session, or null when it is not drawn. */
  const pointOf = useCallback(
    (sessionId: string, messageId: string | undefined) => {
      if (messageId === undefined) return null;
      const opening = openings.find((candidate) => candidate.session.sessionId === sessionId);
      const row = opening?.git.rows.find(
        (candidate) => candidate.kind === "message" && candidate.message.id === messageId,
      );
      if (!opening || !row) return null;
      // Frame the whole row (lanes and text), not only its dot.
      return {
        x: opening.left + opening.git.graphWidth / 2,
        y: opening.top + COLUMN_HEAD + row.y,
        left: opening.left,
        right: opening.left + opening.git.width,
      };
    },
    [openings],
  );

  /** A search hit's point: its message, or the session's row for a session hit. */
  const pointOfHit = useCallback(
    (hit: { sessionId: string; messageId: string | null }) => {
      if (hit.messageId !== null) return pointOf(hit.sessionId, hit.messageId);
      const row = sessionGraph.git.rows.find(
        (candidate) => candidate.kind === "message" && candidate.message.id === hit.sessionId,
      );
      return row === undefined ? null : { x: sessionGraph.git.graphWidth / 2, y: row.y };
    },
    [pointOf, sessionGraph],
  );

  /** Where the view centres on load: the target message, else the whole map. */
  const focusRow = useMemo(
    () => (initial === null ? null : pointOf(initial.sessionId, initial.messageId)),
    [initial, pointOf],
  );

  /** "Left off here" button: a request to centre on HEAD, re-sent on every click. */
  const [jumps, setJumps] = useState(0);
  /** "Fold all": a request to frame the whole map again once everything closed. */
  const [fits, setFits] = useState(0);
  const leftOff = useMemo(() => headTarget(model, true), [model]);
  const jump = useMemo(
    () =>
      jumps === 0 || leftOff === null
        ? null
        : { key: jumps, point: pointOf(leftOff.sessionId, leftOff.messageId) },
    [jumps, leftOff, pointOf],
  );

  /**
   * A search move: the step counter changes on every keystroke and on ↑/↓, and
   * the point may only resolve once the hit's session has opened, so the canvas
   * waits for both.
   */
  const searchPoint = useMemo(
    () => (searchTarget === null ? null : pointOfHit(searchTarget)),
    [searchTarget, pointOfHit],
  );
  const searchJump = useMemo(
    () =>
      search.step === 0 || searchPoint === null ? null : { key: search.step, point: searchPoint },
    [search.step, searchPoint],
  );

  const ensureOpen = useCallback((sessionId: string) => {
    setOpenIds((previous) =>
      previous.has(sessionId) ? previous : new Set([...previous, sessionId]),
    );
  }, []);
  const toggleSession = useCallback(
    (sessionId: string) => {
      if (openIds.has(sessionId)) {
        const next = new Set(openIds);
        next.delete(sessionId);
        setOpenIds(next);
        setSelection((previous) => (previous?.sessionId === sessionId ? null : previous));
        return;
      }
      // Opening only unfolds the accordion; the side panel waits for a message click
      // so it does not cover the messages that just opened.
      setOpenIds(new Set([...openIds, sessionId]));
      setFocusedId(`session:${sessionId}`);
    },
    [openIds],
  );
  const openNode = useCallback(
    (sessionId: string, messageId: string, branchId?: string) => {
      ensureOpen(sessionId);
      setFocusedId(`node:session:${sessionId}:${messageId}`);
      setSelection({
        type: "node",
        sessionId,
        nodeId: messageId,
        ...(branchId === undefined ? {} : { branchId }),
      });
    },
    [ensureOpen],
  );
  const openContinue = useCallback(
    (sessionId: string, messageId: string) => openNode(sessionId, messageId),
    [openNode],
  );

  // A pasted hash opens the message the way clicking it would (`show` for the map).
  useEffect(() => {
    if (hashHit === null) return;
    openNode(hashHit.sessionId, hashHit.messageId);
  }, [hashHit?.sessionId, hashHit?.messageId, openNode]);
  // An inbox row (Story 11.1) links to a message in this same page, so the hash
  // changes without a reload; open it the way opening the page there would.
  useEffect(() => {
    function onHashChange(): void {
      const target = readTarget(model);
      if (target === null) return;
      ensureOpen(target.sessionId);
      if (target.messageId !== undefined) openNode(target.sessionId, target.messageId);
      document.querySelector(".lineage-map")?.scrollIntoView({ block: "start" });
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [model, ensureOpen, openNode]);
  const unfold = useCallback((segmentId: string) => {
    setUnfolded((previous) => {
      const next = new Set(previous);
      next.add(segmentId);
      return next;
    });
  }, []);
  const selectFromOutline = useCallback(
    (target: OutlineTarget) => {
      setFocusedId(target.focusId);
      if (target.sessionId !== null) ensureOpen(target.sessionId);
      setSelection(target.selection);
    },
    [ensureOpen],
  );

  // A file row (8.15) opens its message exactly like a dot click, and the view
  // moves to it once the session's layout is in place.
  const [fileJumps, setFileJumps] = useState(0);
  const selectFromFiles = useCallback(
    (target: FilesTarget) => {
      openNode(target.sessionId, target.messageId);
      setFileJumps((value) => value + 1);
    },
    [openNode],
  );
  const filePoint = useMemo(
    () => (target === null ? null : pointOf(target.sessionId, target.nodeId)),
    // `pointOf` changes when an opened session's layout changes, which is how a
    // click that opens a session resolves its point on the next render.
    [target?.sessionId, target?.nodeId, pointOf],
  );
  const fileJump = useMemo(
    () => (fileJumps === 0 || filePoint === null ? null : { key: fileJumps, point: filePoint }),
    [fileJumps, filePoint],
  );

  const actions = useMemo(
    () => ({
      selection,
      openIds,
      readIds,
      bigChangeLines,
      openSession: toggleSession,
      openNode,
      openContinue,
      unfold,
      resizeColumns: setColumns,
    }),
    [selection, openIds, readIds, bigChangeLines, toggleSession, openNode, openContinue, unfold],
  );

  const nodes = useMemo<MapFlowNode[]>(() => {
    const width = Math.max(
      sessionGraph.git.width,
      ...openings.map((opening) => opening.left + opening.git.width),
    );
    return [
      {
        id: "project",
        type: "project",
        position: { x: 0, y: 0 },
        width,
        height: sessionGraph.git.height,
        style: { width, height: sessionGraph.git.height },
        draggable: false,
        connectable: false,
        selectable: false,
        data: {
          model,
          graph: sessionGraph,
          openings,
          highlights,
          sessionHits,
          activeHit: searchTarget,
        },
      },
    ];
  }, [model, sessionGraph, openings, highlights, sessionHits, searchTarget]);

  return (
    <GraphActions.Provider value={actions}>
      <div className={fullscreen ? "map-shell is-expanded" : "map-shell"}>
        <div className="map-toolbar">
          <span className="map-title">
            {`${sessionGraph.git.rows.length} session${
              sessionGraph.git.rows.length === 1 ? "" : "s"
            } · click a session to open or close its messages`}
          </span>
          {leftOff ? (
            <button
              type="button"
              className="outline-button"
              title="Open the newest session and go to its newest message"
              onClick={() => {
                ensureOpen(leftOff.sessionId);
                setJumps((value) => value + 1);
                document.querySelector(".lineage-map")?.scrollIntoView({ block: "start" });
              }}
            >
              ↧ Left off here
            </button>
          ) : null}
          <button
            type="button"
            className="outline-button"
            aria-pressed={openAll}
            title={
              openAll
                ? "Close every session and fold long branches again"
                : "Open every session and every folded branch"
            }
            onClick={() => {
              // "All" means the whole map: every session opens (or closes), not
              // only the folded branches of the sessions already open.
              setOpenIds(openAll ? new Set() : new Set(sessionGraph.sessions.keys()));
              if (openAll) setFits((value) => value + 1);
              setOpenAll((value) => !value);
              setUnfolded(new Set());
            }}
          >
            {openAll ? "Fold all" : "Unfold all"}
          </button>
          <button
            type="button"
            className="outline-button"
            aria-pressed={fullscreen}
            onClick={toggleFullscreen}
          >
            {fullscreen ? "Exit full screen" : "Full screen"}
          </button>
          <button
            type="button"
            className="outline-button"
            aria-pressed={showOutline}
            onClick={() => {
              setShowOutline((value) => !value);
              setShowFiles(false);
            }}
          >
            {showOutline ? "Hide outline" : "Show outline"}
          </button>
          <button
            type="button"
            className="outline-button"
            aria-pressed={showFiles}
            title="Which conversations touched which file"
            onClick={() => {
              setShowFiles((value) => !value);
              setShowOutline(false);
              setShowUnread(false);
            }}
          >
            {showFiles ? "Hide files" : "Files"}
          </button>
          <button
            type="button"
            className="outline-button"
            aria-pressed={showUnread}
            title="Unread messages with commits, most code first"
            onClick={() => {
              setShowUnread((value) => !value);
              setShowOutline(false);
              setShowFiles(false);
            }}
          >
            {showUnread
              ? "Hide unread"
              : `Unread${unreadBig.length > 0 ? ` (${unreadBig.length})` : ""}`}
          </button>
        </div>
        <div className="graph-wrap">
          {showUnread ? (
            <UnreadView
              messages={unread}
              bigChangeLines={bigChangeLines}
              active={
                selection?.type === "node"
                  ? { sessionId: selection.sessionId, messageId: selection.nodeId }
                  : null
              }
              onSelect={selectFromFiles}
              onClose={() => setShowUnread(false)}
            />
          ) : showFiles ? (
            <FilesView
              files={model.files}
              active={
                selection?.type === "node"
                  ? { sessionId: selection.sessionId, messageId: selection.nodeId }
                  : null
              }
              onSelect={selectFromFiles}
              onClose={() => setShowFiles(false)}
            />
          ) : showOutline ? (
            <Outline
              model={model}
              activeId={focusedId}
              onSelect={selectFromOutline}
              onClose={() => setShowOutline(false)}
            />
          ) : null}
          <div className="graph-canvas">
            {sessionGraph.git.rows.length === 0 ? (
              <p className="graph-status empty">No sessions recorded yet.</p>
            ) : (
              <MapCanvas
                nodes={nodes}
                focusRow={focusRow}
                jump={jump}
                searchJump={searchJump}
                fileJump={fileJump}
                fit={fits}
              />
            )}
            <DrillDown
              model={model}
              selection={selection}
              onClose={() => setSelection(null)}
              onNavigate={selectFromOutline}
              read={selection?.type === "node" ? readIds.has(selection.nodeId) : false}
              onToggleRead={toggleRead}
              bigChangeLines={bigChangeLines}
              readError={readError}
            />
          </div>
        </div>
      </div>
    </GraphActions.Provider>
  );
}

/** A theme colour for an SVG attribute (the minimap cannot read CSS variables). */
function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/**
 * One React Flow canvas for the whole map. It frames the map once on load (or
 * centres a deep-linked message); opening or closing a session and live data
 * swaps leave the viewport where the user put it.
 */
function MapCanvas({
  nodes,
  focusRow,
  jump,
  searchJump,
  fileJump,
  fit,
}: {
  nodes: MapFlowNode[];
  /** Point to centre on at load; null fits the whole graph. */
  focusRow: MapPoint | null;
  /** A user request to centre on a point; a new `key` moves the view again. */
  jump: { key: number; point: MapPoint | null } | null;
  /** A search move: the active hit or a pasted hash (Story 8.14). */
  searchJump: { key: number; point: { x: number; y: number } } | null;
  /** A files-view click: the message it opened (Story 8.15). */
  fileJump: { key: number; point: { x: number; y: number } } | null;
  /** A new value frames the whole map again (after "Fold all"). */
  fit: number;
}) {
  const { fitView, setViewport } = useReactFlow();
  const theme = useTheme();

  /** Centres the view on a canvas point; does nothing before the canvas exists. */
  function centre(point: MapPoint): void {
    const canvas = document.querySelector(".react-flow")?.getBoundingClientRect();
    if (!canvas) return;
    void setViewport(centreViewport(point, canvas, 0.9), { duration: 300 });
  }

  useEffect(() => {
    if (fit === 0) return;
    // Wait a frame so React Flow has the smaller, closed map before framing it.
    const timer = window.setTimeout(
      () => void fitView({ padding: 0.12, maxZoom: 1, duration: 300 }),
      50,
    );
    return () => window.clearTimeout(timer);
  }, [fit]);

  const jumpKey = jump?.key ?? 0;
  const jumpPoint = jump?.point ?? null;
  useEffect(() => {
    if (jumpKey === 0 || jumpPoint === null) return;
    centre(jumpPoint);
    // Only a new click moves the view; a live data swap must not.
  }, [jumpKey]);

  // A search step also re-centres when its point only resolves after the hit's
  // session has opened (`searchJump.key` stays the same in that case).
  const searchKey = searchJump?.key ?? 0;
  const searchPoint = searchJump?.point ?? null;
  useEffect(() => {
    if (searchKey === 0 || searchPoint === null) return;
    centre(searchPoint);
  }, [searchKey, searchPoint]);

  const fileKey = fileJump?.key ?? 0;
  const filePoint = fileJump?.point ?? null;
  useEffect(() => {
    if (fileKey === 0 || filePoint === null) return;
    centre(filePoint);
  }, [fileKey, filePoint]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const canvas = document.querySelector(".react-flow")?.getBoundingClientRect();
      if (focusRow && canvas) {
        void setViewport(centreViewport(focusRow, canvas, 0.9));
        return;
      }
      void fitView({ padding: 0.12, maxZoom: 1, duration: 200 });
    }, 80);
    return () => window.clearTimeout(timer);
    // Mount only: opening a session or a model swap must not refit.
  }, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={[]}
      nodeTypes={nodeTypes}
      fitView
      panOnScroll
      minZoom={0.05}
      maxZoom={2}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      colorMode={theme}
    >
      <Background gap={24} size={1} color="#242a36" />
      <MiniMap
        pannable
        zoomable
        nodeColor={() => cssVar("--active", "#243040")}
        maskColor={`${cssVar("--bg", "#0f1115")}b3`}
      />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

/** The project map: sessions at the top, a session's messages in place. */
export function Graph({ model, search }: { model: LineageViewModel; search: MapSearchState }) {
  return (
    <section className="lineage-map" aria-label="Project lineage graph">
      <ReactFlowProvider>
        <Flow model={model} search={search} />
      </ReactFlowProvider>
    </section>
  );
}
