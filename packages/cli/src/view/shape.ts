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

/**
 * The panel preview: the first lines of the steps, or else of the Before /
 * After table as `case: before → after`. A diagram alone has no text preview.
 */
export function shapePreview(shape: ViewShape | undefined, lines = 3): string | undefined {
  const text = (kind: string) => shape?.tools.find((tool) => tool.kind === kind)?.text;
  const pseudo = text("pseudo");
  const table = text("table");
  const kept =
    pseudo !== undefined
      ? pseudo.split("\n").map((line) => line.trim())
      : (table?.split("\n") ?? []).map((line) => {
          const cells = line.split("|").map((cell) => cell.trim());
          return cells.length === 3 ? `${cells[0]}: ${cells[1]} → ${cells[2]}` : line.trim();
        });
  const shown = kept.filter((line) => line !== "").slice(0, lines);
  return shown.length === 0 ? undefined : shown.join("\n");
}

/**
 * A Before / After table's rows, `case | before | after` per line; undefined
 * when a line does not have exactly three filled cells.
 */
export function tableRows(text: string): [string, string, string][] | undefined {
  const rows: [string, string, string][] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length !== 3 || cells.some((cell) => cell === "")) return undefined;
    rows.push(cells as [string, string, string]);
  }
  return rows;
}
