import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ViewNode } from "../../cli/src/view/model.js";
import { bubblePlace } from "../src/HelpTip.js";
import { MermaidDiagram, mermaidAvailable } from "../src/MermaidDiagram.js";
import { ShapeLayers } from "../src/ShapeModal.js";

/** The three layers render as the panel shows them (Story 13.6). */
const node: ViewNode = {
  id: "h000000000001",
  kind: "message",
  title: "Queue the side run",
  why: "A commit must never wait for a model",
  alternatives: [{ option: "Block the commit", why: "too slow" }],
  commits: ["abc1234"],
  commitTags: [{ hash: "abc1234", subject: "feat: queue" }],
  shape: {
    tools: [{ kind: "pseudo", text: "1. Commit lands\n2. Queue a shape", valid: true }],
    commits: ["abc1234"],
    by: "side",
  },
};

function render(
  tab: "intent" | "shape" | "code",
  overrides: { shape?: ViewNode["shape"] | undefined } = {},
  enabled = true,
) {
  return renderToStaticMarkup(
    createElement(ShapeLayers, {
      node: { ...node, ...overrides },
      root: "/tmp/project",
      tab,
      enabled,
      onTab: () => {},
      renderMermaid: () => createElement("div", null, "diagram"),
    }),
  );
}

describe("Intent, Shape and Code", () => {
  it("shows the record's intent, read as written", () => {
    const html = render("intent");
    expect(html).toContain("Why");
    expect(html).toContain("A commit must never wait for a model");
    expect(html).toContain("Block the commit");
  });

  it("opens on Shape with the steps and who wrote them", () => {
    const html = render("shape");
    expect(html).toContain("1. Commit lands");
    expect(html).toContain("Written by the side model");
  });

  it("says the Shape is being prepared when there is none", () => {
    const html = render("shape", { shape: undefined });
    expect(html).toContain("being prepared");
  });

  it("says shapes are off when the setting is off", () => {
    const html = render("shape", {}, false);
    expect(html).toContain("Shapes are off");
  });

  it("says nothing is worth showing for an empty answer", () => {
    const html = render("shape", { shape: { tools: [], commits: ["abc1234"] } });
    expect(html).toContain("Nothing to show");
  });

  it("draws a valid diagram and falls back to source for an invalid one", () => {
    const valid = render("shape", {
      shape: {
        tools: [{ kind: "mermaid", text: "flowchart TD\nA --> B", valid: true }],
        commits: [],
      },
    });
    expect(valid).toContain("diagram");
    const invalid = render("shape", {
      shape: {
        tools: [{ kind: "mermaid", text: "flowchart TD\nA --> B", valid: false }],
        commits: [],
      },
    });
    expect(invalid).toContain("Flowchart source (not drawn)");
  });

  it("draws a Flow with a legend of the kinds it uses, and still draws an old flowchart", () => {
    const flowText = JSON.stringify({
      nodes: [
        { id: "a", kind: "event", label: "after a commit" },
        { id: "b", kind: "store", label: "queue" },
      ],
      edges: [{ from: "a", to: "b" }],
      ordered: false,
    });
    const html = render("shape", {
      shape: {
        tools: [
          { kind: "flow", text: flowText, valid: true },
          { kind: "mermaid", text: "flowchart TD\nA --> B", valid: true },
        ],
        commits: [],
      },
    });
    expect(html).toContain("<span>Flow</span>");
    expect(html).toContain("<span>Flowchart</span>");
    expect(html).toContain("diagram");
    // The legend names only the kinds the Shape uses: event and store.
    expect(html).toContain('class="shape-legend"');
    expect(html).toContain("⚡");
    expect(html).toContain("Data store");
    expect(html).not.toContain("Function");
  });

  it("captions an ordered Flow as a Sequence and an unordered one as a Flow", () => {
    const ordered = JSON.stringify({
      nodes: [
        { id: "a", kind: "event", label: "after a commit" },
        { id: "b", kind: "store", label: "queue" },
      ],
      edges: [{ from: "a", to: "b", label: "enqueue" }],
      ordered: true,
    });
    const sequence = render("shape", {
      shape: {
        tools: [{ kind: "flow", text: ordered, valid: true }],
        commits: [],
      },
    });
    expect(sequence).toContain("<span>Sequence</span>");
    expect(sequence).toContain('aria-label="How to read the Sequence"');

    const unordered = JSON.stringify({
      nodes: [
        { id: "a", kind: "event", label: "after a commit" },
        { id: "b", kind: "store", label: "queue" },
      ],
      edges: [{ from: "a", to: "b", label: "enqueue" }],
      ordered: false,
    });
    const flow = render("shape", {
      shape: {
        tools: [{ kind: "flow", text: unordered, valid: true }],
        commits: [],
      },
    });
    expect(flow).toContain("<span>Flow</span>");
    expect(flow).toContain('aria-label="How to read the Flow"');
  });

  it("lays out a Before / After table and shows an unknown tool as text", () => {
    const html = render("shape", {
      shape: {
        tools: [
          {
            kind: "table",
            text: "Long diff | runs past the window | scrolls inside it",
            valid: true,
          },
          { kind: "timeline", text: "a newer tool", valid: false },
        ],
        commits: [],
      },
    });
    expect(html).toContain('<table class="shape-table">');
    expect(html).toContain('<th scope="row">Long diff</th><td>runs past the window</td>');
    expect(html).toContain("Before / After");
    expect(html).toContain("a newer tool");
    expect(html).toContain("<span>timeline</span>");
    // A kind this map does not know has no reading to offer.
    expect(html).not.toContain("How to read the timeline");
  });

  it("draws a sequence, lays out an Interface table and shows an example", () => {
    const html = render("shape", {
      shape: {
        tools: [
          { kind: "sequence", text: "sequenceDiagram\n  A->>B: go", valid: true },
          { kind: "interface", text: "--commit <sha> | — | new flag", valid: true },
          { kind: "example", text: "git commit\n→ queued", valid: true },
        ],
        commits: [],
      },
    });
    expect(html).toContain("<span>Sequence</span>");
    expect(html).toContain('aria-label="How to read the Sequence"');
    expect(html).toContain('<th scope="col">Item</th>');
    expect(html).toContain("<span>Interface</span>");
    expect(html).toContain("<span>Example</span>");
    expect(html).toContain("→ queued");
  });

  it("shows a table the registry refused as written", () => {
    const html = render("shape", {
      shape: { tools: [{ kind: "table", text: "only | two", valid: false }], commits: [] },
    });
    expect(html).toContain("Before / After (as written)");
    expect(html).not.toContain("<table");
  });

  it("has three named tabs", () => {
    const html = render("shape");
    expect(html).toContain("Intent");
    expect(html).toContain("Shape");
    expect(html).toContain("Code");
  });
});

