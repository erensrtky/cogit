import { readFileSync } from "node:fs";
import { ReactFlowProvider } from "@xyflow/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampMapWidth,
  MAP_WIDTH,
  MAP_WIDTH_MAX,
  MAP_WIDTH_MIN,
  messageRowWidth,
  TITLE_MIN_WIDTH,
} from "../src/gitLayout.js";
import { loadMapWidth, RowEdge, saveMapWidth } from "../src/RowEdge.js";

describe("dragging the map's right edge", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps a dragged width in range and reads junk as the default", () => {
    expect(clampMapWidth(10)).toBe(MAP_WIDTH_MIN);
    expect(clampMapWidth(99_999)).toBe(MAP_WIDTH_MAX);
    expect(clampMapWidth(700.4)).toBe(700);
    expect(clampMapWidth(Number.NaN)).toBe(MAP_WIDTH);
    expect(clampMapWidth("wide")).toBe(MAP_WIDTH);
  });

  it("ends an open session's messages where the session rows end", () => {
    // 900 wide, 60 of it lanes, 8 gap: the text gets the rest.
    expect(messageRowWidth(900, 60)).toBe(832);
    // Lanes wider than the map still leave a readable title.
    expect(messageRowWidth(600, 500)).toBe(TITLE_MIN_WIDTH * 2);
  });

  it("puts a full-height grab strip on the map's right edge", () => {
    const html = renderToStaticMarkup(
      createElement(
        ReactFlowProvider,
        null,
        createElement(RowEdge, { left: 800, height: 1200, width: 720, onResize: () => {} }),
      ),
    );
    expect(html).toContain('role="separator"');
    // At zoom 1 the strip is 12px wide, centred on the edge.
    expect(html).toContain("left:794px");
    expect(html).toContain("height:1200px");
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
    expect(loadMapWidth()).toBe(MAP_WIDTH);
    saveMapWidth(840);
    expect(loadMapWidth()).toBe(840);

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
    expect(loadMapWidth()).toBe(MAP_WIDTH);
    expect(() => saveMapWidth(600)).not.toThrow();
  });
});
