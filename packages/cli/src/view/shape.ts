import type { ViewShape } from "./model.js";

/**
 * What the map should say about a message's Shape (Story 13.6). Kept out of the
 * component so the three states have one name in the panel and in tests.
 */
export type ShapeState =
  /** At least one tool answered; show it. */
  | "ready"
  /** The writer looked and found nothing worth showing. */
  | "empty"
  /** The setting is on but nobody has written it yet. */
  | "queued"
  /** The setting is off. */
  | "off";

export function shapeState(shape: ViewShape | undefined, enabled: boolean): ShapeState {
  if (!enabled) return "off";
  if (shape === undefined) return "queued";
  return shape.tools.length === 0 ? "empty" : "ready";
}

/** The first lines of a pseudo-code answer, for the panel preview. */
export function shapePreview(shape: ViewShape | undefined, lines = 3): string | undefined {
  const pseudo = shape?.tools.find((tool) => tool.kind === "pseudo");
  if (pseudo === undefined) return undefined;
  const kept = pseudo.text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .slice(0, lines);
  return kept.length === 0 ? undefined : kept.join("\n");
}
