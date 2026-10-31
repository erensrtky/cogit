import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ViewCapture, ViewSession } from "../../cli/src/view/model.js";
import {
  CapturesView,
  captureCounts,
  captureSource,
  capturesButtonVisible,
} from "../src/CapturesView.js";

const T0 = "2026-10-26T10:00:00.000Z";

const sessions = [
  {
    sessionId: "s1",
    title: "Parser work",
    messages: [
      { id: "m3", label: "m3", title: "Build it" },
      { id: "h4", label: "m4", title: "Then this" },
    ],
  },
] as unknown as ViewSession[];

const item = (
  over: Partial<ViewCapture> & { id: string; state: ViewCapture["state"] },
): ViewCapture => ({
  text: "some work",
  source: { sessionId: "s1" },
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

function render(captures: ViewCapture[] | undefined, sessionsFor = sessions): string {
  return renderToStaticMarkup(
    createElement(CapturesView, {
      captures,
      sessions: sessionsFor,
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

  it("shows a session with no messages as a source with nothing to open", () => {
    const html = render([item({ id: "c00000001", state: "suggested" })], [
      { sessionId: "s1", title: "Empty", messages: [] },
    ] as unknown as ViewSession[]);
    expect(html).toContain("Empty");
    expect(html).toContain("disabled");
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

describe("an item's session anchor (Story 15.2)", () => {
  const session = (id: string, messages: { id: string; label?: string }[]): ViewSession =>
    ({
      sessionId: id,
      title: "",
      messages,
    }) as unknown as ViewSession;

  it("anchors on the session's first message in send order", () => {
    expect(
      captureSource({ sessionId: "s1" }, [session("s1", [{ id: "a1" }, { id: "a2" }])]),
    ).toEqual({
      sessionTitle: "s1",
      label: "a1",
      target: { sessionId: "s1", messageId: "a1" },
    });
  });

  it("anchors a session on its own first message even when it continues another", () => {
    const continuing = {
      sessionId: "s2",
      title: "",
      messages: [
        { id: "b1", continues: { sessionId: "s1", id: "a1", sessionTitle: "One" } },
        { id: "b2" },
      ],
    } as unknown as ViewSession;
    expect(captureSource({ sessionId: "s2" }, [session("s1", [{ id: "a1" }]), continuing])).toEqual(
      {
        sessionTitle: "s2",
        label: "b1",
        target: { sessionId: "s2", messageId: "b1" },
      },
    );
  });

  it("anchors nowhere for a session with no messages or no record", () => {
    expect(captureSource({ sessionId: "s1" }, [session("s1", [])])).toEqual({
      sessionTitle: "s1",
    });
    expect(captureSource({ sessionId: "gone" }, [session("s1", [{ id: "a1" }])])).toEqual({
      sessionTitle: "gone",
    });
  });
});

describe("the session row's capture count", () => {
  it("counts suggested and open items per session, and nothing when only done ones exist", () => {
    const counts = captureCounts([
      item({ id: "c00000001", state: "suggested" }),
      item({ id: "c00000002", state: "open" }),
      item({ id: "c00000003", state: "done" }),
      item({ id: "c00000004", state: "dismissed" }),
      item({ id: "c00000005", state: "open", source: { sessionId: "s2" } }),
    ]);
    expect(counts.get("s1")).toBe(2);
    expect(counts.get("s2")).toBe(1);
    expect(captureCounts([item({ id: "c00000009", state: "done" })]).size).toBe(0);
    expect(captureCounts(undefined).size).toBe(0);
  });
});
