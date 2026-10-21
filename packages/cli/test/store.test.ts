import { chmod, mkdir, mkdtemp, readdir, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { atomicWrite, atomicWriteJson, readJson } from "../src/store/fs.js";
import { LockBusyError, withLock } from "../src/store/lock.js";
import { globalPaths, projectPaths } from "../src/store/paths.js";
import {
  loadConfig,
  loadProject,
  loadRegistry,
  loadSession,
  updateConfig,
  updateProject,
  updateRegistry,
  updateSession,
} from "../src/store/stores.js";

let dir: string;
let env: NodeJS.ProcessEnv;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "codelineage-"));
  env = { CODELINEAGE_HOME: join(dir, "home") };
});

const T0 = "2026-10-21T10:00:00.000Z";

describe("paths", () => {
  it("resolves the global dir from env", () => {
    expect(globalPaths({ CODELINEAGE_HOME: "/x" }).config).toBe("/x/config.json");
    expect(globalPaths({ XDG_CONFIG_HOME: "/xdg" }).base).toBe("/xdg/codelineage");
    expect(globalPaths({}).base).toMatch(/\.config\/codelineage$/);
  });

  it("lays out the project dir", () => {
    const p = projectPaths("/r");
    expect(p.session("s1")).toBe("/r/.codelineage/sessions/s1.json");
    expect(p.state("s1")).toBe("/r/.codelineage/state/s1.json");
    expect(p.lock("project")).toBe("/r/.codelineage/locks/project.lock");
    expect([p.snapshots, p.html]).toEqual([
      "/r/.codelineage/snapshots",
      "/r/.codelineage/lineage.html",
    ]);
  });
});

