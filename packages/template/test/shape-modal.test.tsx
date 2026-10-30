import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ViewNode } from "../../cli/src/view/model.js";
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
    expect(invalid).toContain("Diagram source (not drawn)");
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
