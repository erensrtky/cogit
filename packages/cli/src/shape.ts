import type { LineageNode, Shape, ShapeInput, ShapeKind, ShapeTool } from "./schema/session.js";

/**
 * The Shape catalogue (Story 13.6): a Shape sits between a message's Intent
 * (the record's decision, reason, rejected options) and its Code (the diff),
 * and says what the change does at a glance. A writer picks one tool, both, or
 * none ("nothing to show").
 *
 * The catalogue is a registry: a tool is added here with its prompt line, its
 * output schema and its validator, and the side writer and the map pick it up
 * from the same place. Plain-text output survives a failed validation; a
 * Mermaid source the map cannot draw is shown as text, never dropped.
 */

export interface ShapeToolSpec {
  kind: ShapeKind;
  /** Short name, as it reads in the panel and in the prompt. */
  name: string;
  /** When the writer should reach for this tool. */
  when: string;
  /** True when the output can be shown as designed. */
  validate(text: string): boolean;
}

/** Number of nodes a Mermaid flowchart may carry. */
export const MERMAID_MAX_NODES = 15;

const MERMAID_KEYWORDS = new Set([
  "flowchart",
  "graph",
  "td",
  "tb",
  "lr",
  "rl",
  "bt",
  "subgraph",
  "end",
  "direction",
  "click",
  "style",
  "class",
  "classdef",
  "linkstyle",
]);

/** A rough node count: identifiers plus shapes; enough to keep a diagram small. */
export function mermaidNodeCount(text: string): number {
  const ids = new Set<string>();
  for (const match of text.matchAll(/\b[A-Za-z_][\w-]*\b/g)) {
    const word = match[0];
    if (!MERMAID_KEYWORDS.has(word.toLowerCase())) ids.add(word);
  }
  return ids.size;
}

export const SHAPE_TOOLS: readonly ShapeToolSpec[] = [
  {
    kind: "pseudo",
    name: "Steps",
    when:
      "The change is mostly logic: a new path through functions, a rule, a check. " +
      "Numbered plain-language steps, naming the functions and files they touch.",
    validate(text) {
      const lines = text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");
      if (lines.length < 2) return false;
      if (!lines.some((line) => /^\d+[.)]\s+\S/.test(line))) return false;
      return text.length <= 3000;
    },
  },
  {
    kind: "mermaid",
    name: "Diagram",
    when:
      `The change is a flow between files or functions (a request path, a queue, a state ` +
      `machine). A Mermaid flowchart of at most ${MERMAID_MAX_NODES} nodes.`,
    validate(text) {
      const source = text.trim();
      if (!/^(flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/i.test(source)) return false;
      if (/<script/i.test(source)) return false;
      if (!/-->|---/.test(source)) return false;
      if (source.split("\n").length > 60) return false;
      return mermaidNodeCount(source) <= MERMAID_MAX_NODES;
    },
  },
];

/** The registry entry for a kind, or undefined for a kind this CLI does not know. */
export function shapeToolSpec(kind: string): ShapeToolSpec | undefined {
  return SHAPE_TOOLS.find((tool) => tool.kind === kind);
}

/**
 * Stamps each tool's validation result. The text is always kept: a diagram the
 * map cannot draw is shown as source, which is more useful than nothing.
 */
export function validateShapeTools(tools: ShapeInput["tools"]): ShapeTool[] {
  return tools.map((tool) => {
    const spec = shapeToolSpec(tool.kind);
    return { kind: tool.kind, text: tool.text, valid: spec?.validate(tool.text) ?? false };
  });
}

/**
 * A writer's Shape as the record stores it: the CLI owns `by` and `at`, and
 * every tool carries its validation result.
 */
export function stampShape(shape: ShapeInput, by: "agent" | "side", at: string): Shape {
  return {
    tools: validateShapeTools(shape.tools),
    commits: [...new Set(shape.commits)],
    by,
    at,
  };
}

/** One commit's numbers, as the skip rules and the prompt need them. */
export interface ShapeCommitInfo {
  hash: string;
  subject?: string | undefined;
  added: number;
  removed: number;
  files: readonly string[];
}

/** Files whose change never needs a Shape on its own (tests, locks, notes). */
const SKIP_FILES =
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|Pipfile\.lock|composer\.lock|go\.sum|CHANGELOG\.md|VERSION)$/i;

/** Files a release commit changes and nothing else. */
const RELEASE_FILES = /(^|\/)(package\.json|VERSION|CHANGELOG\.md)$/i;

/** "chore(release): 0.25.0", "Release 0.25.0", "v0.25.0". */
const RELEASE_SUBJECT = /^(chore\(release\)|release\b|v?\d+\.\d+\.\d+\b)/i;

/** Below this many changed lines, a Shape would be longer than the change. */
export const SHAPE_MIN_LINES = 5;

