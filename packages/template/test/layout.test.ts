import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROW_HEIGHT, rowHeight, TAGS_PER_LINE, TITLE_MIN_WIDTH } from "../src/gitLayout.js";
import { shouldForwardWheel } from "../src/scroll.js";

/**
 * Story 9.2 pins the map's layout and readability in CSS. These tests read
 * `styles.css` itself: a rule that quietly loses the content column, the
 * title's minimum width or the contrast of small text fails here instead of
 * only looking wrong in a browser.
 */

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Declaration block of the first rule whose selector (commas and spaces loose) matches. */
function declarations(selector: string): string {
  const pattern = selector
    .split(",")
    .map((part) => part.trim().split(/\s+/).map(escape).join("\\s+"))
    .join("\\s*,\\s*");
  const match = css.match(new RegExp(`(?:^|\\n)\\s*${pattern}\\s*\\{([\\s\\S]*?)\\}`));
  if (match?.[1] === undefined) throw new Error(`no rule for ${selector}`);
  return match[1];
}

function value(selector: string, property: string): string {
  const line = declarations(selector)
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${property}:`));
  if (line === undefined) throw new Error(`${selector} has no ${property}`);
  return line.slice(property.length + 1).trim();
}

function variables(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [
      match[1] as string,
      (match[2] as string).trim(),
    ]),
  );
}

const darkVars = variables(css.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? "");
const lightBlock = css.match(
  /@media \(prefers-color-scheme: light\)\s*\{\s*:root:not\(\[data-theme="dark"\]\)\s*\{([\s\S]*?)\}\s*\}/,
);
const lightVars = { ...darkVars, ...variables(lightBlock?.[1] ?? "") };
// The theme switch's Light repeats the system palette exactly.
const switchLight = css.match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)\}/);

/** WCAG relative luminance of a `#rrggbb` colour. */
function luminance(hex: string): number {
  const number = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(number >> 16) & 255, (number >> 8) & 255, number & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

describe("map layout (Story 9.2)", () => {
  it("keeps the content column at 8 of 12 columns and drops it below 1100px", () => {
    expect(value(".map-page .page-head, .map-page .lineage-map", "width")).toBe("66.667%");
    const narrow = css.match(/@media \(max-width: 1100px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(narrow).toMatch(/main\.map-page\s*\{[^}]*padding-right:\s*16px/);
    expect(narrow).toMatch(/\.map-page \.page-head,[\s\S]*?width:\s*100%/);
  });

  it("puts the panel in the same 8-of-12 column", () => {
    expect(value("main.panel-page", "width")).toBe("66.667%");
    const narrow = css.match(/@media \(max-width: 1100px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(narrow).toMatch(/main\.panel-page\s*\{[^}]*width:\s*100%[^}]*padding-right:\s*16px/);
  });

  it("gives the page one scroller: the map fills the rest of the window", () => {
    expect(value("html, body, #root", "height")).toBe("100%");
    expect(declarations("body:has(.map-page)")).toMatch(/overflow:\s*hidden/);
    expect(value("main.map-page", "height")).toBe("100%");
    expect(value("main.map-page", "display")).toBe("flex");
    // The map's height comes from the flex column, not a viewport calculation.
    expect(declarations(".graph-wrap")).toMatch(/flex:\s*1 1 auto/);
    expect(declarations(".graph-wrap")).not.toMatch(/calc\(100vh/);
  });

  it("never squeezes a title into a one-letter column", () => {
    expect(value(".git-title", "min-width")).toBe(`${TITLE_MIN_WIDTH}px`);
    // Every chip beside the title may shrink and truncate instead of pushing it.
    expect(declarations(".git-continues")).toMatch(/flex:\s*0 1 auto/);
    expect(declarations(".git-continues")).toMatch(/text-overflow:\s*ellipsis/);
  });

  it("lays a row out tall enough to wrap at the title's minimum width", () => {
    // 120 characters need 5 lines at 180px, but would need 7 at the old 120px
    // floor; the height follows the title, not the chips next to it.
    const message = { id: "x", label: "m1", title: "a".repeat(120) };
    // A narrow map: the chips leave the title only its minimum width.
    const height = rowHeight(message, { tags: 3, head: false }, 300);
    expect(height).toBeGreaterThanOrEqual(12 + Math.ceil((120 * 6.4) / TITLE_MIN_WIDTH) * 16);
  });

  it("wraps commit tags below each other instead of clipping them", () => {
    expect(declarations(".git-tags")).toMatch(/flex-wrap:\s*wrap/);
    expect(declarations(".git-tags")).not.toMatch(/overflow:\s*hidden/);
    expect(declarations(".git-tag")).toMatch(/flex:\s*none/);
    const row = { head: false };
    const message = { id: "x", label: "m28", title: "short" };
    expect(rowHeight(message, { ...row, tags: TAGS_PER_LINE })).toBe(ROW_HEIGHT);
    // A third tag starts a second line, so the row grows to hold it.
    expect(rowHeight(message, { ...row, tags: TAGS_PER_LINE + 1 })).toBeGreaterThan(ROW_HEIGHT);
  });
});

describe("small text contrast (Story 9.2)", () => {
  const pairs: [string, string][] = [
    ["muted", "bg"],
    ["muted", "panel"],
    ["muted", "row-bg"],
    ["muted", "hover"],
    ["muted", "active"],
    ["missing", "row-bg"],
    ["missing", "chip-bg"],
    ["muted", "search-hit-bg"],
    ["muted", "search-active-bg"],
    ["accent", "row-bg"],
    ["warn", "kind-question-bg"],
    ["kind-message-text", "kind-message-bg"],
    ["kind-decision-text", "kind-decision-bg"],
    // Diff lines in the message details (Story 10.5).
    ["diff-add-text", "diff-add-bg"],
    ["diff-remove-text", "diff-remove-bg"],
  ];

  it("declares a light theme besides the dark default", () => {
    expect(lightBlock).not.toBeNull();
    expect(variables(switchLight?.[1] ?? "")).toEqual(variables(lightBlock?.[1] ?? ""));
  });

  for (const [name, theme] of [
    ["dark", darkVars],
    ["light", lightVars],
  ] as const) {
    it(`reaches WCAG AA in the ${name} theme`, () => {
      for (const [foreground, background] of pairs) {
        const fg = theme[`--${foreground}`] as string | undefined;
        const bg = theme[`--${background}`] as string | undefined;
        expect(fg, `--${foreground}`).toMatch(/^#[0-9a-f]{6}$/i);
        expect(bg, `--${background}`).toMatch(/^#[0-9a-f]{6}$/i);
        const ratio = contrast(fg as string, bg as string);
        expect(
          ratio,
          `${foreground} on ${background} is ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`keeps branch labels readable on every lane in the ${name} theme`, () => {
      const onLane = theme["--on-lane"] as string;
      for (let lane = 0; lane < 6; lane += 1) {
        const colour = theme[`--l${lane}`] as string;
        const ratio = contrast(onLane, colour);
        expect(ratio, `--on-lane on --l${lane} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    });
  }
});

describe("page wheel forwarding (Story 9.2)", () => {
  const element = (owned: boolean) =>
    ({
      closest: () => (owned ? {} : null),
    }) as unknown as Element;

  it("sends the wheel to the map from the gutters and the head", () => {
    expect(shouldForwardWheel(null)).toBe(true);
    expect(shouldForwardWheel({} as EventTarget)).toBe(true);
    expect(shouldForwardWheel(element(false))).toBe(true);
  });

  it("leaves the map and the page's own scrollers alone", () => {
    expect(shouldForwardWheel(element(true))).toBe(false);
  });
});
