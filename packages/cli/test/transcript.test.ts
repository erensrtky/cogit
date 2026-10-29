import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHAT_TEXT_LIMIT,
  displayTurn,
  excerpt,
  findTranscript,
  messageText,
  readConversation,
  readsHandoff,
  readUserMessages,
} from "../src/agents/claude/transcripts.js";
import { envFor, tempDir } from "./helpers.js";

const at = (m: number) => `2026-10-23T10:${String(m).padStart(2, "0")}:00.000Z`;

/** A user line as Claude Code writes it. */
function user(content: unknown, extra: Record<string, unknown> = {}, m = 0) {
  return { type: "user", timestamp: at(m), message: { role: "user", content }, ...extra };
}

describe("messageText", () => {
  it.each([
    [
      "typed text",
      user("Continue with Epic 4", { origin: { kind: "human" } }),
      "Continue with Epic 4",
    ],
    ["text and image blocks", user([{ type: "text", text: "look" }, { type: "image" }]), "look"],
    ["an image alone", user([{ type: "image" }]), "[image]"],
    [
      "a slash command with arguments",
      user("<command-name>/create-story</command-name><command-args>4.5</command-args>"),
      "/create-story 4.5",
    ],
  ])("keeps %s", (_, line, text) => {
    expect(messageText(line)).toBe(text);
  });

  it.each([
    ["an assistant line", { type: "assistant", message: { content: "x" } }],
    ["a tool result", user([{ type: "tool_result", content: "out" }])],
    ["injected skill text", user([{ type: "text", text: "Base directory" }], { isMeta: true })],
    ["a compaction summary", user("This session is being continued", { isCompactSummary: true })],
    ["a subagent turn", user("task", { isSidechain: true })],
    ["a non-human origin", user("note", { origin: { kind: "task-notification" } })],
    ["shell input", user("<bash-input>ls</bash-input>")],
    ["shell output", user("<bash-stdout>x</bash-stdout><bash-stderr></bash-stderr>")],
    ["local command output", user("<local-command-stdout>Bye</local-command-stdout>")],
    ["an interrupt notice", user("[Request interrupted by user]")],
    [
      "an interrupt notice for a tool use",
      user([{ type: "text", text: "[Request interrupted by user for tool use]" }]),
    ],
    ["a slash command without arguments", user("<command-name>/exit</command-name>")],
    ["empty text", user("   ")],
    ["content of another shape", user({ text: "x" })],
  ])("drops %s", (_, line) => {
    expect(messageText(line)).toBeNull();
  });
});

describe("readUserMessages", () => {
  it("numbers the typed messages in order and skips broken lines", async () => {
    const dir = await tempDir();
    const file = join(dir, "s1.jsonl");
    const lines = [
      JSON.stringify(user("first", {}, 1)),
      JSON.stringify({ type: "assistant", timestamp: at(2), message: { content: [] } }),
      JSON.stringify(user("[Request interrupted by user for tool use]", {}, 3)),
      JSON.stringify(user([{ type: "tool_result", content: "x" }], {}, 3)),
      '{"type":"user", broken',
      JSON.stringify(user("second", {}, 4)),
    ];
    await writeFile(file, `${lines.join("\n")}\n`);
    expect(await readUserMessages(file)).toEqual([
      { id: "m1", at: at(1), text: "first" },
      { id: "m2", at: at(4), text: "second" },
    ]);
  });
});

describe("readConversation", () => {
  it("gives each message the agent's written replies and counts its tools", async () => {
    const dir = await tempDir();
    const file = join(dir, "s1.jsonl");
    const agent = (content: unknown[], extra: Record<string, unknown> = {}) => ({
      type: "assistant",
      message: { content },
      ...extra,
    });
    const lines = [
      agent([{ type: "text", text: "before any message" }]),
      user("first", {}, 1),
      agent([{ type: "text", text: "Looking." }]),
      agent([{ type: "tool_use", name: "Bash", input: { command: "ls" } }]),
      agent([{ type: "tool_use", name: "Edit", input: { file_path: "/p/a.ts" } }]),
      agent([{ type: "tool_use", name: "Write", input: { file_path: "/p/a.ts" } }]),
      agent([{ type: "tool_use", name: "Edit", input: {} }]),
      agent([{ type: "tool_use", name: "Read", input: { file_path: "/p/b.ts" } }]),
      agent([{ type: "text", text: "from a subagent" }], { isSidechain: true }),
      agent([{ type: "text", text: "   " }]),
      { type: "assistant", message: { content: "not a list" } },
      user([{ type: "tool_result", content: "x" }], {}, 2),
      agent([{ type: "text", text: "Done." }]),
      user("second", {}, 3),
    ];
    await writeFile(file, lines.map((line) => JSON.stringify(line)).join("\n"));
    const turns = await readConversation(file);
    expect(turns.map((t) => [t.id, t.text, t.replies])).toEqual([
      ["m1", "first", ["Looking.", "Done."]],
      ["m2", "second", []],
    ]);
    expect(turns[0]?.tools).toEqual({ commands: 1, files: ["/p/a.ts"], other: 2 });
  });

  it("keeps the agent's steps and questions for the recorder, and drops them for the map", async () => {
    const file = join(await tempDir(), "s1.jsonl");
    const agent = (content: unknown[]) => ({ type: "assistant", message: { content } });
    const bash = (description?: string) => ({
      type: "tool_use",
      name: "Bash",
      input: { command: "git status", ...(description ? { description } : {}) },
    });
    const lines = [
      user("first", {}, 1),
      agent([bash("Show working tree status"), bash("Show working tree status"), bash()]),
      agent([
        {
          type: "tool_use",
          name: "AskUserQuestion",
          input: {
            questions: [
              { question: "Which order?", options: [{ label: "A" }, { label: "B" }] },
              { options: [] },
            ],
          },
        },
      ]),
    ];
    await writeFile(file, lines.map((line) => JSON.stringify(line)).join("\n"));
    const [turn] = await readConversation(file);
    expect(turn?.tools).toEqual({
      commands: 3,
      files: [],
      other: 1,
      steps: ["Show working tree status"],
      asks: ["Which order? [A | B]"],
    });
    expect(turn && displayTurn(turn, []).tools).toEqual({ commands: 3, files: [], other: 1 });
  });

  it("marks the message after a broken uuid chain as resumed", async () => {
    const file = join(await tempDir(), "s1.jsonl");
    const lines = [
      { ...user("first", { uuid: "u1", parentUuid: null }, 1) },
      {
        type: "assistant",
        uuid: "a1",
        parentUuid: "u1",
        timestamp: at(2),
        message: { content: [] },
      },
      // A resumed process appends a message whose parent is not in this file.
      { ...user("second", { uuid: "u2", parentUuid: "elsewhere" }, 3) },
    ];
    await writeFile(file, lines.map((line) => JSON.stringify(line)).join("\n"));
    const turns = await readConversation(file);
    expect(turns[0]?.resumed).toBeUndefined();
    expect(turns[1]?.resumed).toBe(true);
  });
});

