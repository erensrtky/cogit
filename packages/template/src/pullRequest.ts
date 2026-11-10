import type { ViewPullRequest, ViewShapeTool } from "../../cli/src/view/model.js";
import { flowToMermaid } from "../../cli/src/view/shape.js";

/** What the Pull request view shows: the branch, or why there is nothing to show. */
export type PullRequestState =
  /** Outside git, before the first commit, or no merge target was found. */
  | { kind: "none" }
  /** On the branch pull requests merge into: there is nothing to merge. */
  | { kind: "on-base"; base: string }
  /** A branch with no commits its base does not have yet. */
  | { kind: "no-commits"; branch: string | undefined; base: string }
  | { kind: "ready"; pr: ViewPullRequest };

/**
 * The view's state, the same rule `cogit pr` follows: the branch against where
 * it will merge. `main` against `main` (or `origin/main`) is empty on purpose.
 */
export function pullRequestState(pr: ViewPullRequest | undefined): PullRequestState {
  if (pr === undefined) return { kind: "none" };
  if (pr.model.thoughts.length > 0 || pr.model.unlinked.length > 0) return { kind: "ready", pr };
  const onBase =
    pr.branch !== undefined && (pr.base === pr.branch || pr.base.endsWith(`/${pr.branch}`));
  return onBase
    ? { kind: "on-base", base: pr.base }
    : { kind: "no-commits", branch: pr.branch, base: pr.base };
}

/** `3 sessions · 5 thoughts · 7 commits`, singular where it is one. */
export function pullRequestCounts(pr: ViewPullRequest): string {
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const commits =
    pr.model.thoughts.reduce((sum, thought) => sum + thought.commits.length, 0) +
    pr.model.unlinked.length;
  return [
    count(pr.model.sessions.length, "session"),
    count(pr.model.thoughts.length, "thought"),
    count(commits, "commit"),
  ].join(" · ");
}

/** The first diagram of a thought's Shape, as Mermaid source, for the view's preview. */
export function shapeDiagram(tools: readonly ViewShapeTool[] | undefined): string | undefined {
  const tool = tools?.find(
    (candidate) =>
      ["flow", "mermaid", "sequence"].includes(candidate.kind) && candidate.valid !== false,
  );
  if (tool === undefined) return undefined;
  return tool.kind === "flow" ? flowToMermaid(tool.text) : tool.text;
}
