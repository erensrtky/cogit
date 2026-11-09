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
      focus: "src/thought.ts",
      active: null,
      onFocus: () => {},
      onSelect: () => {},
      ...props,
    }),
  );

describe("the Graph view", () => {
  it("opens on the sessions, titled, with the files hidden", () => {
    const html = render();
    expect(html).toContain('<input type="checkbox"/>Show files');
    expect(html).not.toContain("fg-node fg-file");
    expect(html).not.toContain("fg-node fg-message");
    expect(html).toContain("fg-node fg-session is-direct");
    expect(html).toContain('class="fg-label fg-label-session"');
    expect(html).toContain(">Session one</text>");
    expect(html).toContain("1 linked file · 1 session · 2 messages");
    expect(html).toContain("touched thought.ts");
  });

  it("shows an opened session as a hub with its branches, and an opened branch's messages", () => {
    const html = render({ peeledAtStart: { sessions: ["s1"], branches: ["s1|"] } });
    expect(html).toContain("fg-node fg-session is-direct is-open");
    expect(html).toContain("fg-node fg-branch is-direct is-open");
    expect(html.match(/class="fg-node fg-message/g)).toHaveLength(2);
    expect(html).toContain("fg-edge fg-part");
  });

  it("draws the focus file, its linked files and their messages with Files on", () => {
    const html = render({ filesAtStart: true });
    expect(html).toContain('<input type="checkbox" checked=""/>Show files');
    expect(html).toContain('aria-label="Graph of src/thought.ts"');
    expect(html).toContain("1 linked file · 1 session · 2 messages");
    expect(html.match(/class="fg-node fg-file/g)).toHaveLength(2);
    expect(html.match(/class="fg-node fg-session/g)).toHaveLength(1);
    expect(html).toContain("fg-edge fg-import is-core");
    expect(html).toContain(">git.ts</text>");
  });

  it("lights the open message and the files it touched, fading the rest", () => {
    const html = render({
      active: { sessionId: "s1", messageId: "m1" },
      filesAtStart: true,
      peeledAtStart: { sessions: ["s1"], branches: ["s1|"] },
    });
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

  it("titles each message under its dot", () => {
    const html = render({ peeledAtStart: { sessions: ["s1"], branches: ["s1|"] } });
    expect(html).toContain('class="fg-label"');
    expect(html).toContain(">Message m1</text>");
    // With the files drawn, a message is titled only when lit.
    expect(
      render({ filesAtStart: true, peeledAtStart: { sessions: ["s1"], branches: ["s1|"] } }),
    ).not.toContain('class="fg-label"');
  });

  it("rings the thoughts that landed a commit", () => {
    const withCommit: ViewFile[] = [
      { path: "src/thought.ts", count: 1, hits: [{ ...hit("m1"), commits: ["abc1234"] }] },
    ];
    const html = render({ files: withCommit, links: undefined });
    // The folded session holds a message that landed one: it is ringed too.
    expect(html).toContain('class="fg-ring"');
    expect(html).toContain("commits: abc1234");
    expect(html).toContain('<input type="checkbox"/>Show commits');
    expect(render()).not.toContain('class="fg-ring"');
  });

  it("opens on the whole project when no file is in focus", () => {
    const html = render({ focus: null });
    expect(html).toContain("Whole project");
    expect(html).toContain("2 code files · 1 session · 2 messages");
    expect(html).toContain('aria-label="Graph of the whole project"');
    expect(html).not.toContain("is-direct");
  });

  it("shows where you are inside the onion, and how to step back", () => {
    const top = render();
    expect(top).toContain('<button type="button" aria-current="true">All sessions</button>');
    expect(top).not.toContain("Esc to step back");
    const inBranch = render({ insideAtStart: { session: "s1", branch: "s1|" } });
    expect(inBranch).toContain(">Session one</button>");
    expect(inBranch).toContain('aria-current="true">Before any branch</button>');
    expect(inBranch).toContain("Esc to step back");
    // Inside a layer there is nothing to open in place, so the option goes.
    expect(top).toContain("Open in place");
    expect(inBranch).not.toContain("Open in place");
    expect(render({ insideAtStart: { session: "s1" } })).not.toContain("Open in place");
    expect(inBranch.match(/class="fg-node fg-message/g)).toHaveLength(2);
    // Opened in place there is no trail.
    expect(render({ peeledAtStart: { sessions: ["s1"] } })).not.toContain("file-graph-trail");
  });

  it("says when there is no code graph, and when nothing was recorded", () => {
    expect(render({ links: undefined, focus: "src/git.ts" })).toContain(
      "1 message; no code graph, so no linked files",
    );
    expect(render({ files: undefined })).toContain("No recorded message touched a file yet.");
  });
});
