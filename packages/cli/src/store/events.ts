import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { SessionEvent } from "../schema/events.js";
import type { LineageNode } from "../schema/session.js";
import { projectPaths } from "./paths.js";

/**
 * The per-session structure file: one JSON event per line, appended and never
 * rewritten (Story 8.5). A missing file means the record predates the split and
 * its JSON parents still describe the graph; a present file is the truth.
 */
export async function readEvents(root: string, sessionId: string): Promise<SessionEvent[]> {
  let text: string;
  try {
    text = await readFile(projectPaths(root).events(sessionId), "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw err;
  }
  const events: SessionEvent[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      // A hand-edited or half-written line must not hide the rest of the facts.
      continue;
    }
    const parsed = SessionEvent.safeParse(value);
    if (parsed.success) events.push(parsed.data);
  }
  return events;
}

/** Appends events as JSON lines; nothing to append writes nothing. */
export async function appendEvents(
  root: string,
  sessionId: string,
  events: readonly SessionEvent[],
): Promise<number> {
  if (events.length === 0) return 0;
  const file = projectPaths(root).events(sessionId);
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
  return events.length;
}

export interface Structure {
  parent: string | null;
  links: string[];
}

/** The structure the events describe: last parent wins, link adds, unlink removes. */
export function replayEvents(events: readonly SessionEvent[]): Map<string, Structure> {
  const structure = new Map<string, Structure>();
  const get = (id: string): Structure => {
    const found = structure.get(id);
    if (found) return found;
    const fresh: Structure = { parent: null, links: [] };
    structure.set(id, fresh);
    return fresh;
  };
  for (const event of events) {
    const entry = get(event.msg);
    if (event.type === "parent") {
      entry.parent = event.target;
    } else if (event.type === "link") {
      if (event.target !== null && !entry.links.includes(event.target))
        entry.links.push(event.target);
    } else if (event.target !== null) {
      entry.links = entry.links.filter((link) => link !== event.target);
    }
  }
  return structure;
}

/**
 * Applies the replayed structure to a record's message nodes. Without events the
 * nodes are returned untouched, so an old record keeps rendering from its JSON.
 * With events, a message named by no parent event is a root: the file alone
 * decides the graph.
 */
export function applyEvents(nodes: LineageNode[], events: readonly SessionEvent[]): LineageNode[] {
  if (events.length === 0) return nodes;
  const structure = replayEvents(events);
  return nodes.map((node) => {
    if (node.kind !== "message") return node;
    const entry = structure.get(node.id);
    return {
      ...node,
      parent: entry?.parent ?? null,
      ...(entry && entry.links.length > 0 ? { links: entry.links } : { links: undefined }),
    };
  });
}

/**
 * One `parent` event per message and one `link` event per link of the record as
 * stored, used to seed the file before its first change (a record written before
 * 8.5) and by the migration.
 */
export function seedEvents(nodes: readonly LineageNode[], at: string): SessionEvent[] {
  const events: SessionEvent[] = [];
  for (const node of nodes) {
    if (node.kind !== "message") continue;
    events.push({ at, type: "parent", msg: node.id, target: node.parent ?? null, by: "agent" });
    for (const link of node.links ?? [])
      events.push({ at, type: "link", msg: node.id, target: link, by: "agent" });
  }
  return events;
}
