import { describe, expect, it } from "vitest";
import type { ViewNode } from "../../cli/src/view/model.js";
import {
  FOLD_LIMIT,
  type GitMessageRow,
  layoutGitGraph,
  linkArrow,
  linkPath,
  ROOT_GAP,
  ROW_HEIGHT,
} from "../src/gitLayout.js";

let clock = 0;

/** Messages in the order they are given; `parent` and `links` as a record has them. */
function message(id: string, parent: string | null, extra: Partial<ViewNode> = {}): ViewNode {
  clock += 1;
  return {
    id,
    kind: "message",
    title: `Message ${id}`,
    at: new Date(Date.UTC(2026, 9, 24, 10, clock)).toISOString(),
    parent,
    ...extra,
  };
}

function rowsOf(messages: ViewNode[], options = {}) {
  const layout = layoutGitGraph(messages, options);
  const messageRows = layout.rows.filter((row): row is GitMessageRow => row.kind === "message");
  return { layout, messageRows };
}

describe("segments", () => {
  it("runs a branch while messages have one child, and starts a branch at each extra child", () => {
    const messages = [
      message("m1", null),
      message("m2", "m1"),
      message("m3", "m1"),
      message("m4", "m2"),
    ];
    const { segments } = layoutGitGraph(messages);
    expect(segments.map((segment) => segment.ids)).toEqual([["m1"], ["m2", "m4"], ["m3"]]);
    expect(segments[1]?.parentId).toBe("m1");
    expect(segments[2]?.parentSegmentId).toBe("m1");
  });

  it("treats a missing or forward parent as a root, so old records still draw", () => {
    const messages = [message("m1", "m2"), message("m2", null)];
    const { segments } = layoutGitGraph(messages);
    expect(segments.map((segment) => segment.ids)).toEqual([["m1"], ["m2"]]);
    expect(segments.every((segment) => segment.parentId === null)).toBe(true);
  });

  it("draws a cross-session parent as a root of this session (Story 8.6)", () => {
    const messages = [message("m1", null), message("m2", "first:h9")];
    const { segments } = layoutGitGraph(messages);
    expect(segments.map((segment) => segment.ids)).toEqual([["m1"], ["m2"]]);
    expect(segments[1]?.parentId).toBeNull();
  });
});

describe("lanes", () => {
  it("reuses a lane once the branch that used it is done", () => {
    const messages = [
      message("m1", null),
      message("m2", "m1"),
      message("m3", null),
      message("m4", "m3"),
    ];
    const { segments, laneX } = layoutGitGraph(messages);
    expect(segments.map((segment) => segment.lane)).toEqual([0, 0]);
    expect(laneX).toHaveLength(1);
  });

  it("gives overlapping branches their own lanes", () => {
    // m2 starts while the m1–m3 chain still runs, so they overlap in time.
    const messages = [message("m1", null), message("m2", null), message("m3", "m1")];
    const { segments, laneX } = layoutGitGraph(messages);
    expect(segments.map((segment) => segment.lane)).toEqual([0, 1]);
    expect(laneX).toHaveLength(2);
    expect(laneX[1]).toBeGreaterThan(laneX[0] ?? 0);
  });
});

