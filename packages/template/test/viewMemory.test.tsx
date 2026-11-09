import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import type { ViewFile } from "../../cli/src/view/model.js";
import { FileGraphView } from "../src/FileGraphView.js";
import { readViewMemory, rememberView } from "../src/viewMemory.js";

/** A stand-in for the browser's localStorage, or one that refuses every call. */
function useStorage(storage: Partial<Storage> | "blocked"): Map<string, string> {
  const items = new Map<string, string>();
  const fake =
    storage === "blocked"
      ? {
          getItem: () => {
            throw new Error("blocked");
          },
          setItem: () => {
            throw new Error("blocked");
          },
        }
      : {
          getItem: (key: string) => items.get(key) ?? null,
          setItem: (key: string, value: string) => void items.set(key, value),
          ...storage,
        };
  (globalThis as { window?: unknown }).window = { localStorage: fake };
  return items;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("the map's view memory", () => {
  it("remembers per project and merges what changes", () => {
    useStorage({});
    expect(readViewMemory("/a")).toEqual({});
    rememberView("/a", { layout: "graph", showFiles: true });
    rememberView("/a", { showFiles: false, graphFocus: "src/x.ts" });
    expect(readViewMemory("/a")).toEqual({
      layout: "graph",
      showFiles: false,
      graphFocus: "src/x.ts",
    });
    expect(readViewMemory("/b")).toEqual({});
  });

  it("forgets quietly when storage is missing, corrupt or blocked", () => {
    expect(readViewMemory("/a")).toEqual({});
    rememberView("/a", { layout: "graph" });
    const items = useStorage({});
    items.set("cogit.view:/a", "{not json");
    expect(readViewMemory("/a")).toEqual({});
    items.set("cogit.view:/a", "[1,2]");
    expect(readViewMemory("/a")).toEqual({});
    useStorage("blocked");
    expect(readViewMemory("/a")).toEqual({});
    expect(() => rememberView("/a", { layout: "git" })).not.toThrow();
  });

  it("brings the Graph view back to the layers and place it was left at", () => {
    useStorage({});
    rememberView("/p", {
      showFiles: true,
      showCommits: true,
      inside: { session: "s1" },
    });
    const files: ViewFile[] = [
      {
        path: "src/a.ts",
        count: 1,
        hits: [
          {
            sessionId: "s1",
            sessionTitle: "Session one",
            messageId: "m1",
            label: "m1",
            title: "Message m1",
            commits: [],
          },
        ],
      },
    ];
    const render = (memoryKey: string) =>
      renderToStaticMarkup(
        createElement(FileGraphView, {
          files,
          links: [],
          focus: null,
          active: null,
          onFocus: () => {},
          onSelect: () => {},
          memoryKey,
        }),
      );
    const html = render("/p");
    expect(html).toContain('<input type="checkbox" checked=""/>Show files');
    expect(html).toContain('<input type="checkbox" checked=""/>Show commits');
    expect(html).toContain(">Session one</button>");
    // Another project starts fresh.
    expect(render("/q")).not.toContain(">Session one</button>");
  });
});
