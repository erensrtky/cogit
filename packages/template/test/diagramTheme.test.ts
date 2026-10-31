import { describe, expect, it } from "vitest";
import {
  effectiveTheme,
  MERMAID_TOKENS,
  mermaidThemeVariables,
  type TokenReader,
} from "../src/diagramTheme.js";

/** A stub stylesheet: each token answers with its own name. */
const reader: TokenReader = (name) => `colour:${name}`;

describe("effectiveTheme", () => {
  it("follows the system preference while on System", () => {
    expect(effectiveTheme("system", true)).toBe("dark");
    expect(effectiveTheme("system", false)).toBe("light");
  });

  it("passes a chosen theme through", () => {
    expect(effectiveTheme("light", true)).toBe("light");
    expect(effectiveTheme("dark", false)).toBe("dark");
  });
});

describe("mermaidThemeVariables", () => {
  it("takes every Mermaid colour from its page token", () => {
    const variables = mermaidThemeVariables(reader);
    for (const rule of MERMAID_TOKENS) {
      for (const name of rule.variables) {
        expect(variables[name], name).toBe(`colour:${rule.token}`);
      }
    }
    expect(variables.fontFamily).toBe("inherit");
  });

  it("falls back to a readable system colour when a token is missing", () => {
    for (const answer of [undefined, "", "   "]) {
      const variables = mermaidThemeVariables(() => answer);
      for (const rule of MERMAID_TOKENS) {
        for (const name of rule.variables) {
          expect(variables[name], name).toBe(rule.fallback);
          expect(variables[name]).not.toBe("");
        }
      }
    }
  });
});
