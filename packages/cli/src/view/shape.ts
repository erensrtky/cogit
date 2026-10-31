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
 * The panel preview: the first lines of the steps, else of the example, else
 * of a table as `case: before → after`. A diagram alone has no text preview.
 */
export function shapePreview(shape: ViewShape | undefined, lines = 3): string | undefined {
  const text = (kind: string) => shape?.tools.find((tool) => tool.kind === kind)?.text;
  const plain = text("pseudo") ?? text("example");
  const table = text("table") ?? text("interface");
  const kept =
    plain !== undefined
      ? plain.split("\n").map((line) => line.trim())
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

/**
 * How names are written in every Shape tool, so a reader tells a role from a
 * file, a function, a field, a command and the text it prints at a glance.
 * The writer's prompt and the map's "?" read the same list.
 */
export const SHAPE_NOTATION: readonly { sample: string; means: string }[] = [
  { sample: "Git, cogit, Record", means: "a role: a program, a person or a store that acts" },
  { sample: "session.ts", means: "a file, with its extension" },
  { sample: "drainShapeQueue()", means: "a function, with ()" },
  { sample: "node.commits", means: "a field, variable or setting, with its owner and a dot" },
  { sample: "$ cogit shape", means: "a command you type, after $" },
  { sample: '"queued ba654e8"', means: "text the program shows, in quotes" },
];

/** What each tool shows and how to read it, for the "?" beside its caption. */
export const SHAPE_READING: Readonly<Record<string, string>> = {
  mermaid:
    "Follow the arrows from the top. A box is a step; a diamond is a question, and the arrows leaving it are its answers.",
  sequence:
    "Each column is an actor, named at the top. Read from top to bottom: each arrow is one actor handing work to another at that moment, and a dashed arrow is a reply.",
  table:
    "One row per case: what happens, how it behaved before this change, and how it behaves now.",
  interface:
    "One row per thing other code or people use: a command, flag, function, setting or stored field. — means it did not exist before, or is gone now.",
  example:
    "One concrete run. The first line is what you do or what happens; each line after → is what you would see.",
  pseudo: "What the code does now, in order, one step per line.",
};

/** Tools whose text names roles, files and functions, so their "?" shows the notation. */
export const NOTATION_KINDS: ReadonlySet<string> = new Set([
  "mermaid",
  "sequence",
  "example",
  "pseudo",
]);