describe("rows", () => {
  it("marks the first row of each branch and falls back to the message title as its summary", () => {
    const branch = { title: "Scaffold", asked: "How?", outcome: "Done.", open: "" };
    const messages = [
      message("m1", null),
      message("m2", "m1", { branch }),
      message("m3", "m2"),
      message("m4", "m1", { summary: "A second thread" }),
      message("m5", "m4"),
    ];
    const { layout } = rowsOf(messages);
    const rows = layout.rows.filter((row): row is GitMessageRow => row.kind === "message");
    expect(rows.map((row) => row.first)).toEqual([true, true, false, true, false]);
    expect(layout.segments[1]?.branch).toMatchObject({
      title: "Scaffold",
      asked: "How?",
      outcome: "Done.",
      count: 2,
    });
    expect(layout.segments[2]?.branch).toMatchObject({
      title: "Message m4",
      outcome: "A second thread",
      count: 2,
    });
  });

  it("folds a long branch to first / ⋮ N more / last, unless it holds HEAD or is unfolded", () => {
    const chain = [message("m1", null)];
    for (let n = 2; n <= FOLD_LIMIT + 2; n += 1) chain.push(message(`m${n}`, `m${n - 1}`));
    const head = message("h1", null);

    const folded = layoutGitGraph([...chain, head]);
    const firstRows = folded.rows.filter((row) => row.segmentId === "m1");
    expect(firstRows.map((row) => (row.kind === "more" ? "more" : row.message.id))).toEqual([
      "m1",
      "more",
      `m${FOLD_LIMIT + 2}`,
    ]);
    const more = firstRows[1];
    expect(more?.kind === "more" && more.hidden).toHaveLength(FOLD_LIMIT);

    const unfolded = layoutGitGraph([...chain, head], { unfolded: new Set(["m1"]) });
    expect(unfolded.rows.filter((row) => row.segmentId === "m1")).toHaveLength(FOLD_LIMIT + 2);

    const openAll = layoutGitGraph([...chain, head], { openAll: true });
    expect(openAll.rows.filter((row) => row.segmentId === "m1")).toHaveLength(FOLD_LIMIT + 2);

    const onHead = layoutGitGraph(chain);
    expect(onHead.rows.some((row) => row.kind === "more")).toBe(false);
  });

  it("gives a new root a gap above its first row", () => {
    const { layout } = rowsOf([message("m1", null), message("m2", "m1"), message("m3", null)]);
    const rows = layout.rows.filter((row): row is GitMessageRow => row.kind === "message");
    expect(rows.map((row) => row.gap)).toEqual([false, false, true]);
    const between = rows[2]!.y - rows[1]!.y;
    expect(between).toBe(ROW_HEIGHT + ROOT_GAP);
  });

  it("gives a long title a taller row instead of cutting it, and keeps rows from overlapping", () => {
    const long =
      "Kutular genişletilebilir olsun, yazılar kesiliyor ve devamını okuyamıyorum ".repeat(3);
    const { messageRows, layout } = rowsOf([
      message("m1", null, {
        branch: {
          title: "A branch title long enough to wrap twice",
          asked: "",
          outcome: "",
          open: "",
        },
      }),
      message("m2", "m1", { title: long }),
      message("m3", "m2", { unsummarized: true }),
    ]);
    const [first, second, third] = messageRows;
    expect(first!.height).toBeGreaterThan(ROW_HEIGHT);
    expect(second!.height).toBeGreaterThanOrEqual(ROW_HEIGHT + 2 * 16);
    expect(third!.height).toBe(ROW_HEIGHT);
    expect(second!.y - second!.height / 2).toBe(first!.y + first!.height / 2);
    expect(layout.height).toBe(ROW_HEIGHT / 2 + first!.height + second!.height + third!.height);
  });

  it("carries a message's commits as tag chips, marking one git no longer knows", () => {
    const { messageRows } = rowsOf([
      message("m1", null, {
        commitTags: [
          { hash: "abc1234", subject: "feat(map): draw commit tags" },
          { hash: "deadbee" },
        ],
      }),
      message("m2", "m1"),
    ]);
    expect(messageRows[0]?.tags).toEqual([
      {
        hash: "abc1234",
        short: "abc1234",
        subject: "feat(map): draw commit tags",
        missing: false,
      },
      { hash: "deadbee", short: "deadbee", missing: true },
    ]);
    expect(messageRows[1]?.tags).toEqual([]);

    // A hand-written model with only bare hashes still gets chips, all greyed.
    const bare = rowsOf([message("m1", null, { commits: ["fedcba9"] })]);
    expect(bare.messageRows[0]?.tags).toEqual([
      { hash: "fedcba9", short: "fedcba9", missing: true },
    ]);
  });

  it("marks the newest message as HEAD unless told otherwise", () => {
    const messages = [message("m1", null), message("m2", "m1"), message("m3", "m2")];
    const rows = layoutGitGraph(messages).rows.filter(
      (row): row is GitMessageRow => row.kind === "message",
    );
    expect(rows.map((row) => row.head)).toEqual([false, false, true]);
    const overridden = layoutGitGraph(messages, { headId: "m2" }).rows.filter(
      (row): row is GitMessageRow => row.kind === "message",
    );
    expect(overridden.map((row) => row.head)).toEqual([false, true, false]);
  });
});

describe("returns", () => {
  it("routes each return through its own channel left of every lane", () => {
    const messages = [
      message("m1", null),
      message("m2", "m1"),
      message("m3", "m2", { links: ["m1"] }),
      message("m4", "m3", { links: ["m2"] }),
    ];
    const { layout } = rowsOf(messages);
    expect(layout.links.map((link) => link.channelX)).toEqual([6, 18]);
    expect(layout.links.map((link) => link.toId)).toEqual(["m1", "m2"]);
    expect(Math.max(...layout.links.map((link) => link.channelX))).toBeLessThan(
      layout.laneX[0] ?? 0,
    );

    const link = layout.links[0]!;
    const path = linkPath(link, 40, 60);
    expect(path).toContain(`M40,${link.toY}`);
    expect(path.endsWith(`L51,${link.fromY}`)).toBe(true);
    expect(linkArrow(link, 60)).toContain(`M45,${link.fromY - 4}`);
  });

  it("marks the returning row and colours it like the branch it returns to", () => {
    const messages = [
      message("m1", null),
      message("m2", "m1"),
      message("m3", null),
      message("m4", "m2", { links: ["m1"] }),
    ];
    const { layout } = rowsOf(messages);
    const row = layout.rows.find(
      (candidate): candidate is GitMessageRow =>
        candidate.kind === "message" && candidate.message.id === "m4",
    );
    expect(row?.returns).toEqual([{ id: "m1", label: "m1", colorIndex: 0 }]);
  });
});
