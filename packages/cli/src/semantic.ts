import { createHash } from "node:crypto";
import { atomicWriteJson, readJson } from "./store/fs.js";
import { projectPaths } from "./store/paths.js";
import type { LineageViewModel, ViewChatTurn, ViewNode } from "./view/model.js";

/**
 * Search by meaning. Each message becomes a fingerprint (an embedding) from the
 * embedding model in the local Ollama; a query is fingerprinted the same way and
 * the closest messages come first. cogit downloads nothing and pays for no model
 * call: Ollama and its model are the user's. The fingerprints live in the
 * project's local state, never shared, and only new or changed messages are
 * sent again.
 */

/** Ollama's address: `OLLAMA_HOST` when set, as Ollama itself reads it. */
export function ollamaUrl(env: NodeJS.ProcessEnv): string {
  const host = env.OLLAMA_HOST?.trim();
  if (host === undefined || host === "") return "http://127.0.0.1:11434";
  const withScheme = /^https?:\/\//.test(host) ? host : `http://${host}`;
  const url = new URL(withScheme);
  if (url.port === "" && !/^https?:\/\/[^/]+:\d+/.test(withScheme)) url.port = "11434";
  return url.origin;
}

/** Why the meaning search cannot run, worded as what to do about it. */
export class SemanticUnavailable extends Error {}

/** The messages are not fingerprinted yet: the build that does it is running or still to come. */
export class NotIndexedYet extends SemanticUnavailable {}

/** How many texts go to Ollama in one request. */
const BATCH = 32;
/** The longest piece of a message's text that is fingerprinted. */
const MAX_TEXT = 2000;

/** Fingerprints `texts` with `model`; throws {@link SemanticUnavailable} with the fix when Ollama cannot. */
export async function embed(
  texts: readonly string[],
  model: string,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<number[][]> {
  const base = ollamaUrl(env);
  const out: number[][] = [];
  for (let at = 0; at < texts.length; at += BATCH) {
    let response: Response;
    try {
      response = await fetchImpl(`${base}/api/embed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, input: texts.slice(at, at + BATCH) }),
      });
    } catch {
      throw new SemanticUnavailable(
        `Ollama is not answering at ${base}. Start it (\`ollama serve\`), or install it from ollama.com.`,
      );
    }
    const body = (await response.json().catch(() => ({}))) as {
      embeddings?: unknown;
      error?: unknown;
    };
    if (!response.ok || !Array.isArray(body.embeddings)) {
      const error = typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
      throw new SemanticUnavailable(
        /not found|pull/i.test(error)
          ? `Ollama has no model ${model}. Run \`ollama pull ${model}\`.`
          : `Ollama could not fingerprint the text: ${error}`,
      );
    }
    out.push(...(body.embeddings as number[][]));
  }
  return out;
}

/** What a message is fingerprinted from: its record and the user's own words. */
export function messageText(node: ViewNode, turn: ViewChatTurn | undefined): string {
  const parts = [
    node.title,
    node.summary,
    node.why,
    ...(node.alternatives ?? []).map((alt) => alt.option),
    ...(node.agentDecisions ?? []).map((decision) => decision.title),
    node.branch?.title,
    turn?.text,
  ];
  return parts
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .join("\n")
    .slice(0, MAX_TEXT);
}

/** A stored fingerprint: the hash of the text it came from, and the vector as base64 float32. */
interface Stored {
  h: string;
  v: string;
}

interface IndexFile {
  model: string;
  items: Record<string, Stored>;
}

const textHash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

function pack(vector: readonly number[]): string {
  return Buffer.from(new Float32Array(vector).buffer).toString("base64");
}

function unpack(value: string): Float32Array {
  const bytes = Buffer.from(value, "base64");
  return new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 4));
}

async function readIndex(root: string, model: string): Promise<IndexFile> {
  try {
    const read = await readJson(projectPaths(root).embeddings);
    if (read.found && "value" in read) {
      const value = read.value as Partial<IndexFile> | null;
      if (value?.model === model && value.items !== null && typeof value.items === "object")
        return { model, items: value.items as Record<string, Stored> };
    }
  } catch {
    // Unreadable: start over.
  }
  return { model, items: {} };
}

/** The key a message's fingerprint is stored under. */
const keyOf = (sessionId: string, messageId: string) => `${sessionId}:${messageId}`;

/**
 * Brings the fingerprints up to date with the built map: new or changed
 * messages are sent to Ollama, removed ones dropped. Returns how many were
 * sent. A changed model starts the index over.
 */
export async function updateIndex(
  root: string,
  model: LineageViewModel,
  embeddingModel: string,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<{ sent: number; total: number }> {
  const index = await readIndex(root, embeddingModel);
  const wanted = new Map<string, { text: string; hash: string }>();
  for (const session of model.sessions) {
    for (const node of session.messages) {
      if (node.kind !== "message") continue;
      const turn = session.chat?.find((candidate) => candidate.id === node.id);
      const text = messageText(node, turn);
      if (text === "") continue;
      wanted.set(keyOf(session.sessionId, node.id), { text, hash: textHash(text) });
    }
  }
  const stale = [...wanted].filter(([key, { hash }]) => index.items[key]?.h !== hash);
  const items: Record<string, Stored> = {};
  for (const [key] of wanted) {
    const kept = index.items[key];
    if (kept !== undefined) items[key] = kept;
  }
  if (stale.length > 0) {
    const vectors = await embed(
      stale.map(([, { text }]) => text),
      embeddingModel,
      env,
      fetchImpl,
    );
    stale.forEach(([key, { hash }], at) => {
      const vector = vectors[at];
      if (vector !== undefined) items[key] = { h: hash, v: pack(vector) };
    });
  }
  const removed = Object.keys(index.items).some((key) => !wanted.has(key));
  if (stale.length > 0 || removed)
    await atomicWriteJson(projectPaths(root).embeddings, { model: embeddingModel, items });
  return { sent: stale.length, total: Object.keys(items).length };
}

/** One message found by meaning, closest first. */
export interface MeaningHit {
  sessionId: string;
  messageId: string;
  /** Cosine similarity, -1 to 1. */
  score: number;
}

/** The most messages a meaning search returns. */
export const MEANING_HITS = 20;
/** How far below the best a hit may score and still count as close. */
const SPREAD = 0.15;
/** Below this a message is not close in meaning, whatever the best is. */
const FLOOR = 0.35;

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/**
 * The messages closest in meaning to `query`: at most {@link MEANING_HITS},
 * none far below the best. Throws {@link SemanticUnavailable} when Ollama
 * cannot answer, or when nothing is indexed yet.
 */
export async function searchByMeaning(
  root: string,
  query: string,
  embeddingModel: string,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<MeaningHit[]> {
  const index = await readIndex(root, embeddingModel);
  const entries = Object.entries(index.items);
  if (entries.length === 0)
    throw new NotIndexedYet(
      "Fingerprinting the messages with Ollama; results by meaning follow in a moment.",
    );
  const [vector] = await embed([query], embeddingModel, env, fetchImpl);
  if (vector === undefined) return [];
  const wanted = new Float32Array(vector);
  const scored = entries
    .map(([key, stored]) => {
      const cut = key.lastIndexOf(":");
      return {
        sessionId: key.slice(0, cut),
        messageId: key.slice(cut + 1),
        score: cosine(wanted, unpack(stored.v)),
      };
    })
    .sort((a, b) => b.score - a.score);
  const best = scored[0]?.score ?? 0;
  const cutoff = Math.max(FLOOR, best - SPREAD);
  return scored.filter((hit) => hit.score >= cutoff).slice(0, MEANING_HITS);
}
