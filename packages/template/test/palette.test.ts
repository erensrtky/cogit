import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeSystem, systemDark, usePalette } from "../src/ThemeButton.js";
import { setTheme } from "../src/theme.js";

/** A stand-in `matchMedia` whose light preference can flip, counting listeners. */
function fakeMedia(light: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches: light,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  };
  vi.stubGlobal("window", { matchMedia: () => media });
  return { media, listeners };
}

function Shown() {
  return createElement("span", null, usePalette());
}

afterEach(() => {
  vi.unstubAllGlobals();
  setTheme("system");
});

describe("the palette React Flow is given", () => {
  it("is dark unless the system asks for light, like the stylesheet", () => {
    fakeMedia(true);
    expect(systemDark()).toBe(false);
    fakeMedia(false);
    expect(systemDark()).toBe(true);
    vi.stubGlobal("window", undefined);
    expect(systemDark()).toBe(true);
  });

  it("follows the system preference while subscribed, and stops after", () => {
    const { listeners } = fakeMedia(true);
    const listener = () => {};
    const unsubscribe = subscribeSystem(listener);
    expect(listeners.has(listener)).toBe(true);
    unsubscribe();
    expect(listeners.size).toBe(0);
  });

  it("lets the switch win over the system, and System resolves to a palette", () => {
    setTheme("light");
    expect(renderToStaticMarkup(createElement(Shown))).toBe("<span>light</span>");
    setTheme("system");
    // Rendered without a browser: the stylesheet's dark default.
    expect(renderToStaticMarkup(createElement(Shown))).toBe("<span>dark</span>");
  });
});
