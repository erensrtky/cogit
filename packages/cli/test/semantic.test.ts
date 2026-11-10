import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildProject } from "../src/commands/build.js";
import { configSet } from "../src/commands/config.js";
import { init } from "../src/commands/init.js";
import { sessionWrite } from "../src/commands/session.js";
import {
  embed,
  MEANING_HITS,
  messageText,
  ollamaUrl,
  SemanticUnavailable,
  searchByMeaning,
  updateIndex,
} from "../src/semantic.js";
import { projectPaths } from "../src/store/paths.js";
import type { LineageViewModel, ViewNode } from "../src/view/model.js";
import { envFor, fakeIo, tempDir } from "./helpers.js";

let root: string;
beforeEach(async () => {
  root = await tempDir();
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A stand-in Ollama: each text becomes a vector of how often it says a few words. */
const WORDS = ["login", "secret", "npm", "map"];
function fakeOllama(log: string[][] = []): typeof fetch {
  return (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { input: string[] };
    log.push(body.input);
    const embeddings = body.input.map((text) =>
      WORDS.map((word) => text.toLowerCase().split(word).length - 1 + 0.01),
    );
    return new Response(JSON.stringify({ embeddings }), { status: 200 });
  }) as typeof fetch;
}

const node = (id: string, title: string, extra: Partial<ViewNode> = {}): ViewNode => ({
  id,
  kind: "message",
  title,
  ...extra,
});
const model = (nodes: ViewNode[]): LineageViewModel =>
  ({
    sessions: [
      {
        sessionId: "s1",
        title: "One",
        messages: [...nodes, { id: "p", kind: "phase", title: "Phase" }],
        chat: [{ id: "h1", at: "", text: "the login page breaks", replies: [], tools: {} }],
      },
    ],
  }) as unknown as LineageViewModel;

describe("ollamaUrl", () => {
  it("reads OLLAMA_HOST the way Ollama does", () => {
    expect(ollamaUrl({})).toBe("http://127.0.0.1:11434");
    expect(ollamaUrl({ OLLAMA_HOST: "  " })).toBe("http://127.0.0.1:11434");
    expect(ollamaUrl({ OLLAMA_HOST: "0.0.0.0" })).toBe("http://0.0.0.0:11434");
    expect(ollamaUrl({ OLLAMA_HOST: "gpu-box:8080" })).toBe("http://gpu-box:8080");
    expect(ollamaUrl({ OLLAMA_HOST: "https://ollama.example" })).toBe(
      "https://ollama.example:11434",
    );
  });
});

describe("embed", () => {
  it("sends texts in batches and returns one vector each", async () => {
    const log: string[][] = [];
    const vectors = await embed(
      Array.from({ length: 40 }, (_, i) => `text ${i}`),
      "m",
      {},
      fakeOllama(log),
    );
    expect(vectors).toHaveLength(40);
    expect(log.map((batch) => batch.length)).toEqual([32, 8]);
  });

  it("says what to do when Ollama is down, the model is missing or something else fails", async () => {
    const down = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    await expect(embed(["x"], "m", {}, down)).rejects.toThrow(/not answering.*ollama serve/);
    const missing = (async () =>
      new Response(JSON.stringify({ error: 'model "m" not found, try pulling it first' }), {
        status: 404,
      })) as typeof fetch;
    await expect(embed(["x"], "m", {}, missing)).rejects.toThrow("Run `ollama pull m`");
    const broken = (async () => new Response("oops", { status: 500 })) as typeof fetch;
    const error = await embed(["x"], "m", {}, broken).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(SemanticUnavailable);
    expect((error as Error).message).toContain("HTTP 500");
  });
});

describe("messageText", () => {
  it("joins the record and the user's words, and skips what is empty", () => {
    const text = messageText(
      node("h1", "Fix login", {
        summary: "Done",
        why: " ",
        alternatives: [{ option: "Rewrite", why: "too big" }],
        agentDecisions: [{ title: "Kept the API", why: "" }],
        branch: { title: "Auth", asked: "", outcome: "", open: "" },
      }),
      {
        id: "h1",
        at: "",
        text: "the login page breaks",
        replies: [],
        tools: { commands: 0, files: [], other: 0 },
      },
    );
    expect(text.split("\n")).toEqual([
      "Fix login",
      "Done",
      "Rewrite",
      "Kept the API",
      "Auth",
      "the login page breaks",
    ]);
    expect(messageText(node("h2", "x".repeat(3000)), undefined)).toHaveLength(2000);
  });
});

describe("the index", () => {
  it("fingerprints new and changed messages only and drops removed ones", async () => {
    const log: string[][] = [];
    const first = await updateIndex(
      root,
      model([node("h1", "Login"), node("h2", "Secret")]),
      "m",
      {},
      fakeOllama(log),
    );
    expect(first).toEqual({ sent: 2, total: 2 });
    expect(
      await updateIndex(
        root,
        model([node("h1", "Login"), node("h2", "Secret")]),
        "m",
        {},
        fakeOllama(log),
      ),
    ).toEqual({ sent: 0, total: 2 });
    expect(
      await updateIndex(
        root,
        model([node("h1", "Login"), node("h3", "npm")]),
        "m",
        {},
        fakeOllama(log),
      ),
    ).toEqual({ sent: 1, total: 2 });
    expect(await updateIndex(root, model([node("h1", "Login")]), "m", {}, fakeOllama(log))).toEqual(
      {
        sent: 0,
        total: 1,
      },
    );
    // Another model starts over.
    expect(
      await updateIndex(root, model([node("h1", "Login")]), "other", {}, fakeOllama(log)),
    ).toEqual({ sent: 1, total: 1 });
    // A broken file starts over too.
    await writeFile(projectPaths(root).embeddings, "{broken");
    expect(
      await updateIndex(root, model([node("h1", "Login")]), "other", {}, fakeOllama(log)),
    ).toEqual({ sent: 1, total: 1 });
  });

  it("ranks the closest messages first and leaves the far ones out", async () => {
    await updateIndex(
      root,
      model([node("h1", "Login"), node("h2", "Secret secret"), node("h3", "npm map")]),
      "m",
      {},
      fakeOllama(),
    );
    const hits = await searchByMeaning(root, "login", "m", {}, fakeOllama());
    expect(hits[0]).toMatchObject({ sessionId: "s1", messageId: "h1" });
    expect(hits.map((hit) => hit.messageId)).not.toContain("h2");
    expect(hits.length).toBeLessThanOrEqual(MEANING_HITS);
  });

  it("says so when nothing is fingerprinted yet", async () => {
    await expect(searchByMeaning(root, "login", "m", {}, fakeOllama())).rejects.toThrow(
      /Fingerprinting the messages/,
    );
  });
});

describe("the map build", () => {
  it("warns instead of failing when Ollama cannot answer", async () => {
    const env = { ...envFor(root), OLLAMA_HOST: "127.0.0.1:9" };
    const project = join(root, "proj");
    await mkdir(project, { recursive: true });
    await init(project, { retention: "keep", language: "auto" }, fakeIo(env));
    await configSet("semanticSearch", "true", fakeIo(env));
    await sessionWrite({ dir: project }, fakeIo(env), async () =>
      JSON.stringify({ sessionId: "s1", nodes: [{ id: "m1", kind: "message", title: "First" }] }),
    );
    const io = fakeIo(env);
    await expect(buildProject({ dir: project, io, quiet: true })).resolves.toBeDefined();
    expect(io.warnings.join("\n")).toMatch(/search by meaning: Ollama is not answering/);
  });
});