function releaseCommit(commit: ShapeCommitInfo): boolean {
  if (commit.files.length === 0) return /^chore\(release\)/i.test(commit.subject ?? "");
  if (commit.files.every((file) => SKIP_FILES.test(file))) return true;
  return (
    commit.files.every((file) => RELEASE_FILES.test(file)) &&
    RELEASE_SUBJECT.test(commit.subject ?? "")
  );
}

/**
 * Whether a message's commits earn a Shape: not release/version bumps,
 * lockfiles or CHANGELOG alone, and at least {@link SHAPE_MIN_LINES} changed
 * lines in total. A threshold, not a judgement about the code.
 */
export function shapeWanted(commits: readonly ShapeCommitInfo[]): {
  wanted: boolean;
  reason: string;
} {
  if (commits.length === 0) return { wanted: false, reason: "no commits" };
  const lines = commits.reduce((sum, commit) => sum + commit.added + commit.removed, 0);
  if (lines < SHAPE_MIN_LINES)
    return { wanted: false, reason: `only ${lines} changed line${lines === 1 ? "" : "s"}` };
  if (commits.every(releaseCommit))
    return { wanted: false, reason: "release, lockfile or changelog changes only" };
  return { wanted: true, reason: "" };
}

/** How much of the diff the side writer reads; enough to name the path, not the file. */
export const SHAPE_DIFF_LIMIT = 7000;

/** The tool catalogue as the prompt lists it. */
export function toolCatalogue(): string {
  return SHAPE_TOOLS.map(
    (tool) =>
      `- "${tool.kind}" (${tool.name}): ${tool.when}\n  Output: {"kind": "${tool.kind}", "text": "..."}`,
  ).join("\n");
}

/** The record's Intent for one message, as plain lines. */
function intentLines(node: LineageNode): string[] {
  const lines = [`Title: ${node.title}`];
  if (node.why) lines.push(`Why: ${node.why}`);
  if (node.alternatives?.length)
    lines.push(
      `Rejected: ${node.alternatives
        .map((alt) => `${alt.option}${alt.why ? ` (${alt.why})` : ""}`)
        .join("; ")}`,
    );
  if (node.work?.length) lines.push(`Work: ${node.work.join("; ")}`);
  if (node.agentDecisions?.length)
    lines.push(
      `Agent decisions: ${node.agentDecisions.map((decision) => decision.title).join("; ")}`,
    );
  return lines;
}

/** The prompt the side model answers for one message. */
export function shapePrompt(opts: {
  node: LineageNode;
  commits: readonly ShapeCommitInfo[];
  diff: string;
  diffTruncated: boolean;
  language: string;
}): string {
  const writing = opts.language === "auto" ? "the conversation's language" : opts.language;
  const commitLines = opts.commits.map(
    (commit) =>
      `- ${commit.hash.slice(0, 7)} ${commit.subject ?? ""} (+${commit.added} −${commit.removed}): ${commit.files.join(", ")}`,
  );
  return [
    "You write the Shape of one message in a cogit lineage record: a small representation of what its change does at a glance, so a reviewer can see the intent, the shape and the code in that order.",
    "You get the Intent (from the record) and the Code (the commits and their diff). Write the Shape between them.",
    "",
    "Tools:",
    toolCatalogue(),
    "",
    "Rules:",
    "- Pick the tool that fits; both only when each adds something; none when the change is a small fix not worth a picture.",
    `- Name real functions, files and modules from the diff. Never invent a path.`,
    `- The Mermaid source must start with "flowchart TD" (or LR) and stay under ${MERMAID_MAX_NODES} nodes; quote labels that hold spaces or punctuation.`,
    "- Describe what the code does now, not the steps of the conversation.",
    `- Write the text in ${writing}; JSON keys stay English. Never write secrets, credentials or personal data.`,
    "",
    "Intent:",
    ...intentLines(opts.node),
    "",
    "Commits:",
    ...commitLines,
    "",
    `Diff${opts.diffTruncated ? " (cut to fit; the commits above are complete)" : ""}:`,
    opts.diff,
    "",
    'Return only one JSON object, no code fences: {"tools": [{"kind": "pseudo", "text": "1. ...\\n2. ..."}]}. Return {"tools": []} when nothing here is worth showing.',
  ].join("\n");
}

/**
 * Parses the side model's answer. Unknown tool kinds are dropped; known ones
 * keep their text, valid or not, so an invalid diagram is never lost.
 */
export function parseShapeAnswer(text: string): ShapeInput | undefined {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1] ?? text;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const tools = (parsed as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) return undefined;
  const known: ShapeInput["tools"] = [];
  for (const tool of tools) {
    if (typeof tool !== "object" || tool === null) continue;
    const { kind, text: body } = tool as { kind?: unknown; text?: unknown };
    if (typeof kind !== "string" || typeof body !== "string") continue;
    if (shapeToolSpec(kind) === undefined) continue;
    if (body.trim() === "" || body.length > 4000) continue;
    known.push({ kind: kind as ShapeKind, text: body });
  }
  return { tools: known.slice(0, 3), commits: [] };
}