describe("fs", () => {
  it("writes atomically without leaving temp files", async () => {
    const f = join(dir, "a", "b.json");
    await atomicWriteJson(f, { x: 1 });
    expect(JSON.parse(await readFile(f, "utf8"))).toEqual({ x: 1 });
    expect(await readdir(join(dir, "a"))).toEqual(["b.json"]);
  });

  it("cleans up the temp file when the rename fails", async () => {
    const target = join(dir, "isdir");
    await mkdir(join(target, "child"), { recursive: true });
    await expect(atomicWrite(target, "x")).rejects.toThrow();
    expect((await readdir(dir)).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });

  it("reads missing, invalid and valid JSON", async () => {
    expect(await readJson(join(dir, "nope.json"))).toEqual({ found: false });
    await writeFile(join(dir, "bad.json"), "{");
    expect(await readJson(join(dir, "bad.json"))).toMatchObject({
      found: true,
      error: /invalid JSON/,
    });
    await writeFile(join(dir, "ok.json"), '{"a":1}');
    expect(await readJson(join(dir, "ok.json"))).toEqual({ found: true, value: { a: 1 } });
    await expect(readJson(dir)).rejects.toThrow();
  });
});

describe("withLock", () => {
  it("serializes concurrent critical sections", async () => {
    const lock = join(dir, "locks", "x.lock");
    let inside = 0;
    let maxInside = 0;
    await Promise.all(
      Array.from({ length: 8 }, () =>
        withLock(lock, async () => {
          inside++;
          maxInside = Math.max(maxInside, inside);
          await new Promise((r) => setTimeout(r, 5));
          inside--;
        }),
      ),
    );
    expect(maxInside).toBe(1);
  });

  it("fails fast when busy and timeout is 0", async () => {
    const lock = join(dir, "x.lock");
    await withLock(lock, async () => {
      await expect(withLock(lock, async () => 1, { timeoutMs: 0 })).rejects.toBeInstanceOf(
        LockBusyError,
      );
    });
  });

  it("releases the lock when fn throws", async () => {
    const lock = join(dir, "x.lock");
    await expect(withLock(lock, async () => Promise.reject(new Error("boom")))).rejects.toThrow(
      "boom",
    );
    expect(await withLock(lock, async () => "free", { timeoutMs: 0 })).toBe("free");
  });

  it("takes over a lock whose owner process is gone", async () => {
    const lock = join(dir, "x.lock");
    await mkdir(lock);
    await writeFile(join(lock, "owner"), "999999999");
    expect(await withLock(lock, async () => "ok", { timeoutMs: 0 })).toBe("ok");
  });

  it("takes over a lock older than staleMs, but not a live recent one", async () => {
    const lock = join(dir, "x.lock");
    await mkdir(lock);
    await writeFile(join(lock, "owner"), "1"); // pid 1 is alive (EPERM for non-root)
    await expect(withLock(lock, async () => 1, { timeoutMs: 0 })).rejects.toBeInstanceOf(
      LockBusyError,
    );
    const old = new Date(Date.now() - 120_000);
    await utimes(lock, old, old);
    expect(await withLock(lock, async () => "ok", { timeoutMs: 0 })).toBe("ok");
  });

  it("treats a recent lock without an owner file as held", async () => {
    const lock = join(dir, "x.lock");
    await mkdir(lock);
    await expect(withLock(lock, async () => 1, { timeoutMs: 0 })).rejects.toBeInstanceOf(
      LockBusyError,
    );
  });

  it("rethrows unexpected mkdir errors", async () => {
    const ro = join(dir, "ro");
    await mkdir(ro);
    await chmod(ro, 0o555);
    await expect(withLock(join(ro, "x.lock"), async () => 1)).rejects.toMatchObject({
      code: "EACCES",
    });
    await chmod(ro, 0o755);
  });
});

describe("stores", () => {
  it("creates and updates project.json under the lock", async () => {
    expect(await loadProject(dir)).toEqual({ found: false });
    await updateProject(dir, (cur) => cur ?? { schema: 1, name: "p", epochs: [] });
    await updateProject(dir, (cur) => ({
      ...(cur ?? { schema: 1, name: "p", epochs: [] }),
      epochs: [{ id: "e1", title: "E", createdAt: T0 }],
    }));
    expect(await loadProject(dir)).toMatchObject({
      found: true,
      ok: true,
      data: { epochs: [{ id: "e1" }] },
    });
  });

  it("never overwrites an unreadable file", async () => {
    const p = projectPaths(dir);
    await mkdir(p.base, { recursive: true });
    await writeFile(p.project, "{broken");
    await expect(updateProject(dir, () => ({ schema: 1, name: "p", epochs: [] }))).rejects.toThrow(
      /invalid JSON/,
    );
    expect(await readFile(p.project, "utf8")).toBe("{broken");
    expect(await loadProject(dir)).toMatchObject({ found: true, ok: false });
  });

  it("keeps every concurrent session update", async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        updateSession(dir, "s1", (cur) => ({
          ...(cur ?? {
            schema: 1,
            sessionId: "s1",
            agent: "claude-code",
            title: "",
            epoch: null,
            startedAt: T0,
            updatedAt: T0,
            status: { goal: "", done: [], pending: [], next: "" },
            nodes: [],
          }),
          nodes: [
            ...(cur?.nodes ?? []),
            { id: `n${i}`, parent: null, kind: "step", title: `${i}` },
          ],
        })),
      ),
    );
    const s = await loadSession(dir, "s1");
    expect(s.found && s.ok && s.data.nodes).toHaveLength(10);
  });

  it("returns default config and persists changes", async () => {
    expect((await loadConfig(env)).updateEveryTurns).toBe(5);
    await updateConfig((c) => ({ ...c, updateEveryTurns: 3 }), env);
    expect((await loadConfig(env)).updateEveryTurns).toBe(3);
  });

  it("registers projects in the global registry", async () => {
    await updateRegistry((r) => ({ ...r, projects: [{ path: dir, name: "p", addedAt: T0 }] }), env);
    expect(await loadRegistry(env)).toMatchObject({
      found: true,
      ok: true,
      data: { projects: [{ name: "p" }] },
    });
  });
});
