import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ViewFile, ViewSession } from "../../cli/src/view/model.js";
import { FilesView } from "../src/FilesView.js";

const T0 = "2026-10-24T09:41:00.000Z";

const file: ViewFile = {
  path: "packages/template/src/fixture.ts",
  count: 2,
  lastAt: T0,
  hits: [
    {
      sessionId: "s1",
      sessionTitle: "Template package and single-file output",
      messageId: "m4",
      label: "m4",
      at: T0,
      title: "Build the dev fixture",
      branch: "Template scaffold",
      commits: ["1a2b3c4"],
    },
    {
      sessionId: "s1",
      sessionTitle: "Template package and single-file output",
      messageId: "m5",
      label: "m5",
      at: T0,
      title: "Check the page in the browser",
      commits: [],
    },
  ],
};

const sessions = [
  {
    sessionId: "s1",
    title: "Template package",
    messages: [
      { id: "m4", label: "m4", title: "Build the dev fixture", why: "The map needs data." },
      {
        id: "m5",
        label: "m5",
        title: "Check the page in the browser",
        alternatives: [{ option: "trust the build", why: "layout breaks" }],
      },
    ],
  },
] as unknown as ViewSession[];

function render(over: { focus?: { path: string; key: number } | null } = {}): string {
  return renderToStaticMarkup(
    createElement(FilesView, {
      files: [file],
      sessions,
      active: null,
      focus: over.focus ?? null,
      onSelect: () => {},
      onClose: () => {},
    }),
  );
}

describe("FilesView", () => {
  it("keeps a file folded until the card asks for its history", () => {
    const closed = render();
    expect(closed).toContain("fixture.ts");
    expect(closed).not.toContain("Build the dev fixture");
  });

  it("opens the file a message's card asked about, with its messages", () => {
    const open = render({ focus: { path: file.path, key: 1 } });
    expect(open).toContain("Build the dev fixture");
    expect(open).toContain("Check the page in the browser");
  });

  it("prints each message's reason the way cogit why does", () => {
    const open = render({ focus: { path: file.path, key: 1 } });
    expect(open).toContain("The map needs data.");
    // No why yet: the first rejected option stands in for it.
    expect(open).toContain("not: trust the build");
  });
});
