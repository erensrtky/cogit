import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ViewCapture, ViewSession } from "../../cli/src/view/model.js";
import { CapturesView, capturesButtonVisible } from "../src/CapturesView.js";

const T0 = "2026-10-26T10:00:00.000Z";

const sessions = [
  {
    sessionId: "s1",
    title: "Parser work",
    messages: [{ id: "m3", label: "m3", title: "Build it" }],
  },
] as unknown as ViewSession[];

const item = (
  over: Partial<ViewCapture> & { id: string; state: ViewCapture["state"] },
): ViewCapture => ({
  text: "some work",
  source: { sessionId: "s1", messageId: "m3" },
  createdAt: T0,
  updatedAt: T0,
  ...over,
});

const items: ViewCapture[] = [
  item({ id: "c00000001", state: "suggested", text: "decide the error format" }),
  item({ id: "c00000002", state: "open", text: "write the docs" }),
  item({ id: "c00000003", state: "done", text: "close the release" }),
  item({ id: "c00000004", state: "dismissed", text: "gone" }),
];

function render(captures: ViewCapture[] | undefined): string {
  return renderToStaticMarkup(
    createElement(CapturesView, {
      captures,
      sessions,
      dir: "/p",
      active: null,
      onSelect: () => {},
      onClose: () => {},
    }),
  );
}

describe("CapturesView", () => {
  it("shows the three sections with their buttons", () => {
    const html = render(items);
    expect(html).toContain("Captured work");
    expect(html).toContain("A list you curate, not a plan cogit keeps.");
    expect(html).toContain("To review");
    expect(html).toContain("Open");
    expect(html).toContain("Done (last 10)");
    expect(html).toContain("decide the error format");
    expect(html).toContain("write the docs");
    expect(html).toContain(">Accept<");
    expect(html).toContain(">Dismiss<");
    expect(html).toContain(">Done<");
    expect(html).toContain("Parser work");
    expect(html).toContain("m3");
    // A dismissed item is closed and stays out of the list.
    expect(html).not.toContain("gone");
  });

  it("is empty when nothing was drafted", () => {
    expect(render(undefined)).toContain("No captured work.");
    expect(render([item({ id: "c00000009", state: "dismissed" })])).toContain("No captured work.");
  });
});

describe("the Captured button", () => {
  it("shows only while the setting is on and something waits or is open", () => {
    expect(capturesButtonVisible(items, true)).toBe(true);
    expect(capturesButtonVisible(items, undefined)).toBe(true);
    expect(capturesButtonVisible(items, false)).toBe(false);
    expect(capturesButtonVisible([item({ id: "c00000009", state: "done" })], true)).toBe(false);
    expect(capturesButtonVisible([], true)).toBe(false);
    expect(capturesButtonVisible(undefined, true)).toBe(false);
  });
});