describe("the Mermaid diagram", () => {
  it("is drawn only on a page the cogit server sent", () => {
    expect(mermaidAvailable("http:")).toBe(true);
    expect(mermaidAvailable("https:")).toBe(true);
    expect(mermaidAvailable("file:")).toBe(false);
  });

  it("shows the source as text, with a hint, away from the server", () => {
    const html = renderToStaticMarkup(
      createElement(MermaidDiagram, { source: "flowchart TD\n  A --> B" }),
    );
    expect(html).toContain('<pre class="shape-source">flowchart TD');
    expect(html).toContain("cogit open");
  });
});

describe("the help bubble", () => {
  it("opens below when it fits, above when only that fits, and caps its height otherwise", () => {
    const anchor = { left: 100, top: 100, bottom: 118 };
    expect(bubblePlace(anchor, 200, 1200, 800)).toEqual({
      position: "fixed",
      left: 92,
      top: 124,
      bottom: "auto",
      maxHeight: 668,
      overflowY: "auto",
    });
    const low = { left: 1150, top: 700, bottom: 718 };
    expect(bubblePlace(low, 200, 1200, 800)).toEqual({
      position: "fixed",
      left: 832,
      top: "auto",
      bottom: 106,
      maxHeight: 686,
      overflowY: "auto",
    });
    // Too tall for either side: the roomier one, scrolling inside itself.
    expect(bubblePlace({ left: 2, top: 240, bottom: 258 }, 400, 400, 493)).toMatchObject({
      left: 8,
      bottom: 259,
      maxHeight: 226,
    });
    expect(bubblePlace({ left: 2, top: 200, bottom: 218 }, 400, 400, 493)).toMatchObject({
      top: 224,
      maxHeight: 261,
    });
  });
});
