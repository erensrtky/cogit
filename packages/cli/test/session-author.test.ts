import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// A machine without a passwd entry for the running user: `userInfo` throws.
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    userInfo: () => {
      throw new Error("no user entry");
    },
  };
});

import { sessionAuthor } from "../src/commands/session.js";
import { tempDir } from "./helpers.js";

describe("session author fallback", () => {
  it("uses the environment's user when the OS has none", async () => {
    const dir = await tempDir();
    const root = join(dir, "proj");
    await mkdir(root);
    expect(await sessionAuthor(root, { USER: "from-env" })).toBe("from-env");
    expect(await sessionAuthor(root, { USERNAME: "windows-user" })).toBe("windows-user");
    expect(await sessionAuthor(root, {})).toBeUndefined();
  });
});
