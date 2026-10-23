import { describe, expect, it } from "vitest";
import { cardHeight, countLines, type Measure } from "../src/cardHeight.js";

/** Every character is 10px wide, so wrapping is easy to reason about. */
const fixed: Measure = (text) => text.length * 10;

describe("countLines", () => {
  it("wraps at word boundaries", () => {
    expect(countLines("", 100, "f", fixed)).toBe(0);
    expect(countLines("aaaa bbbb", 100, "f", fixed)).toBe(1);
    expect(countLines("aaaa bbbb cccc", 100, "f", fixed)).toBe(2);
  });

  it("breaks a word longer than the line", () => {
    expect(countLines("a".repeat(25), 100, "f", fixed)).toBe(3);
    expect(countLines(`ab ${"c".repeat(25)}`, 100, "f", fixed)).toBe(4);
  });
});

describe("cardHeight", () => {
  const card = { kindLabel: "step", title: "Short", hasToggle: false };

  it("grows with a longer title and with a body line", () => {
    const short = cardHeight(card, 240, fixed);
    const long = cardHeight({ ...card, title: "word ".repeat(30) }, 240, fixed);
    const withBody = cardHeight({ ...card, body: "summary ".repeat(20) }, 240, fixed);
    expect(long).toBeGreaterThan(short);
    expect(withBody).toBeGreaterThan(short);
  });

  it("leaves less room for the title when the card has a toggle", () => {
    const title = "word ".repeat(9);
    expect(cardHeight({ ...card, title, hasToggle: true }, 240, fixed)).toBeGreaterThanOrEqual(
      cardHeight({ ...card, title }, 240, fixed),
    );
  });

  it("adds room for the meta line", () => {
    expect(cardHeight({ ...card, meta: "agreed · 1 commit" }, 240, fixed)).toBeGreaterThan(
      cardHeight(card, 240, fixed),
    );
  });

  it("falls back to an estimate without a canvas", () => {
    expect(cardHeight(card, 240)).toBeGreaterThan(30);
  });
});
