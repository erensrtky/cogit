import { CliError, type Io } from "../io.js";
import {
  normalizeQuery,
  type SearchHit,
  type SearchSource,
  searchSources,
} from "../view/search.js";
import { loadEffectiveSessions, openProject, selectSessions, shortHash, stamp } from "./log.js";

/**
 * `codelineage search <text>` (Story 8.14): a linear, case- and accent-sensitive
 * scan over the records and the stored conversation. No model and no index
 * file; the same matcher backs the map's search box (`view/search.ts`).
 */

export interface SearchModel {
  query: string;
  hits: SearchHit[];
}

export interface SearchOptions {
  dir: string;
  io: Io;
  text: string;
  /** Only this session (id or unambiguous prefix). */
  session?: string | undefined;
  /** Maximum hits. */
  limit?: number | undefined;
  json?: boolean | undefined;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** `search` prints one line per hit and its excerpt, newest first. */
export function formatSearch(model: SearchModel): string[] {
  if (model.hits.length === 0) return [`No matches for "${model.query}".`];
  return model.hits.flatMap((hit) => {
    const title = oneLine(hit.sessionTitle) || hit.sessionId;
    const hash = hit.messageId === null ? "(session)" : shortHash(hit.messageId);
    return [
      `${hash}  ${(hit.label ?? "—").padEnd(4)}  ${stamp(hit.at ?? undefined)}  ${hit.field}  ${title}`,
      `  ${hit.excerpt}`,
    ];
  });
}

/** `codelineage search [dir]`; returns the model for tests and JSON callers. */
export async function search(opts: SearchOptions): Promise<SearchModel> {
  const query = opts.text.replace(/\s+/g, " ").trim();
  if (normalizeQuery(opts.text) === "")
    throw new CliError(
      'search needs some text, e.g. `codelineage search "where did we discuss X"`',
    );
  const root = await openProject(opts.dir);
  const sessions = await loadEffectiveSessions(root, opts.io);
  const selected = opts.session === undefined ? sessions : selectSessions(sessions, opts.session);
  const sources: SearchSource[] = selected.map(({ session, messages, turns }) => ({
    sessionId: session.sessionId,
    title: session.title,
    status: session.status,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    messages,
    ...(turns === null
      ? {}
      : {
          chat: turns.map((turn) => ({
            id: turn.hash,
            ...(turn.label === undefined ? {} : { label: turn.label }),
            at: turn.at,
            text: turn.text,
            replies: turn.replies,
            tools: turn.tools,
          })),
        }),
  }));

  const all = searchSources(sources, opts.text);
  const hits = opts.limit === undefined ? all : all.slice(0, opts.limit);
  const model: SearchModel = { query, hits };
  if (opts.json === true) {
    opts.io.out(JSON.stringify(model, null, 2));
    return model;
  }
  for (const line of formatSearch(model)) opts.io.out(line);
  return model;
}
