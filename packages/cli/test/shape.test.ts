import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { configSet } from "../src/commands/config.js";
import { init } from "../src/commands/init.js";
import { sessionWrite } from "../src/commands/session.js";
import { needsShape, nextShapeNode } from "../src/commands/shape.js";
import type { LineageNode } from "../src/schema/session.js";
import {
  parseShapeAnswer,
  SHAPE_DIFF_LIMIT,
  shapePrompt,
  shapeWanted,
  stampShape,
  toolCatalogue,
  validateShapeTools,
} from "../src/shape.js";
import { loadSession } from "../src/store/stores.js";
import { envFor, fakeIo, T0, tempDir } from "./helpers.js";

const PSEUDO = "1. Read the record\n2. Merge the node";

function message(overrides: Partial<LineageNode> = {}): LineageNode {
  return {
    id: "h000000000001",
    kind: "message",
    title: "Do the thing",
    parent: null,
    ...overrides,
  };
}

describe("the Shape tool catalogue", () => {
  it("accepts numbered steps and rejects a paragraph", () => {
    const [tool] = validateShapeTools([
      { kind: "pseudo", text: PSEUDO },
      { kind: "pseudo", text: "A single sentence." },
    ]);
    expect(tool?.valid).toBe(true);
    expect(validateShapeTools([{ kind: "pseudo", text: "A single sentence." }])[0]?.valid).toBe(
      false,
    );
  });

  it("accepts a small flowchart and rejects a map, a script or a stamp", () => {
    const ok = "flowchart TD\n  A[User] --> B[Session]\n  B --> C[Record]";
    expect(validateShapeTools([{ kind: "mermaid", text: ok }])[0]?.valid).toBe(true);
    for (const bad of [
      "graph TD",
      "not a diagram",
      "flowchart TD\n  A --> B\n<script>x</script>",
      `flowchart TD\n${Array.from({ length: 16 }, (_, i) => `  n${i} --> n${i + 1}`).join("\n")}`,
    ]) {
      expect(validateShapeTools([{ kind: "mermaid", text: bad }])[0]?.valid).toBe(false);
    }
  });

  it("names both tools and says when to use each", () => {
    const catalogue = toolCatalogue();
    expect(catalogue).toContain('"pseudo"');
    expect(catalogue).toContain('"mermaid"');
    expect(catalogue).toContain("15 nodes");
    expect(catalogue).toContain('{"kind": "pseudo"');
    expect(catalogue).toContain('{"kind": "mermaid"');
  });

  it("stamps who wrote it, when, and each answer's validity", () => {
    const shape = stampShape(
      {
        tools: [
          { kind: "pseudo", text: PSEUDO },
          { kind: "mermaid", text: "nope" },
        ],
        commits: ["abc1234", "abc1234"],
      },
      "side",
      T0,
    );
    expect(shape.by).toBe("side");
    expect(shape.at).toBe(T0);
    expect(shape.commits).toEqual(["abc1234"]);
    expect(shape.tools.map((tool) => tool.valid)).toEqual([true, false]);
    // The refused output keeps its text; the map shows it as source.
    expect(shape.tools[1]?.text).toBe("nope");
  });
});

describe("the Shape skip rules", () => {
  const base = {
    hash: "a".repeat(40),
    subject: "feat: x",
    added: 20,
    removed: 2,
    files: ["src/a.ts"],
  };

  it("wants a Shape for a normal change", () => {
    expect(shapeWanted([base])).toEqual({ wanted: true, reason: "" });
  });

  it("skips a change under five lines", () => {
    expect(shapeWanted([{ ...base, added: 3, removed: 1 }]).wanted).toBe(false);
  });

  it("skips lockfiles, changelog and version bumps on their own", () => {
    expect(
      shapeWanted([{ ...base, added: 900, files: ["package-lock.json", "yarn.lock"] }]).wanted,
    ).toBe(false);
    expect(shapeWanted([{ ...base, added: 30, files: ["CHANGELOG.md"] }]).wanted).toBe(false);
    expect(
      shapeWanted([
        {
          ...base,
          subject: "chore(release): 0.26.0",
          files: ["package.json", "VERSION", "CHANGELOG.md"],
        },
      ]).wanted,
    ).toBe(false);
  });

  it("keeps a release commit when real code came with it", () => {
    expect(
      shapeWanted([
        { ...base, subject: "chore(release): 0.26.0", files: ["package.json", "VERSION"] },
        { ...base, added: 30, files: ["src/shape.ts"] },
      ]).wanted,
    ).toBe(true);
  });
});

