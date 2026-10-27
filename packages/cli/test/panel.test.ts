import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { buildProject } from "../src/commands/build.js";
import { configSet } from "../src/commands/config.js";
import { init } from "../src/commands/init.js";
import { sessionWrite } from "../src/commands/session.js";
import { globalPaths, projectPaths } from "../src/store/paths.js";
import { DATA_ELEMENT_ID, type PanelViewModel } from "../src/view/model.js";
import { buildPanel } from "../src/view/panel.js";
import { envFor, fakeIo, T0, tempDir } from "./helpers.js";

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

/** init names the project after its directory when `--name` is not given. */
async function initProject(root: string, env: NodeJS.ProcessEnv): Promise<void> {
  await mkdir(root, { recursive: true });
  await init(root, { retention: "keep", language: "auto" }, fakeIo(env));
}

let dir: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  dir = await tempDir();
  env = envFor(dir);
});

describe("buildPanel", () => {
  it("writes a card per project, marks a deleted directory missing and shows settings", async () => {
    const alpha = join(dir, "alpha");
    const beta = join(dir, "beta");
    await initProject(alpha, env);
    await initProject(beta, env);
    // init names the project after its directory, which is what the panel shows.
    await writeFile(
      projectPaths(alpha).session("s1"),
      JSON.stringify({
        schema: 1,
        sessionId: "s1",
        startedAt: T0,
        updatedAt: T0,
        status: {
          goal: "",
          done: [],
          pending: [
            { text: "decide", needsUser: true },
            { text: "later", needsUser: false },
          ],
          next: "",
        },
        nodes: [],
      }),
    );
    await rm(beta, { recursive: true });

    const io = fakeIo(env);
    await configSet("updateEveryTurns", "7", io);
    const model = await buildPanel({ env, io, templateHtml: TEMPLATE });

    expect(model).toEqual({
      kind: "panel",
      schema: 1,
      generatedAt: T0,
      settings: {
        language: "auto",
        updateEveryTurns: 7,
        sessionEndCatchUp: true,
        catchUpModel: "haiku",
        messageSummaries: false,
        startupContext: true,
        tryBeforeNotes: true,
        shareConversations: false,
        recordCommit: "ask",
        gitPolicy: "commit",
        agents: ["claude-code"],
        bigChangeLines: 300,
      },
      projects: [
        {
          name: "alpha",
          path: alpha,
          missing: false,
          lastActivity: T0,
          needsUserCount: 1,
          lineageUrl: pathToFileURL(projectPaths(alpha).html).href,
          unreadBigCount: 0,
        },
        {
          name: "beta",
          path: beta,
          missing: true,
          lastActivity: null,
          needsUserCount: 0,
          lineageUrl: null,
          unreadBigCount: 0,
        },
      ],
    });

    const html = await readFile(globalPaths(env).panel, "utf8");
    expect(html).toContain("<title>cogit — panel</title>");
    expect(embedded(html)).toEqual(model);
  });

  it("shows no projects for an unreadable registry and warns instead of failing", async () => {
    await write(globalPaths(env).registry, "{nope");
    const io = fakeIo(env);
    const model = await buildPanel({ env, io, templateHtml: TEMPLATE });
    expect(model.projects).toEqual([]);
    expect(io.warnings).toEqual([expect.stringMatching(/^registry: invalid JSON/)]);
  });

  it("skips a project whose sessions path is unreadable but keeps its card", async () => {
    const root = join(dir, "broken");
    await mkdir(root, { recursive: true });
    await write(projectPaths(root).sessions, "not a directory");
    await write(
      globalPaths(env).registry,
      JSON.stringify({ schema: 1, projects: [{ path: root, name: "broken", addedAt: T0 }] }),
    );

    const io = fakeIo(env);
    const model = await buildPanel({ env, io, templateHtml: TEMPLATE });
    expect(model.projects).toEqual([
      {
        name: "broken",
        path: root,
        missing: false,
        lastActivity: null,
        needsUserCount: 0,
        lineageUrl: pathToFileURL(projectPaths(root).html).href,
        unreadBigCount: 0,
      },
    ]);
    expect(io.warnings.join("\n")).toMatch(/^skipping project .*ENOTDIR/);
  });

  it("redacts a secret-shaped project name before writing the panel", async () => {
    const root = join(dir, "proj");
    await mkdir(root, { recursive: true });
    const secret = "token ghp_abcdefghijklmnopqrstuvwxyz0123456789";
    await write(
      globalPaths(env).registry,
      JSON.stringify({ schema: 1, projects: [{ path: root, name: secret, addedAt: T0 }] }),
    );

    const io = fakeIo(env);
    const model = await buildPanel({ env, io, templateHtml: TEMPLATE });
    expect(model.projects[0]?.name).toBe("token [REDACTED]");
    expect(io.warnings).toContain("redacted 1 secret-looking value(s) in the panel");
  });
});

describe("panel refresh from build", () => {
  it("refreshes the panel after a project build and after a session write", async () => {
    const root = join(dir, "proj");
    await initProject(root, env);
    await buildProject({ dir: root, io: fakeIo(env), templateHtml: TEMPLATE });

    const afterBuild = embedded(await readFile(globalPaths(env).panel, "utf8")) as PanelViewModel;
    expect(afterBuild.kind).toBe("panel");
    expect(afterBuild.projects).toEqual([
      expect.objectContaining({ name: "proj", path: root, missing: false }),
    ]);

    const io = fakeIo(env);
    await sessionWrite({ dir: root }, io, async () => JSON.stringify({ sessionId: "s1" }));
    const afterWrite = embedded(await readFile(globalPaths(env).panel, "utf8")) as PanelViewModel;
    expect(afterWrite.projects[0]?.lastActivity).toBe(T0);
  });

  it("turns an unwritable global directory into a warning, not a failed build", async () => {
    const home = join(dir, "home-file");
    await writeFile(home, "not a directory");
    const badEnv = { ...env, COGIT_HOME: home };
    const root = join(dir, "proj");
    await initProject(root, badEnv);

    const io = fakeIo(badEnv);
    await buildProject({ dir: root, io, templateHtml: TEMPLATE });
    expect(existsSync(projectPaths(root).html)).toBe(true);
    expect(io.warnings.join("\n")).toMatch(/could not build panel\.html/);
  });
});

describe("panel card unread count (10.3)", () => {
  it("keeps the card at zero when the read state cannot be read", async () => {
    const dir = await tempDir();
    const env = envFor(dir);
    const root = join(dir, "proj");
    const paths = projectPaths(root);
    const session = {
      schema: 1,
      sessionId: "s1",
      agent: "claude-code",
      title: "t",
      epoch: null,
      startedAt: T0,
      updatedAt: T0,
      status: { goal: "", done: [], pending: [], next: "" },
      nodes: [
        {
          id: "h111111111111",
          parent: null,
          kind: "message",
          title: "Big",
          at: T0,
          commits: ["abcdef1"],
        },
      ],
    };
    await mkdir(paths.sessions, { recursive: true });
    await writeFile(paths.project, JSON.stringify({ schema: 1, name: "proj", epochs: [] }));
    await writeFile(paths.session("s1"), JSON.stringify(session));
    // A directory where read.json belongs: reading it is an error, not "empty".
    await mkdir(paths.readState, { recursive: true });
    await write(
      globalPaths(env).registry,
      JSON.stringify({ schema: 1, projects: [{ path: root, name: "proj", addedAt: T0 }] }),
    );

    const model = await buildPanel({ env, io: fakeIo(env), templateHtml: TEMPLATE });
    expect(model.projects[0]?.unreadBigCount).toBe(0);
  });
});
