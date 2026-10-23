/**
 * Card heights for the map, computed from the text so every card shows its whole
 * title and summary. The layout never measures the DOM; it wraps words against
 * canvas text metrics (or a character estimate where no canvas exists).
 */

export type Measure = (text: string, font: string) => number;

const FONT_FAMILY = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const TITLE_FONT = `700 13px ${FONT_FAMILY}`;
const BODY_FONT = `400 11px ${FONT_FAMILY}`;
const KIND_FONT = `400 10px ${FONT_FAMILY}`;
const TITLE_LINE = 17;
const BODY_LINE = 15;
/** Padding, borders and the gap above the body line. */
const CHROME = 18;
const BODY_GAP = 3;
const HEAD_MIN = 20;
/**
 * Horizontal room the card's padding and borders take, plus a margin: the browser
 * wraps a little earlier than the measured widths suggest.
 */
const INSET = 34;
const TOGGLE = 26;
const KIND_PADDING = 18;
/** Wrapping is measured, not rendered; a little slack keeps the last line clear. */
const SLACK = 4;

let canvasMeasure: Measure | null | undefined;

function defaultMeasure(): Measure {
  if (canvasMeasure === undefined) {
    canvasMeasure = null;
    try {
      const context = document.createElement("canvas").getContext("2d");
      if (context) {
        canvasMeasure = (text, font) => {
          context.font = font;
          return context.measureText(text).width;
        };
      }
    } catch {
      // no DOM (tests, server): fall back to the estimate
    }
  }
  return canvasMeasure ?? estimate;
}

/** Average glyph width for the UI fonts, used when there is no canvas. */
function estimate(text: string, font: string): number {
  const size = Number.parseFloat(font.split(" ")[1] ?? "12");
  return text.length * size * 0.56;
}

/** Number of lines `text` takes when wrapped at word boundaries to `width`. */
export function countLines(text: string, width: number, font: string, measure: Measure): number {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  let lines = 1;
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next, font) <= width || !line) {
      // a single word wider than the card breaks inside itself
      if (!line && measure(word, font) > width) {
        lines += Math.ceil(measure(word, font) / width) - 1;
      }
      line = next;
    } else {
      lines += 1;
      line = word;
      if (measure(word, font) > width) lines += Math.ceil(measure(word, font) / width) - 1;
    }
  }
  return lines;
}

export interface CardText {
  kindLabel: string;
  title: string;
  /** The line under the title: a summary, a time or an "N items inside" count. */
  body?: string;
  hasToggle: boolean;
}

export function cardHeight(
  card: CardText,
  width: number,
  measure: Measure = defaultMeasure(),
): number {
  const kindWidth = measure(card.kindLabel.toUpperCase(), KIND_FONT) * 1.05 + KIND_PADDING;
  const titleWidth = width - INSET - kindWidth - (card.hasToggle ? TOGGLE : 0);
  const titleLines = Math.max(1, countLines(card.title, titleWidth, TITLE_FONT, measure));
  const head = Math.max(HEAD_MIN, titleLines * TITLE_LINE);
  const bodyLines = card.body ? countLines(card.body, width - INSET, BODY_FONT, measure) : 0;
  const body = bodyLines > 0 ? BODY_GAP + bodyLines * BODY_LINE : 0;
  return Math.ceil(CHROME + head + body + SLACK);
}
