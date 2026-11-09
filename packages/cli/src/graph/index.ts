import { graphify } from "./graphify.js";
import type { GraphEngine } from "./types.js";

/**
 * The code graph engines cogit can read. With one entry it is always graphify;
 * choosing comes with the second engine. Callers ask here and never import an
 * implementation directly.
 */
export const GRAPH_ENGINES: Readonly<Record<string, GraphEngine>> = {
  graphify,
};

export function defaultGraphEngine(): GraphEngine {
  return graphify;
}

export type {
  CodeLinks,
  FileLink,
  GraphEngine,
  GraphRelation,
  GraphStatus,
  RelatedFile,
} from "./types.js";
