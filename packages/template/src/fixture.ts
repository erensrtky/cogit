import type { LineageViewModel, ViewNode, ViewSession } from "../../cli/src/view/model.js";

const message = (
  id: string,
  title: string,
  parent: string | null,
  at: string,
  extra: Partial<ViewNode> = {},
): ViewNode => ({ id, kind: "message", title, parent, at, ...extra });

const session = (
  sessionId: string,
  title: string,
  epoch: string | null,
  startedAt: string,
  updatedAt: string,
  messages: ViewNode[],
  status: ViewSession["status"],
): ViewSession => ({
  sessionId,
  agent: "claude-code",
  title,
  epoch,
  startedAt,
  updatedAt,
  status,
  messages,
  transcriptAvailable: true,
});

/**
 * Dev-only sample data (`npm run dev -w template`). Mirrors the shape `cogit
 * build` produces: two epochs, three sessions (one unassigned), a branch that
 * folds, a return link and an unrecorded message at the end of a chain.
 */
export const fixture: LineageViewModel = {
  kind: "lineage",
  schema: 1,
  project: {
    name: "cogit",
    path: "/home/dev/cogit",
    generatedAt: "2026-10-24T12:00:00.000Z",
  },
  status: {
    goal: "Ship the project map as one self-contained HTML file.",
    done: ["Define the view-model contract", "Scaffold the template package"],
    pending: [
      { text: "Pick the graph layout that survives 500 nodes", needsUser: true },
      { text: "Write the resume command copy fallback", needsUser: false },
    ],
    next: "Render the fixture through the template and check the single-file build.",
    lastActivity: "2026-10-24T11:42:00.000Z",
  },
  settings: {
    language: "auto",
    updateEveryTurns: 5,
    sessionEndCatchUp: true,
    catchUpModel: "haiku",
    messageSummaries: false,
    startupContext: true,
    shareConversations: false,
    recordCommit: "ask",
    gitPolicy: "ignore",
    agents: ["claude-code"],
    bigChangeLines: 300,
  },
  epochs: [
    {
      id: "map",
      title: "Project map",
      createdAt: "2026-10-19T09:00:00.000Z",
      sessions: [
        session(
          "fixture-template",
          "Template package and single-file output",
          "map",
          "2026-10-24T08:00:00.000Z",
          "2026-10-24T11:42:00.000Z",
          [
            message("m1", "Scaffold the template package", null, "2026-10-24T09:00:00.000Z", {
              summary: "React 19 + Vite 8, one index.html at build time.",
              branch: {
                title: "Template scaffold",
                asked: "Which build setup keeps the page one file?",
                outcome: "Vite + vite-plugin-singlefile; the data is embedded as JSON.",
                open: "",
              },
            }),
            message("m2", "Wire the data contract", "m1", "2026-10-24T09:12:00.000Z", {
              summary: "The page reads the JSON script element and types it once.",
              work: ["Added view/model.ts shared by CLI and template"],
              files: ["packages/cli/src/view/model.ts", "packages/cli/src/view/lineage.ts"],
            }),
            message("m3", "Read data from the DOM", "m2", "2026-10-24T09:20:00.000Z", {
              summary: "A fetch would break file://; the JSON element survives inlining.",
              decidedBy: "agent",
              alternatives: [{ option: "fetch the JSON", why: "breaks over file://" }],
            }),
            message("m4", "Build the dev fixture", "m3", "2026-10-24T09:41:00.000Z", {
              summary: "Two epochs, three sessions, one unassigned.",
              commits: ["1a2b3c4", "9f8e7d6"],
              commitTags: [
                { hash: "1a2b3c4", subject: "feat(template): add the dev fixture" },
                { hash: "9f8e7d6" },
              ],
              files: ["packages/template/src/fixture.ts"],
            }),
            message("m5", "Check the page in the browser", "m4", "2026-10-24T10:02:00.000Z", {
              summary: "Layout measured; console clean.",
            }),
            message("m6", "Draw nested groups", "m4", "2026-10-24T10:20:00.000Z", {
              summary: "A second branch off the fixture work.",
              files: ["packages/template/src/Graph.tsx"],
              branch: {
                title: "Nested groups",
                asked: "How do epochs, sessions and messages nest?",
                outcome: "Groups around the git rows.",
                open: "",
              },
            }),
            message("m7", "Return to the data contract", "m6", "2026-10-24T10:35:00.000Z", {
              summary: "The contract needed one more field for the pending count.",
              links: ["m2"],
            }),
            message("m8", "Ship the map", "m7", "2026-10-24T11:10:00.000Z", {
              summary: "Build, open and verify.",
            }),
            message("m9", "Lineage graph idea", null, "2026-10-24T11:42:00.000Z", {
              summary: "A git graph of the user's messages.",
              files: ["packages/cli/src/view/files.ts"],
              branch: {
                title: "Git graph",
                asked: "What if the map read like a git history?",
                outcome: "",
                open: "Not built yet.",
              },
            }),
          ],
          {
            goal: "Render a typed fixture through the template.",
            done: ["Scaffold Vite + React", "Add the fixture"],
            pending: [{ text: "Confirm the graph layout", needsUser: true }],
            next: "Check the page in the browser.",
          },
        ),
      ],
    },
    {
      id: "capture",
      title: "Capture pipeline",
      createdAt: "2026-10-20T10:00:00.000Z",
      sessions: [
        session(
          "fixture-capture",
          "Session merge and redaction",
          "capture",
          "2026-10-20T09:00:00.000Z",
          "2026-10-20T16:30:00.000Z",
          [
            message("c1", "Harden session writes", null, "2026-10-20T09:00:00.000Z", {
              summary: "Locked read → merge → write with redaction.",
              files: ["packages/cli/src/store/stores.ts"],
              branch: {
                title: "Safe writes",
                asked: "How do two turns write the same session?",
                outcome: "A per-session lock, then merge and redact.",
                open: "",
              },
            }),
            message("c2", "Keep parents optional on input", "c1", "2026-10-20T09:30:00.000Z", {
              why: "The agent can add a child without re-sending the whole tree.",
              decidedBy: "agreed",
            }),
            message("c3", "Add the turn counter", "c2", "2026-10-20T16:30:00.000Z"),
          ],
          {
            goal: "Make session writes safe under concurrency.",
            done: ["Per-session lock", "redactDeep"],
            pending: [],
            next: "Add the turn counter.",
          },
        ),
      ],
    },
  ],
  unassigned: [
    session(
      "fixture-unassigned",
      "Scratch notes on status cards",
      null,
      "2026-10-19T16:00:00.000Z",
      "2026-10-19T18:00:00.000Z",
      [
        message("u1", "Sketch the status card", null, "2026-10-19T16:00:00.000Z", {
          summary: "Goal, done, pending, next and last activity.",
        }),
        message("u2", "What counts as an active session?", "u1", "2026-10-19T18:00:00.000Z", {
          summary: "Updated within the last 7 days.",
          unsummarized: true,
        }),
      ],
      {
        goal: "Decide how the status card merges parallel sessions.",
        done: [],
        pending: [{ text: "Define active", needsUser: true }],
        next: "Ask before implementing.",
      },
    ),
  ],
  // Story 8.15: the files view, as `build` unions message files and commit files.
  files: [
    {
      path: "packages/cli/src/view/files.ts",
      count: 1,
      lastAt: "2026-10-24T11:42:00.000Z",
      hits: [
        {
          sessionId: "fixture-template",
          sessionTitle: "Template package and single-file output",
          messageId: "m9",
          label: "m9",
          at: "2026-10-24T11:42:00.000Z",
          title: "Lineage graph idea",
          branch: "Git graph",
          commits: [],
        },
      ],
    },
    {
      path: "packages/template/src/Graph.tsx",
      count: 1,
      lastAt: "2026-10-24T10:20:00.000Z",
      hits: [
        {
          sessionId: "fixture-template",
          sessionTitle: "Template package and single-file output",
          messageId: "m6",
          label: "m6",
          at: "2026-10-24T10:20:00.000Z",
          title: "Draw nested groups",
          branch: "Nested groups",
          commits: [],
        },
      ],
    },
    {
      path: "packages/template/src/fixture.ts",
      count: 1,
      lastAt: "2026-10-24T09:41:00.000Z",
      hits: [
        {
          sessionId: "fixture-template",
          sessionTitle: "Template package and single-file output",
          messageId: "m4",
          label: "m4",
          at: "2026-10-24T09:41:00.000Z",
          title: "Build the dev fixture",
          branch: "Template scaffold",
          commits: ["1a2b3c4", "9f8e7d6"],
        },
      ],
    },
    {
      path: "packages/cli/src/view/model.ts",
      count: 1,
      lastAt: "2026-10-24T09:12:00.000Z",
      hits: [
        {
          sessionId: "fixture-template",
          sessionTitle: "Template package and single-file output",
          messageId: "m2",
          label: "m2",
          at: "2026-10-24T09:12:00.000Z",
          title: "Wire the data contract",
          branch: "Template scaffold",
          commits: [],
        },
      ],
    },
    {
      path: "packages/cli/src/view/lineage.ts",
      count: 1,
      lastAt: "2026-10-24T09:12:00.000Z",
      hits: [
        {
          sessionId: "fixture-template",
          sessionTitle: "Template package and single-file output",
          messageId: "m2",
          label: "m2",
          at: "2026-10-24T09:12:00.000Z",
          title: "Wire the data contract",
          branch: "Template scaffold",
          commits: [],
        },
      ],
    },
    {
      path: "packages/cli/src/store/stores.ts",
      count: 1,
      lastAt: "2026-10-20T09:00:00.000Z",
      hits: [
        {
          sessionId: "fixture-capture",
          sessionTitle: "Session merge and redaction",
          messageId: "c1",
          label: "c1",
          at: "2026-10-20T09:00:00.000Z",
          title: "Harden session writes",
          branch: "Safe writes",
          commits: [],
        },
      ],
    },
  ],
  // Story 8.12: the switcher's data, as `build` collects it from the registry.
  switcher: [
    {
      name: "cogit",
      path: "/home/dev/cogit",
      lastActivity: "2026-10-24T11:42:00.000Z",
      leftOff: "Render the fixture through the template and check the single-file build.",
      lineageUrl: "file:///home/dev/cogit/.cogit/map.html",
      current: true,
    },
    {
      name: "start-project",
      path: "/home/dev/start-project",
      lastActivity: "2026-10-23T18:05:00.000Z",
      leftOff: "Write the push commands for the release notes.",
      lineageUrl: "file:///home/dev/start-project/.cogit/map.html",
      current: false,
    },
  ],
};
