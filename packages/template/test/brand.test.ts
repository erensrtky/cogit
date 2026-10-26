import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { Brand } from "../src/Brand.js";

/** A stand-in document: only the live-page meta lookup is read. */
function fakeDocument(live: boolean): void {
  (globalThis as { document?: unknown }).document = {
    querySelector: () => (live ? {} : null),
  };
}

describe("Brand", () => {
  afterEach(() => {
    delete (globalThis as { document?: unknown }).document;
  });

  it("names the product with its slogan on the panel, as plain text", () => {
    const html = renderToStaticMarkup(createElement(Brand, { home: true }));
    expect(html).toContain('<span class="brand" aria-label="cogit">cogit');
    expect(html).toContain("Cogito, ergo commit.");
  });

  it("leads back to the panel from a served map, not from a file", () => {
    fakeDocument(true);
    expect(renderToStaticMarkup(createElement(Brand))).toContain('<a class="brand" href="/"');
    fakeDocument(false);
    expect(renderToStaticMarkup(createElement(Brand))).toContain('<span class="brand"');
  });
});
