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
    // No git name to find: Windows' git reads the global config even without HOME.
    const noGit = { GIT_CONFIG_GLOBAL: join(dir, "none"), GIT_CONFIG_NOSYSTEM: "1" };
    expect(await sessionAuthor(root, { ...noGit, USER: "from-env" })).toBe("from-env");
    expect(await sessionAuthor(root, { ...noGit, USERNAME: "windows-user" })).toBe("windows-user");
    expect(await sessionAuthor(root, noGit)).toBeUndefined();
  });
});
