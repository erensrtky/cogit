import type { ThemeMode } from "./theme.js";

/**
 * Diagrams follow the map's palette (Story 14.3). Mermaid is initialised with
 * its `base` theme, whose colours all come from `themeVariables`; the values
 * are read from the page's CSS custom properties, so the stylesheet stays the
 * only place a colour is written down.
 */

export type DiagramTheme = "light" | "dark";

/** The palette the page is showing: the switch wins, else the system preference. */
export function effectiveTheme(mode: ThemeMode, prefersDark: boolean): DiagramTheme {
  if (mode === "light" || mode === "dark") return mode;
  return prefersDark ? "dark" : "light";
}

/** Reads one token's value, or `undefined` when the page does not define it. */
export type TokenReader = (name: string) => string | undefined;

interface TokenRule {
  /** The app token the diagram takes its colour from. */
  readonly token: string;
  /** Mermaid's theme variables that colour this part of a diagram. */
  readonly variables: readonly string[];
  /**
   * CSS system colour used when the page has no such token — still theme-aware
   * through `color-scheme`, so no colour is written in TypeScript.
   */
  readonly fallback: string;
}

/**
 * The whole map, in one place: a diagram type that needs another variable is
 * covered by adding it here, not by touching the component.
 */
export const MERMAID_TOKENS: readonly TokenRule[] = [
  { token: "--chip-bg", variables: ["primaryColor", "mainBkg", "actorBkg"], fallback: "Canvas" },
  {
    token: "--text",
    variables: [
      "primaryTextColor",
      "textColor",
      "actorTextColor",
      "signalTextColor",
      "labelTextColor",
      "loopTextColor",
      "noteTextColor",
    ],
    fallback: "CanvasText",
  },
  {
    token: "--chip-line",
    variables: [
      "primaryBorderColor",
      "nodeBorder",
      "actorBorder",
      "labelBoxBorderColor",
      "noteBorderColor",
      "activationBorderColor",
    ],
    fallback: "GrayText",
  },
  { token: "--muted", variables: ["lineColor", "signalColor"], fallback: "GrayText" },
  { token: "--line", variables: ["actorLineColor", "clusterBorder"], fallback: "GrayText" },
  {
    token: "--raised",
    variables: ["edgeLabelBackground", "labelBoxBkgColor", "activationBkgColor", "secondaryColor"],
    fallback: "Canvas",
  },
  { token: "--raised-2", variables: ["tertiaryColor", "clusterBkg"], fallback: "Canvas" },
  { token: "--kind-bg", variables: ["noteBkgColor"], fallback: "Canvas" },
];

/** Mermaid's `themeVariables` for the page's current palette. */
export function mermaidThemeVariables(read: TokenReader): Record<string, string> {
  const themeVariables: Record<string, string> = { fontFamily: "inherit" };
  for (const rule of MERMAID_TOKENS) {
    const value = read(rule.token)?.trim();
    const colour = value === undefined || value === "" ? rule.fallback : value;
    for (const variable of rule.variables) themeVariables[variable] = colour;
  }
  return themeVariables;
}
