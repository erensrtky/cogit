/**
 * The boundary between cogit and a code graph engine: a tool that knows which
 * files of a project use which. cogit never builds or refreshes the graph; it
 * reads what the engine left, so a project without one works as before. The
 * first implementation is graphify (`graph/graphify.ts`); another engine adds a
 * file and an entry in {@link GRAPH_ENGINES} (`graph/index.ts`).
 */

/** How one file relates to another in the code graph. */
export type GraphRelation = "imports" | "imported-by";

/** A file the graph links to the one asked about, as a project-relative path. */
export interface RelatedFile {
  file: string;
  relation: GraphRelation;
}

/** One file importing another, both project-relative. */
export interface FileLink {
  from: string;
  to: string;
}

/** The code files among those asked about, and the imports between them. */
export interface CodeLinks {
  files: string[];
  links: FileLink[];
}

/** What an engine can say about a project, for `init` and `doctor`. */
export interface GraphStatus {
  /** The engine's command is on PATH. */
  installed: boolean;
  /** The project has a graph the engine wrote. */
  graph: boolean;
  /** The commit the graph was built at, when the engine records it. */
  builtAt?: string;
}

export interface GraphEngine {
  /** Shown to the user: "graphify". */
  name: string;
  /** How to install it, for a hint; cogit never installs it. */
  installCommand: string;
  /** How to build a project's graph, run from the project root. */
  buildCommand: string[];
  status(root: string, env?: NodeJS.ProcessEnv): Promise<GraphStatus>;
  /**
   * The files the graph links to `file` (project-relative, `/`-separated), or
   * undefined when there is no graph to ask. Never throws: a graph it cannot
   * read is no graph.
   */
  related(root: string, file: string): Promise<RelatedFile[] | undefined>;
  /**
   * For the map's Graph view: which of `files` the graph has as code, and the
   * import links among those (`from` imports `to`); undefined when there is no
   * graph to ask. Never throws.
   */
  codeLinks(root: string, files: readonly string[]): Promise<CodeLinks | undefined>;
}