describe("displayTurn", () => {
  const turn = (text: string, replies: string[] = []) => ({
    id: "m1",
    at: at(1),
    text,
    replies,
    tools: { commands: 0, files: ["/p/w/x.ts", "/p/y.ts", "/elsewhere/z.ts"], other: 0 },
  });

  it("drops reminders, labels pastes and shows files relative to the project", () => {
    const shown = displayTurn(
      turn(
        '<system-reminder>hidden</system-reminder>see <pasted_content id="a">log</pasted_content id="a">',
      ),
      ["/p/w", "/p"],
    );
    expect(shown.text).toBe("see \n[Pasted]\nlog\n[/Pasted]");
    expect(shown.tools.files).toEqual(["x.ts", "y.ts", "/elsewhere/z.ts"]);
  });

  it("cuts very long text with a note", () => {
    const long = "x".repeat(CHAT_TEXT_LIMIT + 5);
    const shown = displayTurn(turn(long, [long]), []);
    expect(shown.text).toMatch(/\[… 5 more characters not shown\]$/);
    expect(shown.replies[0]).toMatch(/5 more characters/);
  });
});

describe("findTranscript", () => {
  it("finds the session under any project folder, or returns null", async () => {
    const dir = await tempDir();
    const env = envFor(dir);
    expect(await findTranscript("s1", env)).toBeNull();
    const folder = join(dir, "claude", "projects", "-some-project");
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "s1.jsonl"), "");
    expect(await findTranscript("s1", env)).toBe(join(folder, "s1.jsonl"));
    expect(await findTranscript("s2", env)).toBeNull();
  });
});

describe("readsHandoff", () => {
  const tool = (name: string, input: Record<string, unknown>) =>
    JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: [{ type: "tool_use", name, input }] },
    });

  it("notices a handoff file read with Read or shown with Bash", async () => {
    const dir = await tempDir();
    const read = join(dir, "read.jsonl");
    await writeFile(read, `${tool("Read", { file_path: "/p/handoff-2026-10-24.md" })}\n`);
    expect(await readsHandoff(read)).toBe(true);

    const bash = join(dir, "bash.jsonl");
    await writeFile(bash, `${tool("Bash", { command: "sed -n 1,40p handoff-2026-10-24.md" })}\n`);
    expect(await readsHandoff(bash)).toBe(true);
  });

  it("ignores a transcript without a handoff read", async () => {
    const dir = await tempDir();
    const file = join(dir, "other.jsonl");
    await writeFile(file, `${tool("Read", { file_path: "/p/README.md" })}\n`);
    expect(await readsHandoff(file)).toBe(false);
  });
});

describe("excerpt", () => {
  it("collapses whitespace, names pastes and drops reminders", () => {
    const text =
      'see\n\n<pasted_content id="a">\nError: boom\nat line 2\n</pasted_content>' +
      "<system-reminder>secret context</system-reminder> please";
    expect(excerpt(text)).toBe("see [pasted: Error: boom at line 2…] please");
  });

  it("shows a message that is only a paste as the pasted text", () => {
    const text =
      '\n\n<pasted_content id="a">\n  Continue with\n  Epic 4\n</pasted_content id="a">\n';
    expect(excerpt(text)).toBe("[pasted] Continue with Epic 4");
  });

  it("cuts long text with an ellipsis", () => {
    expect(excerpt("x".repeat(400))).toHaveLength(300);
    expect(excerpt("x".repeat(400)).endsWith("…")).toBe(true);
  });
});
