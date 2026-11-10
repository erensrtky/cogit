import { useState } from "react";
import type { ViewPullRequest } from "../../cli/src/view/model.js";
import { type CopyState, copyText } from "./clipboard.js";
import { MermaidDiagram } from "./MermaidDiagram.js";
import { pullRequestCounts, pullRequestState, shapeDiagram } from "./pullRequest.js";

type Thought = ViewPullRequest["model"]["thoughts"][number];

/**
 * The map's Pull request view: the checked-out branch as `cogit pr` describes
 * it, for the person about to open the pull request. A thought opens its card,
 * where the Shape and the diff are; the copy button takes the same Markdown
 * `cogit pr` prints.
 */
export function PullRequestView({
  pr,
  onSelect,
}: {
  pr: ViewPullRequest | undefined;
  onSelect: (sessionId: string, messageId: string) => void;
}) {
  const [copy, setCopy] = useState<CopyState>("idle");
  const state = pullRequestState(pr);
  if (state.kind === "none")
    return (
      <p className="graph-status empty">
        No pull request to show: this project is not in git, has no commit yet, or has no branch to
        merge into.
      </p>
    );
  if (state.kind === "on-base")
    return (
      <p className="graph-status empty">
        You are on {state.base}, where pull requests merge. This view fills on a branch that has
        commits {state.base} does not have yet.
      </p>
    );
  if (state.kind === "no-commits")
    return (
      <p className="graph-status empty">
        {state.branch ?? "This HEAD"} has no commits that {state.base} does not have yet.
      </p>
    );

  const { model, markdown } = state.pr;
  return (
    <div className="pr-view">
      <header className="pr-head">
        <div>
          <h2>
            {state.pr.branch ?? "HEAD"} <span className="muted">→ {state.pr.base}</span>
          </h2>
          <p className="muted">{pullRequestCounts(state.pr)}</p>
        </div>
        <div className="pr-copy">
          <button
            type="button"
            className="outline-button"
            title="The Markdown `cogit pr` prints, ready to paste as the pull request's description"
            onClick={() => {
              void copyText(markdown).then((ok) => setCopy(ok ? "copied" : "failed"));
            }}
          >
            Copy as PR description
          </button>
          {copy === "copied" ? <span className="muted">Copied.</span> : null}
          {copy === "failed" ? (
            <span className="muted">Could not copy; run `cogit pr` instead.</span>
          ) : null}
        </div>
      </header>

      {model.goals.length > 0 ? (
        <section className="pr-section">
          <h3>Goal</h3>
          <ul>
            {model.goals.map((goal) => (
              <li key={goal.sessionId}>
                {goal.text} <span className="muted">— {goal.sessionTitle}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {model.thoughts.length > 0 ? (
        <section className="pr-section">
          <h3>Thoughts</h3>
          {model.thoughts.map((thought) => (
            <ThoughtCard key={thought.id} thought={thought} onSelect={onSelect} />
          ))}
        </section>
      ) : null}

      {model.unlinked.length > 0 ? (
        <section className="pr-section">
          <h3>Commits without a recorded thought</h3>
          <ul className="pr-commits">
            {model.unlinked.map((commit) => (
              <li key={commit.full}>
                <code>{commit.short}</code> {commit.subject}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ThoughtCard({
  thought,
  onSelect,
}: {
  thought: Thought;
  onSelect: (sessionId: string, messageId: string) => void;
}) {
  const diagram = shapeDiagram(thought.shape);
  const rejected = [
    ...thought.alternatives,
    ...thought.agentDecisions.flatMap((decision) => decision.alternatives),
  ];
  return (
    <article className="pr-thought">
      <button
        type="button"
        className="pr-thought-title"
        title="Open the message: its Intent, Shape and Code"
        onClick={() => onSelect(thought.sessionId, thought.id)}
      >
        <span className="muted">{thought.label}</span> {thought.title}
      </button>
      <p className="muted pr-session">{thought.sessionTitle}</p>
      {thought.why ? <p>Why: {thought.why}</p> : null}
      {thought.agentDecisions.length > 0 ? (
        <ul>
          {thought.agentDecisions.map((decision) => (
            <li key={decision.title}>
              Agent decided: {decision.title}
              {decision.why ? <span className="muted"> — {decision.why}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {rejected.length > 0 ? (
        <>
          <h4>Considered and rejected</h4>
          <ul>
            {rejected.map((alt) => (
              <li key={alt.option}>
                {alt.option}
                {alt.why ? <span className="muted"> — {alt.why}</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {thought.ledHere.length > 0 ? (
        <>
          <h4>Led here</h4>
          <ul>
            {thought.ledHere.map((step) => (
              <li key={step.id}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => onSelect(thought.sessionId, step.id)}
                >
                  {step.label} {step.title}
                </button>
                {step.why ? <span className="muted"> — {step.why}</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {diagram === undefined ? null : (
        <MermaidDiagram source={diagram} className="shape-preview-diagram" fit />
      )}
      <ul className="pr-commits">
        {thought.commits.map((commit) => (
          <li key={commit.full}>
            <code>{commit.short}</code> {commit.subject}
          </li>
        ))}
      </ul>
    </article>
  );
}
