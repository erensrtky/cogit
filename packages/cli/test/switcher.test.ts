import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { buildProject } from "../src/commands/build.js";
import { init } from "../src/commands/init.js";
import { Session } from "../src/schema/session.js";
import { globalPaths, projectPaths } from "../src/store/paths.js";
import { DATA_ELEMENT_ID, type LineageViewModel } from "../src/view/model.js";
import { type CollectedProject, leftOffLine } from "../src/view/panel.js";
import {
  filterSwitcherProjects,
  recentSwitcherProjects,
  SWITCHER_RECENT_LIMIT,
  switcherEntries,
} from "../src/view/switcher.js";
import { envFor, fakeIo, tempDir } from "./helpers.js";

const TEMPLATE = `<!doctype html><html><head><title>cogit — lineage</title></head><body>
    <div id="root"></div>
    <script id="${DATA_ELEMENT_ID}" type="application/json"></script></body></html>`;

const DATA_PREFIX = `<script id="${DATA_ELEMENT_ID}" type="application/json">`;

function embedded(html: string): unknown {
  const start = html.indexOf(DATA_PREFIX);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = html.indexOf("</script>", start);
  return JSON.parse(html.slice(start + DATA_PREFIX.length, end));
}

async function write(file: string, data: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, data);
}

function collected(overrides: Partial<CollectedProject> & { name: string; path: string }) {
  const project: CollectedProject = {
    missing: false,
    lastActivity: null,
    needsUserCount: 0,
    lineageUrl: `file://${overrides.path}/.cogit/map.html`,
    leftOff: "",
    ...overrides,
  };
  return project;
}

function session(input: {
  sessionId: string;
  updatedAt: string;
  next?: string;
  messages?: string[];
  messageAt?: string;
}) {
  return Session.parse({
    schema: 1,
    sessionId: input.sessionId,
    startedAt: "2026-10-20T00:00:00.000Z",
    updatedAt: input.updatedAt,
    status: { goal: "", done: [], pending: [], next: input.next ?? "" },
    nodes: (input.messages ?? []).map((title, index) => ({
      id: `m${index + 1}`,
      kind: "message",
      title,
      parent: index === 0 ? null : `m${index}`,
      at: input.messageAt ?? "2026-10-20T00:00:00.000Z",
    })),
  });
}

describe("switcherEntries", () => {
  it("orders by last activity, marks the current project and skips missing ones", () => {
    const projects = [
      collected({
        name: "older",
        path: "/work/older",
        lastActivity: "2026-10-21T08:00:00.000Z",
        leftOff: "Older next step.",
      }),
      collected({ name: "gone", path: "/work/gone", missing: true, lineageUrl: null }),
      collected({ name: "never", path: "/work/never", leftOff: "Never ran a session." }),
      collected({ name: "twin", path: "/work/twin-b" }),
      collected({ name: "twin", path: "/work/twin-a" }),
      collected({
        name: "current",
        path: "/work/current",
        lastActivity: "2026-10-24T10:00:00.000Z",
        leftOff: "Where we left off.",
      }),
    ];

    // `resolve` compares the paths, so a trailing slash still marks the page's own project.
    const entries = switcherEntries(projects, "/work/current/");

    // Projects with no session share the end, ordered by name and then path.
    expect(entries.map((entry) => entry.name)).toEqual([
      "current",
      "older",
      "never",
      "twin",
      "twin",
    ]);
    expect(entries.slice(3).map((entry) => entry.path)).toEqual(["/work/twin-a", "/work/twin-b"]);
    expect(entries[0]).toEqual({
      name: "current",
      path: "/work/current",
      lastActivity: "2026-10-24T10:00:00.000Z",
      leftOff: "Where we left off.",
      lineageUrl: "file:///work/current/.cogit/map.html",
      current: true,
    });
    expect(entries[1]?.current).toBe(false);
    expect(entries[2]?.lastActivity).toBeNull();
  });
});

describe("leftOffLine", () => {
  it("takes the newest session's next step", () => {
    const sessions = [
      session({ sessionId: "new", updatedAt: "2026-10-24T10:00:00.000Z", next: "Ship it." }),
      session({ sessionId: "old", updatedAt: "2026-10-20T10:00:00.000Z", next: "Old step." }),
    ];
    expect(leftOffLine(sessions)).toBe("Ship it.");
  });

  it("follows the newest message, not a record fixed later", () => {
    const sessions = [
      session({
        sessionId: "old-but-touched",
        updatedAt: "2026-10-25T10:00:00.000Z",
        next: "Old step.",
        messages: ["Old message"],
        messageAt: "2026-10-20T10:00:00.000Z",
      }),
      session({
        sessionId: "current",
        updatedAt: "2026-10-24T10:00:00.000Z",
        next: "Current step.",
        messages: ["Newest message"],
        messageAt: "2026-10-24T09:00:00.000Z",
      }),
    ];
    expect(leftOffLine(sessions)).toBe("Current step.");
  });

  it("falls back to the newest session's last message title, then to empty", () => {
    const sessions = [
      session({
        sessionId: "s1",
        updatedAt: "2026-10-24T10:00:00.000Z",
        messages: ["First", "Last message title"],
      }),
    ];
    expect(leftOffLine(sessions)).toBe("Last message title");
    expect(leftOffLine([])).toBe("");
  });
});

