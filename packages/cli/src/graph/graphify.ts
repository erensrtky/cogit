import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { delimiter, isAbsolute, join, relative, sep } from "node:path";
import { atomicWriteJson, readJson } from "../store/fs.js";
import { projectPaths } from "../store/paths.js";
import type { FileLink, GraphEngine, GraphStatus, RelatedFile } from "./types.js";

/**
 * graphify (https://github.com/safishamsi/graphify) writes the graph to
 * `graphify-out/graph.json` at the project root: nodes carry the file they
 * come from, links say how they relate. Only `imports` links are read: they
 * come straight from the code, while `calls` across files are partly guessed.
 */
const GRAPH = join("graphify-out", "graph.json");
const LINK_RELATIONS = new Set(["imports", "imports_from"]);
const INDEX_SCHEMA = 1;

/** Per file: what it imports and what imports it, project-relative. */
interface GraphIndex {
  schema: number;
  /** The graph file this was cut from; a change in either rebuilds it. */
  mtimeMs: number;
  size: number;
  builtAt?: string;
  links: Record<string, { imports: string[]; importedBy: string[] }>;
}

interface RawGraph {
  nodes?: { id?: unknown; source_file?: unknown }[];
  links?: { source?: unknown; target?: unknown; relation?: unknown }[];
  built_at_commit?: unknown;
}

/** A graph path as a project path, or undefined when it points outside the project. */
function projectFile(root: string, path: string): string | undefined {
  const rel = isAbsolute(path) ? relative(root, path) : path;
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return undefined;
  return rel.split(sep).join("/");
}

/** Cuts graphify's graph down to file-to-file import links. */
export function indexGraph(root: string, raw: RawGraph): Omit<GraphIndex, "mtimeMs" | "size"> {
  const fileOf = new Map<string, string>();
  for (const node of raw.nodes ?? []) {
    if (typeof node.id !== "string" || typeof node.source_file !== "string") continue;
    const file = projectFile(root, node.source_file);
    if (file !== undefined) fileOf.set(node.id, file);
  }
  const imports = new Map<string, Set<string>>();
  const importedBy = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, key: string, value: string): void => {
    const set = map.get(key) ?? new Set<string>();
    set.add(value);
    map.set(key, set);
  };
  for (const link of raw.links ?? []) {
    if (typeof link.relation !== "string" || !LINK_RELATIONS.has(link.relation)) continue;
    const from = typeof link.source === "string" ? fileOf.get(link.source) : undefined;
    const to = typeof link.target === "string" ? fileOf.get(link.target) : undefined;
    if (from === undefined || to === undefined || from === to) continue;
    add(imports, from, to);
    add(importedBy, to, from);
  }
  const links: GraphIndex["links"] = {};
  for (const file of [...new Set([...imports.keys(), ...importedBy.keys()])].sort())
    links[file] = {
      imports: [...(imports.get(file) ?? [])].sort(),
      importedBy: [...(importedBy.get(file) ?? [])].sort(),
    };
  return {
    schema: INDEX_SCHEMA,
    ...(typeof raw.built_at_commit === "string" ? { builtAt: raw.built_at_commit } : {}),
    links,
  };
}

/**
 * The index for the graph as it is now: the cached one while the graph file is
 * unchanged, else rebuilt and cached. Undefined when there is no readable graph.
 */
async function loadIndex(root: string): Promise<GraphIndex | undefined> {
  const graphFile = join(root, GRAPH);
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(graphFile);
  } catch {
    return undefined;
  }
  const cacheFile = projectPaths(root).graphIndex;
  const cached = await readJson(cacheFile).catch(() => ({ found: false }) as const);
  if (cached.found && "value" in cached) {
    const index = cached.value as GraphIndex;
    if (
      index?.schema === INDEX_SCHEMA &&
      index.mtimeMs === info.mtimeMs &&
      index.size === info.size
    )
      return index;
  }
  let raw: RawGraph;
  try {
    raw = JSON.parse(await readFile(graphFile, "utf8")) as RawGraph;
  } catch {
    return undefined;
  }
  const index: GraphIndex = { ...indexGraph(root, raw), mtimeMs: info.mtimeMs, size: info.size };
  // A cache that cannot be written only costs the next call a re-read.
  await atomicWriteJson(cacheFile, index).catch(() => undefined);
  return index;
}

/** True when `name` is an executable file in one of PATH's directories. */
async function onPath(name: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  for (const dir of (env.PATH ?? "").split(delimiter)) {
    if (dir === "") continue;
    try {
      await access(join(dir, name), constants.X_OK);
      return true;
    } catch {
      // not here
    }
  }
  return false;
}

export const graphify: GraphEngine = {
  name: "graphify",
  installCommand: "uv tool install graphifyy",
  buildCommand: ["graphify", "update", "."],

  async status(root: string, env: NodeJS.ProcessEnv = process.env): Promise<GraphStatus> {
    const index = await loadIndex(root);
    return {
      installed: await onPath("graphify", env),
      graph: index !== undefined,
      ...(index?.builtAt === undefined ? {} : { builtAt: index.builtAt }),
    };
  },

  async related(root: string, file: string): Promise<RelatedFile[] | undefined> {
    const index = await loadIndex(root);
    if (index === undefined) return undefined;
    const entry = index.links[file];
    if (entry === undefined) return [];
    return [
      ...entry.imports.map((other) => ({ file: other, relation: "imports" as const })),
      ...entry.importedBy.map((other) => ({ file: other, relation: "imported-by" as const })),
    ];
  },

  async links(root: string, files: readonly string[]): Promise<FileLink[] | undefined> {
    const index = await loadIndex(root);
    if (index === undefined) return undefined;
    const wanted = new Set(files);
    const out: FileLink[] = [];
    for (const from of files)
      for (const to of index.links[from]?.imports ?? []) if (wanted.has(to)) out.push({ from, to });
    return out;
  },
};
