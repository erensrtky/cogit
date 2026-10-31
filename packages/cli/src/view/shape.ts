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
 * One kind every codebase has, with a fixed symbol cogit draws (Story 13.7).
 * The writer names the kind and the map draws its symbol, so a box reads the
 * same in any project. Shared by the writer's prompt and the map's legend.
 */
export interface UniversalKind {
  id: string;
  symbol: string;
  name: string;
  means: string;
}

export const UNIVERSAL_KINDS: readonly UniversalKind[] = [
  { id: "fn", symbol: "ƒ", name: "Function", means: "a function or method" },
  { id: "var", symbol: "x", name: "Variable", means: "a variable, field or setting" },
  {
    id: "cond",
    symbol: "◇",
    name: "Condition",
    means: "a question the code asks; its arrows are the answers",
  },
  { id: "loop", symbol: "↻", name: "Loop", means: "repeats for each item" },
  {
    id: "event",
    symbol: "⚡",
    name: "Event",
    means: "something that starts the work: a hook, a click, a timer",
  },
  {
    id: "store",
    symbol: "▤",
    name: "Data store",
    means: "a file, database, queue or cache that keeps data",
  },
  { id: "type", symbol: "▭", name: "Type", means: "a type, class or schema" },
  {
    id: "ext",
    symbol: "◎",
    name: "External system",
    means: "another program or service: git, a browser, an API, an AI model",
  },
  { id: "person", symbol: "☺", name: "Person", means: "someone using it" },
  {
    id: "async",
    symbol: "⇢",
    name: "Background job",
    means: "work started without waiting for it",
  },
  { id: "out", symbol: "↩", name: "Output", means: "what is returned or shown" },
  { id: "error", symbol: "✕", name: "Error", means: "an error or a refusal" },
];

/** A Flow's node and edge, as the writer's JSON holds them. */
export interface FlowNode {
  id: string;
  kind: string;
  label: string;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface FlowShape {
  nodes: FlowNode[];
  edges: FlowEdge[];
  ordered: boolean;
}

/** A node id: a lowercase letter, then up to 15 letters, digits or underscores. */
const FLOW_ID = /^[a-z][a-z0-9_]{0,15}$/;

/** Nodes and edges a Flow may carry. */
export const FLOW_MAX_NODES = 12;
export const FLOW_MAX_EDGES = 16;

const FLOW_KIND_IDS = new Set(UNIVERSAL_KINDS.map((kind) => kind.id));

/**
 * Parses a Flow's JSON and checks every rule (Story 13.7); undefined for bad
 * JSON or any violation. The validator, the renderer and the legend all read
 * the same rules here, so a Flow the map draws is one the CLI accepted.
 */
export function parseFlow(text: string): FlowShape | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const { nodes, edges, ordered } = parsed as {
    nodes?: unknown;
    edges?: unknown;
    ordered?: unknown;
  };
  if (!Array.isArray(nodes) || nodes.length === 0 || nodes.length > FLOW_MAX_NODES)
    return undefined;
  if (!Array.isArray(edges) || edges.length > FLOW_MAX_EDGES) return undefined;
  if (ordered !== undefined && typeof ordered !== "boolean") return undefined;

  const ids = new Set<string>();
  const parsedNodes: FlowNode[] = [];
  for (const node of nodes) {
    if (typeof node !== "object" || node === null) return undefined;
    const { id, kind, label } = node as { id?: unknown; kind?: unknown; label?: unknown };
    if (typeof id !== "string" || !FLOW_ID.test(id) || ids.has(id)) return undefined;
    ids.add(id);
    if (typeof kind !== "string" || !FLOW_KIND_IDS.has(kind)) return undefined;
    if (typeof label !== "string" || label.length < 1 || label.length > 60) return undefined;
    parsedNodes.push({ id, kind, label });
  }

  const parsedEdges: FlowEdge[] = [];
  for (const edge of edges) {
    if (typeof edge !== "object" || edge === null) return undefined;
    const { from, to, label } = edge as { from?: unknown; to?: unknown; label?: unknown };
    if (typeof from !== "string" || !ids.has(from)) return undefined;
    if (typeof to !== "string" || !ids.has(to)) return undefined;
    if (label !== undefined && (typeof label !== "string" || label.length > 40)) return undefined;
    parsedEdges.push({ from, to, ...(label === undefined ? {} : { label }) });
  }
  return { nodes: parsedNodes, edges: parsedEdges, ordered: ordered === true };
}

