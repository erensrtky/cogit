import { useEffect, useState } from "react";
import { loadDiff, pageToken } from "./data.js";
import { type DiffFile, type DiffHunk, parsePatch, sideBySide } from "./diffView.js";

/** The viewer's choice of diff layout; kept locally, never sent anywhere. */
const MODE_KEY = "cogit.diffSideBySide";

function readSideBySide(): boolean {
  try {
    return window.localStorage.getItem(MODE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveSideBySide(on: boolean): void {
  try {
    window.localStorage.setItem(MODE_KEY, on ? "1" : "0");
  } catch {
    // A browser that refuses storage still switches the view for this panel.
  }
}

function DiffRows({ hunk, side }: { hunk: DiffHunk; side: boolean }) {
  if (!side) {
    return (
      <>
        <div className="diff-hunk">{hunk.header}</div>
        {hunk.lines.map((line, index) => (
          <div
            // Diff lines have no identity beyond their place in the hunk.
            key={`${hunk.header}-${index}`}
            className={`diff-row diff-${line.kind}`}
          >
            <span className="diff-no">{line.oldNo ?? ""}</span>
            <span className="diff-no">{line.newNo ?? ""}</span>
            <span className="diff-mark">
              {line.kind === "add" ? "+" : line.kind === "remove" ? "−" : ""}
            </span>
            <span className="diff-text">{line.text}</span>
          </div>
        ))}
      </>
    );
  }
  return (
    <>
      <div className="diff-hunk diff-hunk-side">
        <span>{hunk.header}</span>
      </div>
      {sideBySide(hunk.lines).map((row, index) => (
        <div key={`${hunk.header}-side-${index}`} className="diff-row diff-side-row">
          {row.note !== undefined ? (
            <span className="diff-note-line">{row.note}</span>
          ) : (
            <>
              <span
                className={`diff-no diff-side-no${row.left?.kind === "remove" ? " is-old" : ""}`}
              >
                {row.left?.no ?? ""}
              </span>
              <span className={`diff-cell${row.left ? ` diff-${row.left.kind}` : " is-empty"}`}>
                {row.left?.text ?? ""}
              </span>
              <span className={`diff-no diff-side-no${row.right?.kind === "add" ? " is-new" : ""}`}>
                {row.right?.no ?? ""}
              </span>
              <span className={`diff-cell${row.right ? ` diff-${row.right.kind}` : " is-empty"}`}>
                {row.right?.text ?? ""}
              </span>
            </>
          )}
        </div>
      ))}
    </>
  );
}

function Patch({ file, side }: { file: DiffFile; side: boolean }) {
  return (
    <div className="diff-patch">
      <div className="diff-file">{file.path}</div>
      {file.meta.map((line, index) => (
        <div key={`${line}-${index}`} className="diff-meta">
          {line}
        </div>
      ))}
      {file.binary ? <p className="diff-note-line">binary file changed</p> : null}
      {file.hunks.map((hunk) => (
        <DiffRows key={hunk.header} hunk={hunk} side={side} />
      ))}
    </div>
  );
}

/**
 * One commit's (or one file's) diff, fetched when a row is opened (Story 10.5).
 * The server caps the size and replaces binary markers with one line, so this
 * only has to decide between a rendered patch and a plain notice.
 */
export function DiffView({
  dir,
  commit,
  file,
}: {
  dir: string;
  commit: string;
  file?: string | undefined;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [side, setSide] = useState(readSideBySide);

  useEffect(() => {
    let mounted = true;
    setText(null);
    setError(null);
    const token = pageToken();
    if (token === null) {
      setError("Diffs need the local server: open the map with `cogit open`.");
      return () => {
        mounted = false;
      };
    }
    loadDiff(dir, commit, file, token).then(
      (diff) => {
        if (mounted) setText(diff);
      },
      (err: unknown) => {
        if (mounted) setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      mounted = false;
    };
  }, [dir, commit, file]);

  function changeMode(next: boolean): void {
    setSide(next);
    saveSideBySide(next);
  }

  if (error !== null) return <p className="error diff-loading">{error}</p>;
  if (text === null) return <p className="muted diff-loading">Loading diff…</p>;

  const files = parsePatch(text);
  if (files.length === 0)
    return <p className="diff-loading">{text === "" ? "No changes in this commit." : text}</p>;

  return (
    <div className="diff-view">
      <div className="diff-toolbar">
        <label>
          <input type="checkbox" checked={side} onChange={(e) => changeMode(e.target.checked)} />{" "}
          Side by side
        </label>
      </div>
      {files.map((file) => (
        <Patch key={file.path} file={file} side={side} />
      ))}
    </div>
  );
}