describe("the side writer's answer", () => {
  it("parses fenced JSON and drops unknown or empty tools", () => {
    const answer = parseShapeAnswer(
      '```json\n{"tools":[{"kind":"pseudo","text":"1. a\\n2. b"},{"kind":"uml","text":"x"},{"kind":"mermaid","text":""}]}\n```',
    );
    expect(answer?.tools).toEqual([{ kind: "pseudo", text: "1. a\n2. b" }]);
  });

  it("returns undefined for text without a tools list", () => {
    expect(parseShapeAnswer("no json here")).toBeUndefined();
    expect(parseShapeAnswer('{"tools": "nope"}')).toBeUndefined();
  });

  it("shows the record's Intent and says when the diff was cut", () => {
    const prompt = shapePrompt({
      node: message({ why: "Because the queue was blind", work: ["wrote the queue"] }),
      commits: [
        {
          hash: "a".repeat(40),
          subject: "feat: queue",
          added: 20,
          removed: 2,
          files: ["src/q.ts"],
        },
      ],
      diff: "diff --git a/src/q.ts",
      diffTruncated: true,
      language: "tr",
    });
    expect(prompt).toContain("Because the queue was blind");
    expect(prompt).toContain("cut to fit");
    expect(prompt).toContain("Write the text in tr");
    expect(prompt).toContain('"tools": []');
    expect(SHAPE_DIFF_LIMIT).toBeGreaterThan(1000);
  });
});

describe("which messages wait for a Shape", () => {
  it("takes a message with commits and no shape, newest first", () => {
    const nodes = [
      message({ id: "h000000000001", at: "2026-10-31T10:00:00.000Z", commits: ["abc1234"] }),
      message({ id: "h000000000002", at: "2026-10-31T11:00:00.000Z", commits: ["def5678"] }),
      message({ id: "h000000000003" }),
    ];
    expect(nextShapeNode(nodes)?.id).toBe("h000000000002");
  });

  it("wants a new Shape when the message landed more commits", () => {
    const shaped = message({
      commits: ["abc1234", "def5678"],
      shape: { tools: [], commits: ["abc1234"], by: "side", at: T0 },
    });
    expect(needsShape(shaped)).toBe(true);
    expect(
      needsShape({
        ...shaped,
        commits: ["abc1234"],
        shape: { ...shaped.shape!, commits: ["abc1234"] },
      }),
    ).toBe(false);
  });
});

describe("session write stores Shapes", () => {
  let dir: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    dir = await tempDir();
    env = envFor(dir);
    const root = join(dir, "proj");
    await mkdir(root, { recursive: true });
    await init(
      root,
      { retention: "keep", language: "auto", allowSkill: false, projectSettings: false },
      fakeIo(env),
    );
    dir = root;
  });

  it("stamps the writer and keeps an invalid diagram as text", async () => {
    const io = fakeIo(env);
    await sessionWrite({ dir }, io, async () =>
      JSON.stringify({
        sessionId: "s1",
        nodes: [
          {
            id: "m1",
            kind: "message",
            title: "Shape it",
            commits: ["abc1234"],
            shape: { tools: [{ kind: "mermaid", text: "not a flowchart" }], commits: ["abc1234"] },
          },
        ],
      }),
    );
    expect(io.warnings).toContainEqual(
      expect.stringContaining("shape mermaid: the output does not match the tool's format"),
    );
    const loaded = await loadSession(dir, "s1");
    expect(loaded.found && loaded.ok).toBe(true);
    if (!loaded.found || !loaded.ok) return;
    const node = loaded.data.nodes.find((candidate) => candidate.id === "m1");
    expect(node?.shape?.by).toBe("agent");
    expect(node?.shape?.at).toBe(T0);
    expect(node?.shape?.tools[0]).toMatchObject({
      kind: "mermaid",
      text: "not a flowchart",
      valid: false,
    });
  });

  it("writes nothing while shapes are off", async () => {
    const io = fakeIo(env);
    await configSet("shapes", "false", io);
    await sessionWrite({ dir }, io, async () =>
      JSON.stringify({
        sessionId: "s2",
        nodes: [
          {
            id: "m1",
            kind: "message",
            title: "Shape it",
            shape: { tools: [{ kind: "pseudo", text: PSEUDO }], commits: ["abc1234"] },
          },
        ],
      }),
    );
    expect(io.warnings).toContain("shapes are off; the shape was not recorded");
    const loaded = await loadSession(dir, "s2");
    if (!loaded.found || !loaded.ok) throw new Error("session not written");
    expect(loaded.data.nodes[0]?.shape).toBeUndefined();
  });
});
