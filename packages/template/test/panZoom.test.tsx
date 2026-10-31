import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MermaidDiagram } from "../src/MermaidDiagram.js";
import { clampPan, fitScale, fitView, zoomAt } from "../src/panZoom.js";

const box = { width: 800, height: 500 };

describe("fitScale", () => {
  it("shrinks a wide diagram to the viewport", () => {
    expect(fitScale(box, { width: 1600, height: 400 })).toBe(0.5);
    expect(fitScale(box, { width: 1000, height: 250 })).toBe(0.8);
    expect(fitScale(box, { width: 400, height: 1000 })).toBe(0.5);
  });

  it("stops at the legibility floor and never enlarges", () => {
    expect(fitScale(box, { width: 8000, height: 300 })).toBe(0.5);
    expect(fitScale(box, { width: 200, height: 100 })).toBe(1);
    expect(fitScale(box, { width: 0, height: 0 })).toBe(1);
  });
});

describe("fitView", () => {
  it("centres a diagram that fits and starts a wider one at the top-left", () => {
    expect(fitView(box, { width: 200, height: 100 })).toEqual({ scale: 1, x: 300, y: 200 });
    const wide = fitView(box, { width: 8000, height: 300 });
    expect(wide.scale).toBe(0.5);
    expect(wide.x).toBe(8);
    expect(wide.y).toBe(175);
  });
});

describe("clampPan", () => {
  it("keeps a large diagram from leaving past its edge plus the padding", () => {
    const content = { width: 2000, height: 1000 };
    expect(clampPan({ scale: 1, x: 500, y: 500 }, box, content)).toEqual({ scale: 1, x: 8, y: 8 });
    expect(clampPan({ scale: 1, x: -5000, y: -5000 }, box, content)).toEqual({
      scale: 1,
      x: 800 - 2000 - 8,
      y: 500 - 1000 - 8,
    });
  });

  it("keeps a small diagram inside the viewport", () => {
    const content = { width: 100, height: 100 };
    expect(clampPan({ scale: 1, x: -50, y: 900 }, box, content)).toEqual({
      scale: 1,
      x: 8,
      y: 500 - 100 - 8,
    });
  });
});

describe("zoomAt", () => {
  it("keeps the point under the pointer still", () => {
    const view = zoomAt({ scale: 1, x: 10, y: 20 }, 2, 110, 120);
    expect(view.scale).toBe(2);
    // The content point under (110, 120) was (100, 100); it still is.
    expect((110 - view.x) / view.scale).toBe(100);
    expect((120 - view.y) / view.scale).toBe(100);
  });

  it("stays within 0.25 and 3", () => {
    expect(zoomAt({ scale: 2, x: 0, y: 0 }, 10, 0, 0).scale).toBe(3);
    expect(zoomAt({ scale: 0.5, x: 0, y: 0 }, 0.01, 0, 0).scale).toBe(0.25);
  });
});

describe("MermaidDiagram controls", () => {
  const source = "flowchart LR\nA --> B";

  it("gives the Open window's diagram its zoom controls and viewport", () => {
    const html = renderToStaticMarkup(
      createElement(MermaidDiagram, { source, interactive: true, available: true }),
    );
    expect(html).toContain("shape-viewport");
    expect(html).toContain('aria-label="Zoom out"');
    expect(html).toContain('aria-label="Fit the diagram"');
    expect(html).toContain('aria-label="Zoom in"');
  });

  it("leaves the panel's preview without them", () => {
    const html = renderToStaticMarkup(
      createElement(MermaidDiagram, { source, fit: true, available: true }),
    );
    expect(html).not.toContain("shape-viewport");
    expect(html).not.toContain("Zoom in");
  });

  it("keeps showing the source on a file:// page", () => {
    const html = renderToStaticMarkup(
      createElement(MermaidDiagram, { source, interactive: true, available: false }),
    );
    expect(html).toContain("shape-source");
    expect(html).not.toContain("Zoom in");
  });
});
