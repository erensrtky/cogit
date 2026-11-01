import { useEffect, useState } from "react";
import type { ViewFile, ViewSession } from "../../cli/src/view/model.js";
import { formatStamp } from "./format.js";
import { shortHash } from "./graph.js";

/**
 * The files view (Story 8.15): every file a recorded message touched, most
 * recently touched first. Opening a file lists the messages that changed it;
 * clicking one opens that message in place on the graph, the same drill-down a
 * dot click gives.
 */

export interface FilesTarget {
  sessionId: string;
  messageId: string;
}

export interface FilesFocus {
  /** The file whose history the card asked for. */
  path: string;
  /** Counts the asks, so the same file opens again after the user folded it. */
  key: number;
}

/**
 * The reason behind one hit, as `cogit why` prints it: the message's own why,
 * or the first option it rejected when there is no why yet.
 */
function reasonOf(
  sessions: readonly ViewSession[] | undefined,
  hit: { sessionId: string; messageId: string },
): string | undefined {
  const node = sessions
    ?.find((session) => session.sessionId === hit.sessionId)
    ?.messages.find((message) => message.id === hit.messageId);
  if (node?.why !== undefined && node.why !== "") return node.why;
  const rejected = node?.alternatives?.[0];
  return rejected === undefined ? undefined : `not: ${rejected.option}`;
}

export function FilesView({
  files,
  sessions,
  active,
  focus = null,
  onSelect,
  onClose,
}: {
  files: readonly ViewFile[] | undefined;
  /** The project's sessions, for each hit's reason. */
  sessions?: readonly ViewSession[] | undefined;
  /** The message the map has selected, if any. */
  active: FilesTarget | null;
  /** A file a message's card opened, shown with its history. */
  focus?: FilesFocus | null;
  onSelect: (target: FilesTarget) => void;
  onClose: () => void;
}) {
  const all = files ?? [];
  const [openPath, setOpenPath] = useState<string | null>(focus?.path ?? null);

  // The card asks for a file's history (its messages, the way `cogit why`
  // answers for a path): open that file and bring its row into view.
  useEffect(() => {
    if (focus === null) return;
    setOpenPath(focus.path);
    const row = [...document.querySelectorAll<HTMLElement>("[data-file-path]")].find(
      (element) => element.dataset.filePath === focus.path,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [focus]);

  // A map click (or a search hit) may land on a message whose file is not open;
  // reveal the file that holds it so the row and its history are visible.
  const activePath =
    active === null
      ? null
      : (all.find((file) =>
          file.hits.some(
            (hit) => hit.sessionId === active.sessionId && hit.messageId === active.messageId,
          ),
        )?.path ?? null);
  useEffect(() => {
    if (activePath !== null) setOpenPath(activePath);
  }, [activePath]);

  return (
    <nav className="outline files-view" aria-label="File history">
      <header className="outline-head">
        <span className="outline-title">Files</span>
        <span className="outline-badge">{all.length}</span>
        <button type="button" className="drilldown-close" aria-label="Hide files" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="outline-scroll">
        {all.length === 0 ? (
          <p className="empty">
            No files recorded yet. The agent lists the files each message touched.
          </p>
        ) : (
          <ul className="outline-list">
            {all.map((file) => {
              const open = openPath === file.path;
              return (
                <li key={file.path} data-file-path={file.path}>
                  <div className="outline-row">
                    <button
                      type="button"
                      className="outline-toggle"
                      aria-expanded={open}
                      aria-label={open ? "Collapse" : "Expand"}
                      onClick={() => setOpenPath(open ? null : file.path)}
                    >
                      {open ? "▾" : "▸"}
                    </button>
                    <button
                      type="button"
                      className={`outline-item file-row${activePath === file.path ? " is-active" : ""}`}
                      title={file.path}
                      onClick={() => setOpenPath(open ? null : file.path)}
                    >
                      <span className="label file-path">{file.path}</span>
                      <span className="outline-count">{file.count}</span>
                    </button>
                  </div>
                  {open ? (
                    <ul className="file-hits">
                      {file.hits.map((hit) => {
                        const selected =
                          active?.sessionId === hit.sessionId && active.messageId === hit.messageId;
                        const reason = reasonOf(sessions, hit);
                        return (
                          <li key={`${hit.sessionId}:${hit.messageId}`}>
                            <button
                              type="button"
                              className={`file-hit${selected ? " is-active" : ""}`}
                              onClick={() =>
                                onSelect({ sessionId: hit.sessionId, messageId: hit.messageId })
                              }
                            >
                              <span className="file-hit-line">
                                <span className="file-hit-time">{formatStamp(hit.at ?? null)}</span>
                                <span className="file-hash">{shortHash(hit.messageId)}</span>
                                <span className="file-label">{hit.label}</span>
                                <span className="file-hit-title">{hit.title}</span>
                              </span>
                              <span className="file-hit-meta">
                                <span className="file-hit-session">{hit.sessionTitle}</span>
                                {hit.branch === undefined ? null : (
                                  <span className="file-hit-branch">╭ {hit.branch}</span>
                                )}
                                {hit.commits.length === 0 ? null : (
                                  <span className="file-hit-commit">
                                    {hit.commits.map((hash) => hash.slice(0, 7)).join(" ")}
                                  </span>
                                )}
                              </span>
                              {reason === undefined ? null : (
                                <span className="file-hit-reason" title={reason}>
                                  {reason}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </nav>
  );
}
