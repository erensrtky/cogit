import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ViewCapture } from "../../cli/src/view/model.js";
import { CapturesView } from "../src/CapturesView.js";

const T0 = "2026-10-26T10:00:00.000Z";

const rows: ViewCapture[] = [
  {
    key: "s1#p0",
    text: "decide the error format",
    source: "pending",
    sessionId: "s1",
    sessionTitle: "Parser work",
    messageId: "h3",
    label: "m3",
    author: "Ada",
    updatedAt: T0,
    needsUser: true,
  },
  {
    key: "s1#h1",
    text: "unicode input untested",
    source: "branch",
    sessionId: "s1",
    sessionTitle: "Parser work",
    messageId: "h1",
    label: "m1",
    branch: "Parser",
    updatedAt: T0,
    needsUser: false,
  },
];

function render(captures: ViewCapture[] | undefined): string {
  return renderToStaticMarkup(
    createElement(CapturesView, { captures, active: null, onSelect: () => {}, onClose: () => {} }),
  );
}

describe("CapturesView", () => {
  it("lists each row with its source and the muted not-a-plan note", () => {
    const html = render(rows);
    expect(html).toContain("Captured work — what the sessions left open");
    expect(html).toContain('class="capture-note"');
    expect(html).toContain("Not a plan");
    expect(html).toContain("decide the error format");
    expect(html).toContain("unicode input untested");
    expect(html).toContain("Parser work");
    expect(html).toContain("m3");
    expect(html).toContain("╭ Parser");
    expect(html).toContain("your call");
    // Read-only: nothing to tick.
    expect(html).not.toContain('type="checkbox"');
  });

  it("shows a plain empty state", () => {
    expect(render(undefined)).toContain("No captured work in this project.");
    expect(render([])).toContain("No captured work in this project.");
  });
});
