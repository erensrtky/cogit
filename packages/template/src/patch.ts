/**
 * Reading `git show`'s patch for the map's message details (Story 10.5). Pure:
 * the raw patch comes from the local server, and the same parse feeds both the
 * unified view and the side-by-side pairing.
 */

export type DiffLineKind = "context" | "add" | "remove" | "note";

export interface DiffLine {
  kind: DiffLineKind;
  /** The line without git's prefix (`+`, `-`, ` `). */
  text: string;
  /** Line number on the old side; null for an added line. */
  oldNo: number | null;
  /** Line number on the new side; null for a removed line. */
  newNo: number | null;
}

export interface DiffHunk {
  /** The `@@ -a,b +c,d @@` line, shown as git printed it. */
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  /** Repository- or project-relative path, whichever the build holds. */
  path: string;
  /** `index …`, mode lines and the binary notice, shown above the hunks. */
  meta: string[];
  hunks: DiffHunk[];
  binary: boolean;
}

/** A `diff --git` line starts one file; `@@` starts one hunk. */
export function parsePatch(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;

  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith("diff --git ")) {
      const match = /^diff --git a\/(.+) b\/(.+)$/.exec(raw);
      file = {
        path: match?.[2] ?? raw.slice("diff --git ".length),
        meta: [],
        hunks: [],
        binary: false,
      };
      files.push(file);
      hunk = null;
      continue;
    }
    if (file === null) continue;

    if (raw.startsWith("Binary files ") && raw.endsWith(" differ")) {
      file.binary = true;
      continue;
    }

    if (raw.startsWith("@@")) {
      const match = /^@@+ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      oldNo = Number(match?.[1] ?? 0);
      newNo = Number(match?.[2] ?? 0);
      hunk = { header: raw, lines: [] };
      file.hunks.push(hunk);
      continue;
    }

    if (hunk !== null) {
      if (raw === "") continue;
      if (raw.startsWith("\\")) {
        hunk.lines.push({ kind: "note", text: raw, oldNo: null, newNo: null });
        continue;
      }
      const mark = raw[0];
      if (mark === "+") {
        hunk.lines.push({ kind: "add", text: raw.slice(1), oldNo: null, newNo });
        newNo += 1;
        continue;
      }
      if (mark === "-") {
        hunk.lines.push({ kind: "remove", text: raw.slice(1), oldNo, newNo: null });
        oldNo += 1;
        continue;
      }
      if (mark === " ") {
        hunk.lines.push({ kind: "context", text: raw.slice(1), oldNo, newNo });
        oldNo += 1;
        newNo += 1;
        continue;
      }
      hunk.lines.push({ kind: "note", text: raw, oldNo: null, newNo: null });
      continue;
    }

    if (raw.startsWith("+++ ")) {
      const path = raw.slice(4);
      if (path !== "/dev/null") file.path = path.replace(/^b\//, "");
      continue;
    }
    if (raw !== "") file.meta.push(raw);
  }

  return files;
}

export interface SideCell {
  kind: "context" | "add" | "remove";
  no: number | null;
  text: string;
}

/** One row of the side-by-side view; either side may be empty. */
export interface SideRow {
  left: SideCell | null;
  right: SideCell | null;
  /** A line with no side (`\ No newline at end of file`). */
  note?: string;
}

function cell(line: DiffLine, kind: SideCell["kind"], no: number | null): SideCell {
  return { kind, no, text: line.text };
}

/**
 * Pairs a hunk's lines into two columns. Context lines sit on both sides; a
 * block of removals and the additions that replace it pair by position, so a
 * three-line removal against a one-line addition leaves two empty right cells.
 */
export function sideBySide(lines: DiffLine[]): SideRow[] {
  const rows: SideRow[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] as DiffLine;
    if (line.kind === "note") {
      rows.push({ left: null, right: null, note: line.text });
      index += 1;
      continue;
    }
    if (line.kind === "context") {
      rows.push({
        left: cell(line, "context", line.oldNo),
        right: cell(line, "context", line.newNo),
      });
      index += 1;
      continue;
    }
    const removed: DiffLine[] = [];
    const added: DiffLine[] = [];
    while (index < lines.length && (lines[index] as DiffLine).kind === "remove") {
      removed.push(lines[index] as DiffLine);
      index += 1;
    }
    while (index < lines.length && (lines[index] as DiffLine).kind === "add") {
      added.push(lines[index] as DiffLine);
      index += 1;
    }
    const count = Math.max(removed.length, added.length);
    for (let i = 0; i < count; i += 1) {
      const left = removed[i];
      const right = added[i];
      rows.push({
        left: left === undefined ? null : cell(left, "remove", left.oldNo),
        right: right === undefined ? null : cell(right, "add", right.newNo),
      });
    }
  }
  return rows;
}
