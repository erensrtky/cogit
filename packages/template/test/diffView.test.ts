import { describe, expect, it } from "vitest";
import { parsePatch, sideBySide } from "../src/diffView.js";

/**
 * Story 10.5: the message details show git's own patch. The parse and the
 * side-by-side pairing are pure, so their line numbers and pairing are pinned
 * here rather than only being looked at in a browser.
 */

const PATCH = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 1111111..2222222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,4 +1,5 @@ function",
  " one",
  "-two",
  "+TWO",
  "+TWO-extra",
  " three",
  "@@ -10,2 +11,2 @@",
  " ten",
  "-eleven",
  "+ELEVEN",
].join("\n");

describe("parsePatch", () => {
  it("splits files and hunks and numbers both sides", () => {
    const files = parsePatch(PATCH);
    expect(files).toHaveLength(1);
    const [file] = files;
    expect(file?.path).toBe("src/a.ts");
    expect(file?.binary).toBe(false);
    expect(file?.meta).toEqual(["index 1111111..2222222 100644", "--- a/src/a.ts"]);
    expect(file?.hunks).toHaveLength(2);

    expect(file?.hunks[0]?.lines).toEqual([
      { kind: "context", text: "one", oldNo: 1, newNo: 1 },
      { kind: "remove", text: "two", oldNo: 2, newNo: null },
      { kind: "add", text: "TWO", oldNo: null, newNo: 2 },
      { kind: "add", text: "TWO-extra", oldNo: null, newNo: 3 },
      { kind: "context", text: "three", oldNo: 3, newNo: 4 },
    ]);
    expect(file?.hunks[1]?.lines.at(-1)).toEqual({
      kind: "add",
      text: "ELEVEN",
      oldNo: null,
      newNo: 12,
    });
  });

  it("keeps the no-newline marker as a note", () => {
    const files = parsePatch(
      [
        "diff --git a/x b/x",
        "--- a/x",
        "+++ b/x",
        "@@ -1 +1 @@",
        "-a",
        "\\ No newline at end of file",
        "+b",
      ].join("\n"),
    );
    expect(files[0]?.hunks[0]?.lines[1]).toEqual({
      kind: "note",
      text: "\\ No newline at end of file",
      oldNo: null,
      newNo: null,
    });
  });

  it("marks binary files and starts a new file at each diff header", () => {
    const files = parsePatch(
      [
        "diff --git a/img.png b/img.png",
        "index 1111111..2222222 100644",
        "Binary files a/img.png and b/img.png differ",
        "diff --git a/src/b.ts b/src/b.ts",
        "+++ b/src/b.ts",
        "@@ -1 +1 @@",
        "-old",
        "+new",
      ].join("\n"),
    );
    expect(files.map((file) => file.path)).toEqual(["img.png", "src/b.ts"]);
    expect(files[0]?.binary).toBe(true);
    expect(files[0]?.hunks).toEqual([]);
    expect(files[1]?.hunks[0]?.lines).toHaveLength(2);
  });

  it("keeps the old path when the new side is /dev/null and skips prose", () => {
    const files = parsePatch(
      [
        "diff --git a/gone.txt b/gone.txt",
        "deleted file mode 100644",
        "--- a/gone.txt",
        "+++ /dev/null",
        "@@ -1 +0,0 @@",
        "-bye",
      ].join("\n"),
    );
    expect(files[0]?.path).toBe("gone.txt");
    expect(files[0]?.meta).toEqual(["deleted file mode 100644", "--- a/gone.txt"]);
  });

  it("falls back to the raw header when a path is not the usual form", () => {
    const files = parsePatch("diff --git weird\n");
    expect(files[0]?.path).toBe("weird");
  });

  it("ignores text outside any diff", () => {
    expect(
      parsePatch("diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\ntrailing"),
    ).toHaveLength(1);
    expect(parsePatch("not a patch")).toEqual([]);
  });
});

describe("sideBySide", () => {
  it("pairs a removal block with the additions that replace it", () => {
    const lines = parsePatch(PATCH)[0]?.hunks[0]?.lines ?? [];
    const rows = sideBySide(lines);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({
      left: { kind: "context", no: 1, text: "one" },
      right: { kind: "context", no: 1, text: "one" },
    });
    expect(rows[1]).toEqual({
      left: { kind: "remove", no: 2, text: "two" },
      right: { kind: "add", no: 2, text: "TWO" },
    });
    // The second addition has no removed line to sit opposite.
    expect(rows[2]).toEqual({
      left: null,
      right: { kind: "add", no: 3, text: "TWO-extra" },
    });
    expect(rows[3]?.left).toEqual({ kind: "context", no: 3, text: "three" });
  });

  it("keeps more removals than additions on one side", () => {
    const rows = sideBySide([
      { kind: "remove", text: "a", oldNo: 1, newNo: null },
      { kind: "remove", text: "b", oldNo: 2, newNo: null },
      { kind: "add", text: "c", oldNo: null, newNo: 1 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.left?.text).toBe("a");
    expect(rows[0]?.right?.text).toBe("c");
    expect(rows[1]?.left?.text).toBe("b");
    expect(rows[1]?.right).toBeNull();
  });

  it("spans a note across both sides", () => {
    const rows = sideBySide([
      { kind: "note", text: "\\ No newline at end of file", oldNo: null, newNo: null },
    ]);
    expect(rows).toEqual([{ left: null, right: null, note: "\\ No newline at end of file" }]);
  });
});
