import { readFile, stat, truncate } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { appendConversationTurns, readConversationStore } from "../src/store/conversations.js";
import { projectPaths } from "../src/store/paths.js";
import type { ChatTurn } from "../src/transcript.js";
import { tempDir } from "./helpers.js";

function turn(uuid: string | undefined, text: string, replies: string[] = []): ChatTurn {
  return {
    id: "m1",
    at: "2026-10-24T10:00:00.000Z",
    text,
    ...(uuid === undefined ? {} : { uuid }),
    replies,
    tools: { commands: 1, files: ["src/a.ts"], other: 0 },
  };
}

describe("conversation store", () => {
  it("is empty when the session was never stored", async () => {
    expect(await readConversationStore(await tempDir(), "s1")).toEqual([]);
  });

  it("appends only turns it does not hold yet, one gzip member at a time", async () => {
    const root = await tempDir();
    expect(await appendConversationTurns(root, "s1", [turn("u1", "one"), turn("u2", "two")])).toBe(
      2,
    );
    expect(
      await appendConversationTurns(root, "s1", [turn("u2", "two"), turn("u3", "three")]),
    ).toBe(1);
    expect((await readConversationStore(root, "s1")).map((t) => [t.uuid, t.text])).toEqual([
      ["u1", "one"],
      ["u2", "two"],
      ["u3", "three"],
    ]);

    const bytes = await readFile(projectPaths(root).conversation("s1"));
    expect([...bytes.subarray(0, 2)]).toEqual([0x1f, 0x8b]);
    // The second append is a second gzip member after the first, not a rewrite.
    expect(await appendConversationTurns(root, "s1", [turn("u1", "one")])).toBe(0);
  });

  it("redacts secrets before writing and keeps the tool summary", async () => {
    const root = await tempDir();
    await appendConversationTurns(root, "s1", [
      turn("u1", "deploy with sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123", [
        "token: ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      ]),
    ]);
    const [stored] = await readConversationStore(root, "s1");
    expect(stored?.text).toBe("deploy with [REDACTED]");
    expect(stored?.replies).toEqual(["token: [REDACTED]"]);
    expect(stored?.tools).toEqual({ commands: 1, files: ["src/a.ts"], other: 0 });
  });

  it("keeps the complete turns before a half-written last member", async () => {
    const root = await tempDir();
    await appendConversationTurns(root, "s1", [turn("u1", "one")]);
    const complete = (await stat(projectPaths(root).conversation("s1"))).size;
    await appendConversationTurns(root, "s1", [turn("u2", "two")]);
    const withSecond = (await stat(projectPaths(root).conversation("s1"))).size;
    // A killed process leaves the second member cut in the middle.
    await truncate(
      projectPaths(root).conversation("s1"),
      complete + Math.floor((withSecond - complete) / 2),
    );
    expect((await readConversationStore(root, "s1")).map((t) => t.text)).toEqual(["one"]);
  });

  it("skips a turn without a transcript uuid, because it cannot be recognised again", async () => {
    const root = await tempDir();
    expect(await appendConversationTurns(root, "s1", [turn(undefined, "no uuid")])).toBe(0);
    expect(await readConversationStore(root, "s1")).toEqual([]);
  });
});