/** The Mermaid open/close per Flow kind; the rest draw as a plain rectangle. */
const FLOW_NODE_SHAPE: Readonly<Record<string, readonly [string, string]>> = {
  cond: ["{", "}"],
  store: ["[(", ")]"],
  event: [">", "]"],
  ext: ["[[", "]]"],
  person: ["([", ")]"],
  error: ["[/", "/]"],
};

/** A label as Mermaid reads it: no double quotes, # or ; left to break the parse. */
function flowLabel(text: string): string {
  return text.replace(/"/g, "'").replace(/#/g, "").replace(/;/g, "");
}

/**
 * A sequence participant's name or a message's text: the flowchart label rules
 * plus no newlines; a `:` inside a participant's name reads ` -` so it cannot
 * break the `participant … as …` line.
 */
function sequenceText(text: string, actor: boolean): string {
  const base = flowLabel(text).replace(/[\r\n]+/g, "");
  return actor ? base.replace(/:/g, " -") : base;
}

/**
 * The deterministic Mermaid a Flow draws (Story 13.7): an ordered Flow is a
 * `sequenceDiagram` — one `participant` column per node and one numbered arrow
 * per edge, top to bottom — and an unordered one is a `flowchart TD`, one box
 * per node with its kind's symbol and shape, one edge per arrow. Undefined for
 * input the rules refuse. The same input is always byte-identical.
 */
export function flowToMermaid(text: string): string | undefined {
  const flow = parseFlow(text);
  if (flow === undefined) return undefined;
  const symbol = (kind: string) => UNIVERSAL_KINDS.find((entry) => entry.id === kind)?.symbol ?? "";
  if (flow.ordered) {
    const lines = ["sequenceDiagram"];
    for (const node of flow.nodes)
      lines.push(
        `  participant ${node.id} as ${symbol(node.kind)} ${sequenceText(node.label, true)}`,
      );
    flow.edges.forEach((edge, index) => {
      const label =
        edge.label !== undefined && edge.label !== "" ? ` ${sequenceText(edge.label, false)}` : "";
      lines.push(`  ${edge.from}->>${edge.to}: ${index + 1}.${label}`);
    });
    return lines.join("\n");
  }
  const lines = ["flowchart TD"];
  for (const node of flow.nodes) {
    const [open, close] = FLOW_NODE_SHAPE[node.kind] ?? ["[", "]"];
    lines.push(`  ${node.id}${open}"${symbol(node.kind)} ${flowLabel(node.label)}"${close}`);
  }
  flow.edges.forEach((edge) => {
    if (edge.label !== undefined && edge.label !== "")
      lines.push(`  ${edge.from} -->|"${flowLabel(edge.label)}"| ${edge.to}`);
    else lines.push(`  ${edge.from} --> ${edge.to}`);
  });
  return lines.join("\n");
}

/**
 * The kinds a Shape actually uses, in `UNIVERSAL_KINDS` order: a Flow's node
 * kinds, plus the symbol at the start of each Steps line. The map's legend
 * shows only these.
 */
export function shapeKindsUsed(tools: readonly { kind: string; text: string }[]): UniversalKind[] {
  const used = new Set<string>();
  for (const tool of tools) {
    if (tool.kind === "flow") {
      const flow = parseFlow(tool.text);
      for (const node of flow?.nodes ?? []) used.add(node.kind);
    } else if (tool.kind === "pseudo") {
      for (const line of tool.text.split("\n")) {
        const symbol = /^\s*\d+[.)]\s+(\S)/.exec(line)?.[1];
        const kind =
          symbol === undefined
            ? undefined
            : UNIVERSAL_KINDS.find((entry) => entry.symbol === symbol);
        if (kind !== undefined) used.add(kind.id);
      }
    }
  }
  return UNIVERSAL_KINDS.filter((kind) => used.has(kind.id));
}

/** What each tool shows and how to read it, for the "?" beside its caption. */
export const SHAPE_READING: Readonly<Record<string, string>> = {
  mermaid:
    "Follow the arrows from the top. A box is a step; a diamond is a question, and the arrows leaving it are its answers.",
  sequence:
    "Each column is an actor, named at the top. Read from top to bottom: each arrow is one actor handing work to another at that moment, and a dashed arrow is a reply.",
  flow: "Follow the arrows from the top. Each box's symbol says what kind of thing it is — the legend above lists them; a ◇ is a question, and the arrows leaving it are its answers.",
  table:
    "One row per case: what happens, how it behaved before this change, and how it behaves now.",
  interface:
    "One row per thing other code or people use: a command, flag, function, setting or stored field. — means it did not exist before, or is gone now.",
  example:
    "One concrete run. The first line is what you do or what happens; each line after → is what you would see.",
  pseudo:
    "What the code does now, in order, one step per line; each step starts with the symbol of what it is.",
};
