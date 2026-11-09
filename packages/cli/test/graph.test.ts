import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import { init } from "../src/commands/init.js";
import { graphify, indexGraph } from "../src/graph/graphify.js";
import { defaultGraphEngine, GRAPH_ENGINES } from "../src/graph/index.js";
import { projectPaths } from "../src/store/paths.js";
import { envFor, fakeIo, tempDir } from "./helpers.js";

const run = promisify(execFile);

/** A graph the way graphify writes it, trimmed to what cogit reads. */
function graphOf(root: string) {
  return {
    built_at_commit: "abc1234",
    nodes: [
      { id: "pr", source_file: "src/pr.ts" },
      { id: "pr_fn", source_file: "src/pr.ts" },
      { id: "thought", source_file: `${root}/src/thought.ts` },
      { id: "log", source_file: "src/log.ts" },
      { id: "old", source_file: "/elsewhere/old-name/src/log.ts" },
      { id: "loose" },
    ],
    links: [
      { source: "pr", target: "thought", relation: "imports_from" },
      { source: "pr_fn", target: "log", relation: "imports" },
      { source: "log", target: "thought", relation: "imports" },
      // Guessed across files, and a path from before the project moved: both left out.
      { source: "thought", target: "log", relation: "calls" },
      { source: "pr", target: "old", relation: "imports" },
      { source: "pr", target: "pr_fn", relation: "imports" },
      { source: "pr", target: "loose", relation: "imports" },
    ],
  };
}

describe("the code graph engine", () => {
  let dir: string;
  let root: string;

  const writeGraph = async (graph: object): Promise<void> => {
    await mkdir(join(root, "graphify-out"), { recursive: true });
    await writeFile(join(root, "graphify-out", "graph.json"), JSON.stringify(graph));
  };

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    await mkdir(join(root, ".cogit", "state"), { recursive: true });
  });

  it("keeps file-to-file import links inside the project", () => {
    const index = indexGraph(root, graphOf(root));
    expect(index.builtAt).toBe("abc1234");
    expect(index.code).toEqual(["src/log.ts", "src/pr.ts", "src/thought.ts"]);
    expect(index.links).toEqual({
      "src/log.ts": { imports: ["src/thought.ts"], importedBy: ["src/pr.ts"] },
      "src/pr.ts": { imports: ["src/log.ts", "src/thought.ts"], importedBy: [] },
      "src/thought.ts": { imports: [], importedBy: ["src/log.ts", "src/pr.ts"] },
    });
    expect(indexGraph(root, {}).links).toEqual({});
  });

  it("answers from a cached index and rebuilds it when the graph changes", async () => {
    expect(await graphify.related(root, "src/pr.ts")).toBeUndefined();

    await writeGraph(graphOf(root));
    expect(await graphify.related(root, "src/log.ts")).toEqual([
      { file: "src/thought.ts", relation: "imports" },
      { file: "src/pr.ts", relation: "imported-by" },
    ]);
    expect(await graphify.related(root, "README.md")).toEqual([]);
    expect(existsSync(projectPaths(root).graphIndex)).toBe(true);

    // A new graph replaces the cache.
    await writeGraph({ nodes: [], links: [] });
    await utimes(join(root, "graphify-out", "graph.json"), new Date(), new Date(Date.now() + 5000));
    expect(await graphify.related(root, "src/log.ts")).toEqual([]);

    // A graph it cannot read is no graph.
    await writeFile(join(root, "graphify-out", "graph.json"), "{not json");
    expect(await graphify.related(root, "src/log.ts")).toBeUndefined();
  });

  it("tells the map which recorded files are code, and the imports among them", async () => {
    expect(await graphify.codeLinks(root, ["src/pr.ts"])).toBeUndefined();
    await writeGraph({
      ...graphOf(root),
      nodes: [
        ...graphOf(root).nodes,
        { id: "readme", source_file: "README.md", file_type: "document" },
      ],
    });
    expect(await graphify.codeLinks(root, ["src/pr.ts", "src/log.ts", "src/thought.ts"])).toEqual({
      files: ["src/pr.ts", "src/log.ts", "src/thought.ts"],
      links: [
        { from: "src/pr.ts", to: "src/log.ts" },
        { from: "src/pr.ts", to: "src/thought.ts" },
        { from: "src/log.ts", to: "src/thought.ts" },
      ],
    });
    // A document, a file the graph does not have (config, a lockfile) and a
    // file the map does not ask about are all left out.
    expect(
      await graphify.codeLinks(root, ["src/pr.ts", "src/log.ts", "README.md", "package.json"]),
    ).toEqual({
      files: ["src/pr.ts", "src/log.ts"],
      links: [{ from: "src/pr.ts", to: "src/log.ts" }],
    });
  });

  it("reports whether the engine is installed and the project has a graph", async () => {
    const bin = join(dir, "bin");
    await mkdir(bin);
    expect(await graphify.status(root, { PATH: bin })).toEqual({ installed: false, graph: false });
    await writeFile(join(bin, "graphify"), "#!/bin/sh\n");
    await chmod(join(bin, "graphify"), 0o755);
    await writeGraph(graphOf(root));
    expect(await graphify.status(root, { PATH: `:${bin}` })).toEqual({
      installed: true,
      graph: true,
      builtAt: "abc1234",
    });
    expect(defaultGraphEngine()).toBe(GRAPH_ENGINES.graphify);
  });
});

