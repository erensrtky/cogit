import { useEffect, useState } from "react";
import type { ViewFile } from "../../cli/src/view/model.js";
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

export function FilesView({
  files,
  active,
  onSelect,
  onClose,
}: {
  files: readonly ViewFile[] | undefined;
  /** The message the map has selected, if any. */
  active: FilesTarget | null;
  onSelect: (target: FilesTarget) => void;
  onClose: () => void;
}) {
  const all = files ?? [];
  const [openPath, setOpenPath] = useState<string | null>(null);

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
                <li key={file.path}>
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
