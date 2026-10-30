import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readConversation, readForkOrigin } from "../src/agents/claude/transcripts.js";
import { withForkParent } from "../src/commands/session.js";
import { messageHash } from "../src/messages.js";
import { tempDir } from "./helpers.js";

/** Messages sent long before the files are written, as a fork's copies are. */
const at = (m: number) => `2026-01-01T10:${String(m).padStart(2, "0")}:00.000Z`;

function user(uuid: string, text: string, m: number, parentUuid: string | null) {
  return JSON.stringify({
    type: "user",
    uuid,
    parentUuid,
    timestamp: at(m),
    message: { role: "user", content: text },
  });
}

function reply(uuid: string, text: string, m: number, parentUuid: string) {
  return JSON.stringify({
    type: "assistant",
    uuid,
    parentUuid,
    timestamp: at(m),
    message: { role: "assistant", content: [{ type: "text", text }] },
  });
}

/** Writes one transcript; a pause first so each file is born after the one before. */
async function transcript(dir: string, id: string, lines: string[]): Promise<string> {
  await new Promise((done) => setTimeout(done, 20));
  const file = join(dir, `${id}.jsonl`);
  await writeFile(file, `${lines.join("\n")}\n`);
  return file;
}

const ONE = [user("u1", "bir", 0, null), reply("a1", "bir", 1, "u1")];
const TWO = [user("u2", "iki", 2, "a1"), reply("a2", "iki", 3, "u2")];
const THREE = [user("u3", "üç", 4, "a2"), reply("a3", "üç", 5, "u3")];

describe("forked transcripts", () => {
  it("leaves a session of its own as it is", async () => {
    const dir = await tempDir();
    // Another session, with a broken user line before its first message.
    await transcript(dir, "other", ['{"type":"user",', user("x1", "başka", 0, null)]);
    const file = await transcript(dir, "orig", [...ONE, ...TWO]);
    expect((await readConversation(file)).map((t) => t.text)).toEqual(["bir", "iki"]);
    expect(await readForkOrigin(file)).toBeNull();
  });

  it("reads only a fork's own messages and names where it was forked", async () => {
    const dir = await tempDir();
    await transcript(dir, "orig", [...ONE, ...TWO]);
    const fork = await transcript(dir, "fork", [...ONE, ...TWO, ...THREE]);
    const turns = await readConversation(fork);
    expect(turns.map((t) => [t.id, t.text])).toEqual([["m1", "üç"]]);
    expect(turns[0]?.resumed).toBeUndefined();
    expect(await readForkOrigin(fork)).toEqual({
      sessionId: "orig",
      copied: 2,
      last: { uuid: "u2", at: at(2), text: "iki" },
    });
  });

  it("names the session that wrote the copies when a fork is forked again", async () => {
    const dir = await tempDir();
    await transcript(dir, "orig", [...ONE]);
    // Forked and not written in yet, then forked again.
    await transcript(dir, "fork1", [...ONE]);
    const fork2 = await transcript(dir, "fork2", [...ONE, ...TWO]);
    expect((await readForkOrigin(fork2))?.sessionId).toBe("orig");
  });

  it("hangs from the fork's own session when the copies end in its messages", async () => {
    const dir = await tempDir();
    await transcript(dir, "orig", [...ONE]);
    await transcript(dir, "fork1", [...ONE, ...TWO]);
    const fork2 = await transcript(dir, "fork2", [...ONE, ...TWO, ...THREE]);
    expect(await readForkOrigin(fork2)).toMatchObject({ sessionId: "fork1", copied: 2 });
  });
});

describe("withForkParent", () => {
  const first = {
    id: "m1",
    label: "m1",
    hash: "h000000000001",
    at: at(4),
    text: "üç",
    replies: [],
  };
  const messages = [{ ...first, tools: { commands: 0, files: [], other: 0 } }];
  const parent = `orig:${messageHash("orig", { uuid: "u2", at: at(2), text: "iki" })}`;
  const node = { id: "h000000000001", kind: "message" as const, title: "üç" };

  it("gives the fork's first message its origin as parent", () => {
    const input = withForkParent({ sessionId: "fork", nodes: [node] }, messages, parent);
    expect(input.nodes?.[0]?.parent).toBe(parent);
  });

  it("keeps a parent the recorder chose and leaves a session of its own alone", () => {
    const chosen = { ...node, parent: "other:h000000000002" };
    expect(
      withForkParent({ sessionId: "fork", nodes: [chosen] }, messages, parent).nodes?.[0]?.parent,
    ).toBe("other:h000000000002");
    expect(
      withForkParent({ sessionId: "s", nodes: [node] }, messages, null).nodes?.[0]?.parent,
    ).toBeUndefined();
  });
});