describe("init and the code graph", () => {
  let dir: string;
  let root: string;
  let bin: string;

  const setUp = async (): Promise<void> => {
    await run("git", ["-C", root, "init", "-q", "-b", "main"]);
    await run("git", ["-C", root, "config", "user.email", "t@example.com"]);
    await run("git", ["-C", root, "config", "user.name", "Tester"]);
  };

  /** A stand-in graphify: `update .` writes an empty graph, or fails when told to. */
  const installEngine = async (fails = false): Promise<void> => {
    const script = fails
      ? "#!/bin/sh\necho broken >&2\nexit 3\n"
      : '#!/bin/sh\nmkdir -p graphify-out\necho \'{"nodes":[],"links":[]}\' > graphify-out/graph.json\n';
    await writeFile(join(bin, "graphify"), script);
    await chmod(join(bin, "graphify"), 0o755);
  };

  const options = {
    git: "ignore",
    retention: "keep",
    allowSkill: false,
    projectSettings: false,
  } as const;

  beforeEach(async () => {
    dir = await tempDir();
    root = join(dir, "proj");
    bin = join(dir, "bin");
    await mkdir(root);
    await mkdir(bin);
    await setUp();
  });

  it("only mentions the engine when it is not installed", async () => {
    const io = fakeIo({ ...envFor(dir), PATH: bin });
    await init(root, options, io);
    expect(io.lines.join("\n")).toContain("Optional: with graphify (`uv tool install graphifyy`");
    expect(existsSync(join(root, "graphify-out"))).toBe(false);
  });

  it("builds the graph only when asked, and says how it stays fresh", async () => {
    await installEngine();
    const env = { ...envFor(dir), PATH: `${bin}:${process.env.PATH ?? ""}` };
    // The default answer is no.
    const quiet = fakeIo(env);
    await init(root, options, quiet);
    expect(existsSync(join(root, "graphify-out"))).toBe(false);
    expect(quiet.asked.join("\n")).toContain("Build this project's code graph with graphify now");

    const other = join(dir, "other");
    await mkdir(other);
    root = other;
    await setUp();
    const io = fakeIo(env);
    await init(root, { ...options, graph: true }, io);
    expect(JSON.parse(await readFile(join(root, "graphify-out", "graph.json"), "utf8"))).toEqual({
      nodes: [],
      links: [],
    });
    expect(io.lines.join("\n")).toContain(
      "keep it fresh your way (by hand, or `graphify hook install`)",
    );
  });

  it("finds a graph already there, and warns when the build fails", async () => {
    await mkdir(join(root, "graphify-out"));
    await writeFile(join(root, "graphify-out", "graph.json"), '{"nodes":[],"links":[]}');
    const found = fakeIo({ ...envFor(dir), PATH: bin });
    await init(root, options, found);
    expect(found.lines.join("\n")).toContain("Found a graphify graph");

    await installEngine(true);
    const other = join(dir, "other");
    await mkdir(other);
    root = other;
    await setUp();
    const io = fakeIo({ ...envFor(dir), PATH: `${bin}:${process.env.PATH ?? ""}` });
    await init(root, { ...options, graph: true }, io);
    expect(io.warnings.join("\n")).toContain("could not build the graphify graph");
  });
});
