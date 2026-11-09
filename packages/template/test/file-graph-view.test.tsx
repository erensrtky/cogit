import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ViewFile, ViewFileLink } from "../../cli/src/view/model.js";
import { FileGraphView } from "../src/FileGraphView.js";

const hit = (messageId: string) => ({
  sessionId: "s1",
  sessionTitle: "Session one",
  messageId,
  label: messageId,
  title: `Message ${messageId}`,
  commits: [],
});

const files: ViewFile[] = [
  { path: "src/thought.ts", count: 2, hits: [hit("m1"), hit("m2")] },
  { path: "src/git.ts", count: 1, hits: [hit("m2")] },
];
const links: ViewFileLink[] = [{ from: "src/thought.ts", to: "src/git.ts" }];

const render = (props: Partial<Parameters<typeof FileGraphView>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(FileGraphView, {
      files,
      links,
      focus: null,
      active: null,
      onFocus: () => {},
      onSelect: () => {},
      ...props,
    }),
  );

describe("the Graph view", () => {
  it("opens on the thoughts alone, linked by the files they share", () => {
    const html = render();
    expect(html).toContain('<input type="checkbox"/>Show files');
    expect(html).not.toContain("fg-node fg-file");
    expect(html.match(/class="fg-node fg-message/g)).toHaveLength(2);
    // m1 touched only the focus, which does not count: no shared-file link.
    expect(html).not.toContain("fg-share");
    expect(html).toContain("thought on thought.ts");
  });

  it("draws the focus file, its linked files and their messages with Files on", () => {
    const html = render({ filesAtStart: true });
    expect(html).toContain('<input type="checkbox" checked=""/>Show files');
    expect(html).toContain('aria-label="Graph of src/thought.ts"');
    expect(html).toContain("1 linked file · 2 messages");
    expect(html.match(/class="fg-node fg-file/g)).toHaveLength(2);
    expect(html.match(/class="fg-node fg-message/g)).toHaveLength(2);
    expect(html).toContain("fg-edge fg-import is-core");
    expect(html).toContain(">git.ts</text>");
  });

  it("lights the open message and the files it touched, fading the rest", () => {
    const html = render({ active: { sessionId: "s1", messageId: "m1" }, filesAtStart: true });
    expect(html).toContain("fg-node fg-message is-direct is-on");
    expect(html).toContain("fg-node fg-file is-focus is-on");
    expect(html).toContain("fg-node fg-file is-faded");
    expect(html).toContain("is-on");
  });

  it("draws only the files the code graph has as code", () => {
    const html = render({ codeFiles: ["src/thought.ts"], filesAtStart: true });
    expect(html).toContain(">thought.ts</text>");
    expect(html).not.toContain(">git.ts</text>");
  });

  it("titles each thought under its dot, and switches between the two pictures", () => {
    const html = render();
    expect(html).toContain('class="fg-label"');
    expect(html).toContain(">Message m1</text>");
    // With the files drawn, a thought is titled only when lit.
    expect(render({ filesAtStart: true })).not.toContain('class="fg-label"');
  });

  it("says when there is no code graph, and when nothing was recorded", () => {
    expect(render({ links: undefined, focus: "src/git.ts" })).toContain(
      "1 message; no code graph, so no linked files",
    );
    expect(render({ files: undefined })).toContain("No recorded message touched a file yet.");
  });
});
