import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ViewPullRequest } from "../../cli/src/view/model.js";
import { fixture } from "../src/fixture.js";
import { PullRequestView } from "../src/PullRequestView.js";
import { pullRequestCounts, pullRequestState, shapeDiagram } from "../src/pullRequest.js";

const ready = fixture.pullRequest as ViewPullRequest;
const empty = (branch: string | undefined, base: string): ViewPullRequest => ({
  ...ready,
  ...(branch === undefined ? { branch: undefined } : { branch }),
  base,
  model: { ...ready.model, thoughts: [], unlinked: [] },
});
const builtAt = "2026-10-24T12:00:00.000Z";
const render = (pr: ViewPullRequest | undefined) =>
  renderToStaticMarkup(createElement(PullRequestView, { pr, builtAt, onSelect: () => {} }));

describe("the Pull request view", () => {
  it("follows cogit pr: the branch against where it will merge", () => {
    expect(pullRequestState(undefined)).toEqual({ kind: "none" });
    expect(pullRequestState(ready)).toEqual({ kind: "ready", pr: ready });
    expect(pullRequestState(empty("main", "main"))).toEqual({ kind: "on-base", base: "main" });
    expect(pullRequestState(empty("main", "origin/main"))).toEqual({
      kind: "on-base",
      base: "origin/main",
    });
    expect(pullRequestState(empty("feat/x", "main"))).toEqual({
      kind: "no-commits",
      branch: "feat/x",
      base: "main",
    });
  });

  it("counts sessions, thoughts and every commit, linked or not", () => {
    expect(pullRequestCounts(ready)).toBe("1 session · 1 thought · 2 commits");
  });

  it("previews a Shape's first diagram, drawing a Flow as Mermaid", () => {
    expect(shapeDiagram(undefined)).toBeUndefined();
    expect(shapeDiagram([{ kind: "pseudo", text: "1. a\n2. b" }])).toBeUndefined();
    expect(shapeDiagram([{ kind: "mermaid", text: "flowchart TD", valid: false }])).toBeUndefined();
    expect(shapeDiagram([{ kind: "sequence", text: "sequenceDiagram" }])).toBe("sequenceDiagram");
    const flow = JSON.stringify({
      nodes: [
        { id: "a", kind: "event", label: "start" },
        { id: "b", kind: "fn", label: "work" },
      ],
      edges: [{ from: "a", to: "b" }],
      ordered: false,
    });
    expect(shapeDiagram([{ kind: "flow", text: flow }])).toContain("flowchart TD");
  });

  it("shows the branch's goal, thoughts and unrecorded commits with a copy button", () => {
    const html = render(ready);
    expect(html).toContain("feat/template");
    expect(html).toContain("Copy as PR description");
    expect(html).toContain("Render the lineage map from build data");
    expect(html).toContain("Build the dev fixture");
    expect(html).toContain("ship the fixture as a JSON file");
    expect(html).toContain("Read data from the DOM");
    expect(html).toContain("chore: bump the lockfile");
  });

  it("says a saved page shows the branch it was built on", () => {
    expect(render(ready)).toContain("As of ");
    expect(render(undefined)).toContain("when this page was built");
  });

  it("asks the local server for the branch checked out now", () => {
    const html = renderToStaticMarkup(
      createElement(PullRequestView, {
        pr: ready,
        builtAt,
        live: { dir: "/p", token: "t" },
        onSelect: () => {},
      }),
    );
    expect(html).toContain("Reading the branch");
    expect(html).not.toContain("feat/template");
  });

  it("says why it is empty", () => {
    expect(render(undefined)).toContain("No pull request to show");
    expect(render(empty("main", "main"))).toContain("You are on main, where pull requests merge.");
    expect(render(empty("feat/x", "main"))).toContain(
      "feat/x has no commits that main does not have yet.",
    );
    expect(render(empty(undefined, "main"))).toContain("This HEAD has no commits");
  });
});
