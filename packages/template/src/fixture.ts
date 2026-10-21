import type { LineageViewModel, ViewNode, ViewSession } from "../../cli/src/view/model.js";

const node = (
  id: string,
  kind: ViewNode["kind"],
  title: string,
  extra: Partial<ViewNode> = {},
): ViewNode => ({ id, kind, title, children: [], ...extra });

const session = (
  sessionId: string,
  title: string,
  epoch: string | null,
  startedAt: string,
  updatedAt: string,
  nodes: ViewNode[],
  status: ViewSession["status"],
): ViewSession => ({
  sessionId,
  agent: "claude-code",
  title,
  epoch,
  startedAt,
  updatedAt,
  status,
  nodes,
  transcriptAvailable: true,
});

/**
 * Dev-only sample data (`npm run dev -w template`). Mirrors the shape `codelineage
 * build` produces: two epochs, three sessions (one unassigned) and nested nodes.
 */
export const fixture: LineageViewModel = {
  kind: "lineage",
  schema: 1,
  project: {
    name: "codelineage",
    path: "/home/dev/codelineage",
    generatedAt: "2026-10-21T12:00:00.000Z",
  },
  status: {
    goal: "Ship the project map as one self-contained HTML file.",
    done: ["Define the view-model contract", "Scaffold the template package"],
    pending: [
      { text: "Pick the graph layout that survives 500 nodes", needsUser: true },
      { text: "Write the resume command copy fallback", needsUser: false },
    ],
    next: "Render the fixture through the template and check the single-file build.",
    lastActivity: "2026-10-21T11:42:00.000Z",
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
          "2026-10-21T08:00:00.000Z",
          "2026-10-21T11:42:00.000Z",
          [
            node("n1", "phase", "Scaffold the template", {
              summary: "React 19 + Vite 8, one index.html at build time.",
              at: "2026-10-21T09:05:00.000Z",
              children: [
                node("n2", "step", "Wire the data contract", {
                  summary: "The page reads the JSON script element and types it once.",
                  children: [
                    node("n3", "decision", "Read data from the DOM, not a fetch", {
                      why: "A fetch would break file://; the JSON element survives inlining.",
                    }),
                  ],
                }),
                node("n4", "question", "Should the fixture ship in production?", {
                  summary: "No: dev-only import is tree-shaken from the build.",
                }),
              ],
            }),
            node("n5", "step", "Build the dev fixture", {
              summary: "Two epochs, three sessions, one unassigned.",
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
            node("c1", "phase", "Harden session writes", {
              summary: "Locked read → merge → write with redaction.",
              children: [
                node("c2", "decision", "Keep node parents optional on input", {
                  why: "The agent can add a child without re-sending the whole tree.",
                }),
              ],
            }),
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
        node("u1", "step", "Sketch the status card", {
          summary: "Goal, done, pending, next and last activity.",
          children: [node("u2", "question", "What counts as an active session?")],
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
};
