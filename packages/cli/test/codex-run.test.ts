import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { codex } from "../src/agents/codex/index.js";
import { codexArgs, codexModel, parseCodexOutput } from "../src/agents/codex/run.js";
import { projectPaths } from "../src/store/paths.js";
import { readSpend } from "../src/store/spend.js";
import { pathWith, tempDir, writeFakeAgent } from "./helpers.js";

let root: string;
beforeEach(async () => {
  root = await tempDir();
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** What `codex exec fork --ephemeral --json` printed on Codex 0.167.1. */
const FORK_OUTPUT = [
  { type: "thread.started", thread_id: "01a1ccf4-c9ed-7801-9a7d-1dd46827307c" },
  { type: "turn.started" },
  {
    type: "item.completed",
    item: { id: "item_0", type: "agent_message", text: "The secret probe word is PELICAN-7." },
  },
  {
    type: "turn.completed",
    usage: {
      input_tokens: 27320,
      cached_input_tokens: 24192,
      cache_write_input_tokens: 0,
      output_tokens: 25,
      reasoning_output_tokens: 0,
    },
  },
]
  .map((event) => JSON.stringify(event))
  .join("\n");

/** What Codex printed for a model a ChatGPT account cannot use; it exited with 1. */
const REFUSED_OUTPUT = [
  { type: "thread.started", thread_id: "t" },
  {
    type: "error",
    message: "The 'haiku' model is not supported when using Codex with a ChatGPT account.",
  },
  {
    type: "turn.failed",
    error: {
      message: "The 'haiku' model is not supported when using Codex with a ChatGPT account.",
    },
  },
]
  .map((event) => JSON.stringify(event))
  .join("\n");

describe("codexModel", () => {
  it("leaves Codex on its own model when the setting names a Claude model", () => {
    for (const model of ["haiku", "Sonnet", "opus", "claude-opus-5-5[1m]", "default", "best"])
      expect(codexModel(model)).toBeUndefined();
  });

  it("passes a Codex model through", () => {
    expect(codexModel("gpt-6-luna")).toBe("gpt-6-luna");
  });
});

describe("codexArgs", () => {
  it("runs a fresh exec with hooks off, read-only, leaving no rollout", () => {
    expect(codexArgs("gpt-6-luna")).toEqual([
      "exec",
      "--sandbox",
      "read-only",
      "--disable",
      "hooks",
      "--ephemeral",
      "--skip-git-repo-check",
      "--json",
      "--model",
      "gpt-6-luna",
      "-",
    ]);
  });

  it("forks the session to read it, with the sandbox before fork, which refuses it", () => {
    const args = codexArgs("haiku", { sessionId: "01a1ccb4", cwd: root });
    expect(args.slice(0, 4)).toEqual(["exec", "--sandbox", "read-only", "fork"]);
    expect(args.slice(-2)).toEqual(["01a1ccb4", "-"]);
    expect(args).not.toContain("--model");
  });
});

describe("parseCodexOutput", () => {
  it("takes the last reply and keeps cached input apart from fresh input", () => {
    expect(parseCodexOutput(FORK_OUTPUT)).toEqual({
      answer: "The secret probe word is PELICAN-7.",
      spent: {
        usd: 0,
        inputTokens: 3128,
        outputTokens: 25,
        cacheReadTokens: 24192,
        cacheWriteTokens: 0,
      },
    });
  });

  it("says why a turn failed and skips lines that are not JSON", () => {
    expect(parseCodexOutput(`noise\nnull\n${REFUSED_OUTPUT}`)).toEqual({
      error: "The 'haiku' model is not supported when using Codex with a ChatGPT account.",
    });
  });
});

describe("codex.run", () => {
  /** A stand-in codex that notes its arguments and stdin, then prints `stdout` and exits with `code`. */
  async function fakeCodex(stdout: string, code = 0): Promise<NodeJS.ProcessEnv> {
    const bin = join(root, "bin");
    const seen = join(root, "seen.json");
    await writeFakeAgent(
      "codex",
      bin,
      `let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  require("node:fs").writeFileSync(${JSON.stringify(seen)}, JSON.stringify({ args: process.argv.slice(2), input, disabled: process.env.COGIT_DISABLE }));
  process.stdout.write(${JSON.stringify(stdout)});
  process.exit(${code});
});
`,
    );
    return { PATH: pathWith(bin) };
  }

  it("answers with the reply, notes the tokens and keeps cogit's hooks off", async () => {
    const env = await fakeCodex(FORK_OUTPUT);
    const answer = await codex.run(
      "the prompt",
      "haiku",
      env,
      { sessionId: "01a1ccb4", cwd: root },
      { root, kind: "review" },
    );
    expect(answer).toBe("The secret probe word is PELICAN-7.");
    const seen = JSON.parse(await readFile(join(root, "seen.json"), "utf8"));
    expect(seen).toMatchObject({ input: "the prompt", disabled: "1" });
    expect(seen.args).toContain("fork");
    expect(await readSpend(root)).toMatchObject({ runs: 1, usd: 0, outputTokens: 25 });
    const entry = JSON.parse(await readFile(projectPaths(root).spend, "utf8"));
    expect(entry).toMatchObject({ kind: "review", model: "codex" });
  });

  it("names the model it was given in the spend log", async () => {
    const env = await fakeCodex(FORK_OUTPUT);
    await codex.run("p", "gpt-6-luna", env, undefined, { root, kind: "side" });
    const entry = JSON.parse(await readFile(projectPaths(root).spend, "utf8"));
    expect(entry).toMatchObject({ kind: "side", model: "gpt-6-luna" });
  });

  it("says why Codex refused, from its stdout", async () => {
    const env = await fakeCodex(REFUSED_OUTPUT, 1);
    await expect(codex.run("p", "gpt-x", env)).rejects.toThrow(
      "codex failed: The 'haiku' model is not supported",
    );
  });

  it("keeps the exit error when Codex said nothing on stdout", async () => {
    const env = await fakeCodex("", 3);
    await expect(codex.run("p", "gpt-x", env)).rejects.toThrow(/codex exited with 3/);
  });

  it("refuses a run that wrote no reply", async () => {
    const env = await fakeCodex(JSON.stringify({ type: "turn.completed", usage: {} }));
    await expect(codex.run("p", "gpt-x", env)).rejects.toThrow("codex returned no reply");
  });
});
