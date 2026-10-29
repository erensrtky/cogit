import { readFileSync } from "node:fs";
import { ReactFlowProvider } from "@xyflow/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampRowWidth,
  layoutGitGraph,
  ROW_WIDTH,
  ROW_WIDTH_MAX,
  ROW_WIDTH_MIN,
} from "../src/gitLayout.js";
import { loadRowWidth, RowEdge, saveRowWidth } from "../src/RowEdge.js";

const T0 = "2026-10-26T10:00:00.000Z";

describe("dragging the message rows wider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps a dragged width in range and reads junk as the default", () => {
    expect(clampRowWidth(10)).toBe(ROW_WIDTH_MIN);
    expect(clampRowWidth(99_999)).toBe(ROW_WIDTH_MAX);
    expect(clampRowWidth(700.4)).toBe(700);
    expect(clampRowWidth(Number.NaN)).toBe(ROW_WIDTH);
    expect(clampRowWidth("wide")).toBe(ROW_WIDTH);
  });

  it("puts a full-height grab strip on the rows' right edge", () => {
    const git = layoutGitGraph(
      [{ id: "a", kind: "message", title: "A message", at: T0, parent: null }],
      { rowWidth: 700 },
    );
    const html = renderToStaticMarkup(
      createElement(ReactFlowProvider, null, createElement(RowEdge, { git, onResize: () => {} })),
    );
    expect(html).toContain('role="separator"');
    // At zoom 1 the strip is 12px wide, centred on the edge.
    expect(html).toContain(`left:${git.width - 6}px`);
    expect(html).toContain(`height:${git.height}px`);
  });

  it("takes the pointer although React Flow turns it off inside map nodes", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.row-edge,[^{]*\{\s*pointer-events:\s*all/);
  });

  it("remembers the width, and reads a blocked or empty storage as the default", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
    expect(loadRowWidth()).toBe(ROW_WIDTH);
    saveRowWidth(840);
    expect(loadRowWidth()).toBe(840);

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
    expect(loadRowWidth()).toBe(ROW_WIDTH);
    expect(() => saveRowWidth(600)).not.toThrow();
  });
});
