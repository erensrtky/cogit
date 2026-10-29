import { ReactFlowProvider } from "@xyflow/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ViewNode } from "../../cli/src/view/model.js";
import { COLUMN_HEAD, ColumnHead, loadColumns, saveColumns } from "../src/ColumnHead.js";
import { columnVars, GitGraph } from "../src/GitGraph.js";
import {
  COLUMN_MAX,
  COLUMN_MIN,
  clampColumns,
  columnRowHeight,
  columnsWidth,
  DEFAULT_COLUMNS,
  ID_COLUMN,
  layoutGitGraph,
  ROW_HEIGHT,
} from "../src/gitLayout.js";

const T0 = "2026-10-26T10:00:00.000Z";
const node = (id: string, parent: string | null, extra: Partial<ViewNode> = {}): ViewNode => ({
  id,
  kind: "message",
  title: `Message ${id}`,
  at: T0,
  parent,
  ...extra,
});
const none = {
  tags: 0,
  change: false,
  continues: null,
  returns: 0,
  head: false,
  unsummarized: false,
};

describe("resizable message columns", () => {
  it("clamps each column and falls back to the default for junk", () => {
    expect(clampColumns({ time: 1, title: 99_999, details: 120.6 })).toEqual({
      time: COLUMN_MIN.time,
      title: COLUMN_MAX,
      details: 121,
    });
    expect(clampColumns({ time: "wide", title: Number.NaN })).toEqual(DEFAULT_COLUMNS);
    expect(clampColumns(null)).toEqual(DEFAULT_COLUMNS);
  });

  it("adds the columns, the number column, the gaps and the padding up to the row width", () => {
    const columns = { time: 70, title: 300, details: 100 };
    expect(columnsWidth(columns)).toBe(16 + 70 + ID_COLUMN + 300 + 100 + 3 * 8);
    const git = layoutGitGraph([node("a", null)], { columns });
    expect(git.columns).toEqual(columns);
    expect(git.rowWidth).toBe(columnsWidth(columns));
    expect(layoutGitGraph([node("a", null)]).columns).toBeUndefined();
  });

  it("wraps the title in its own column: a wider column needs fewer lines", () => {
    const title = "a".repeat(120);
    const narrow = columnRowHeight(title, none, { ...DEFAULT_COLUMNS, title: 200 });
    const wide = columnRowHeight(title, none, { ...DEFAULT_COLUMNS, title: 800 });
    expect(narrow).toBeGreaterThan(wide);
    expect(wide).toBe(ROW_HEIGHT);
  });

  it("wraps the details in theirs: chips past the column's width start a new line", () => {
    const busy = {
      tags: 3,
      change: true,
      continues: "An earlier session",
      returns: 1,
      head: true,
      unsummarized: true,
    };
    const short = "Short";
    const narrow = columnRowHeight(short, busy, { ...DEFAULT_COLUMNS, details: 80 });
    const wide = columnRowHeight(short, busy, { ...DEFAULT_COLUMNS, details: 1200 });
    expect(narrow).toBeGreaterThan(wide);
    expect(columnRowHeight(short, none, DEFAULT_COLUMNS)).toBe(ROW_HEIGHT);
  });

  it("lays rows out with the column heights and draws them as a grid", () => {
    const git = layoutGitGraph(
      [node("a", null, { title: "b".repeat(200) }), node("b", "a", { unsummarized: true })],
      { columns: DEFAULT_COLUMNS },
    );
    expect(git.rows[0]?.height).toBeGreaterThan(ROW_HEIGHT);
    const html = renderToStaticMarkup(
      createElement(GitGraph, {
        git,
        selectedId: null,
        activeSegmentId: null,
        highlightIds: undefined,
        activeHitId: null,
        readIds: new Set<string>(),
        bigChangeLines: 300,
        onSelect: () => {},
        onUnfold: () => {},
        onContinue: () => {},
      }),
    );
    expect(html).toContain('class="git-graph in-columns"');
    expect(html).toContain("--col-title:260px");
    expect(html).toMatch(/<span class="git-details">.*not summarized yet/);
    expect(columnVars(undefined)).toEqual({});
  });

  it("heads the columns with a resize handle on time, message and details", () => {
    const git = layoutGitGraph([node("a", null)], { columns: DEFAULT_COLUMNS });
    const html = renderToStaticMarkup(
      createElement(
        ReactFlowProvider,
        null,
        createElement(ColumnHead, { git, onResize: () => {} }),
      ),
    );
    expect(html).toContain("Time");
    expect(html).toContain("Commits · changes");
    expect(html.match(/role="separator"/g)).toHaveLength(3);
    expect(COLUMN_HEAD).toBe(22);
    const plain = layoutGitGraph([node("a", null)]);
    expect(
      renderToStaticMarkup(
        createElement(
          ReactFlowProvider,
          null,
          createElement(ColumnHead, { git: plain, onResize: () => {} }),
        ),
      ),
    ).toBe("");
  });
});

describe("column widths in the browser", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the widths and reads junk or a blocked storage as the default", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
    expect(loadColumns()).toEqual(DEFAULT_COLUMNS);
    saveColumns({ time: 60, title: 400, details: 90 });
    expect(loadColumns()).toEqual({ time: 60, title: 400, details: 90 });
    store.set("cogit.mapColumns", "{not json");
    expect(loadColumns()).toEqual(DEFAULT_COLUMNS);

    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(loadColumns()).toEqual(DEFAULT_COLUMNS);
    expect(() => saveColumns(DEFAULT_COLUMNS)).not.toThrow();
  });
});