describe("filterSwitcherProjects", () => {
  const projects = switcherEntries(
    [
      collected({
        name: "cogit",
        path: "/work/cogit",
        lastActivity: "2026-10-24T10:00:00.000Z",
        leftOff: "Add the project switcher.",
      }),
      collected({
        name: "start-project",
        path: "/work/start-project",
        lastActivity: "2026-10-23T10:00:00.000Z",
        leftOff: "Write the push commands.",
      }),
    ],
    "/work/cogit",
  );

  it("matches name, path and the left-off line, case-insensitively", () => {
    expect(filterSwitcherProjects(projects, "COG").map((p) => p.name)).toEqual(["cogit"]);
    expect(filterSwitcherProjects(projects, "start-project").map((p) => p.name)).toEqual([
      "start-project",
    ]);
    expect(filterSwitcherProjects(projects, "push commands").map((p) => p.name)).toEqual([
      "start-project",
    ]);
    expect(filterSwitcherProjects(projects, "nothing like this")).toEqual([]);
  });

  it("returns every project for an empty query and limits the tab strip", () => {
    expect(filterSwitcherProjects(projects, "   ")).toHaveLength(2);
    const many = switcherEntries(
      Array.from({ length: SWITCHER_RECENT_LIMIT + 3 }, (_value, index) =>
        collected({ name: `p${index}`, path: `/work/p${index}` }),
      ),
      "/work/p0",
    );
    expect(recentSwitcherProjects(many)).toHaveLength(SWITCHER_RECENT_LIMIT);
    expect(recentSwitcherProjects(many)[0]?.name).toBe("p0");
  });
});

describe("map build", () => {
  let dir: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    dir = await tempDir();
    env = envFor(dir);
  });

  async function initProject(root: string): Promise<void> {
    await mkdir(root, { recursive: true });
    await init(root, { retention: "keep", language: "auto" }, fakeIo(env));
  }

  async function saveSession(root: string, data: unknown): Promise<void> {
    const id = (data as { sessionId: string }).sessionId;
    await write(projectPaths(root).session(id), JSON.stringify(data));
  }

  it("embeds every registered project, most recently active first, at build time", async () => {
    const alpha = join(dir, "alpha");
    const beta = join(dir, "beta");
    const gone = join(dir, "gone");
    await initProject(alpha);
    await initProject(beta);
    await initProject(gone);
    await saveSession(alpha, {
      schema: 1,
      sessionId: "a1",
      title: "Alpha work",
      startedAt: "2026-10-20T10:00:00.000Z",
      updatedAt: "2026-10-24T10:00:00.000Z",
      status: { goal: "", done: [], pending: [], next: "Ship the switcher." },
      nodes: [],
    });
    await saveSession(beta, {
      schema: 1,
      sessionId: "b1",
      title: "Beta work",
      startedAt: "2026-10-21T10:00:00.000Z",
      updatedAt: "2026-10-22T10:00:00.000Z",
      status: { goal: "", done: [], pending: [], next: "" },
      nodes: [
        { id: "m1", kind: "message", title: "First beta message", parent: null },
        { id: "m2", kind: "message", title: "Where beta left off", parent: "m1" },
      ],
    });
    await rm(gone, { recursive: true });

    const io = fakeIo(env);
    await buildProject({ dir: alpha, io, templateHtml: TEMPLATE });

    const model = embedded(await readFile(projectPaths(alpha).html, "utf8")) as LineageViewModel;
    expect(model.switcher).toEqual([
      {
        name: "alpha",
        path: alpha,
        lastActivity: "2026-10-24T10:00:00.000Z",
        leftOff: "Ship the switcher.",
        lineageUrl: pathToFileURL(projectPaths(alpha).html).href,
        current: true,
      },
      {
        name: "beta",
        path: beta,
        lastActivity: "2026-10-22T10:00:00.000Z",
        leftOff: "Where beta left off",
        lineageUrl: pathToFileURL(projectPaths(beta).html).href,
        current: false,
      },
    ]);

    // The panel page keeps its card shape; `leftOff` lives only in the map.
    const panel = embedded(await readFile(globalPaths(env).panel, "utf8")) as {
      projects: Record<string, unknown>[];
    };
    expect(panel.projects.map((project) => project.name)).toEqual(["alpha", "beta", "gone"]);
    expect(panel.projects[0]).not.toHaveProperty("leftOff");
  });

  it("keeps the map usable when the registry cannot be read", async () => {
    const root = join(dir, "solo");
    await initProject(root);
    await write(globalPaths(env).registry, "{nope");

    const io = fakeIo(env);
    await buildProject({ dir: root, io, templateHtml: TEMPLATE });

    const model = embedded(await readFile(projectPaths(root).html, "utf8")) as LineageViewModel;
    expect(model.switcher).toEqual([]);
    expect(io.warnings.join("\n")).toMatch(/^registry: invalid JSON/);
  });
});
