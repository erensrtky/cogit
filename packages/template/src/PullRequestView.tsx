import { useEffect, useState } from "react";
import type { ViewPullRequest } from "../../cli/src/view/model.js";
import { type CopyState, copyText } from "./clipboard.js";
import { loadPullRequest } from "./data.js";
import { formatStamp } from "./format.js";
import { MermaidDiagram } from "./MermaidDiagram.js";
import { pullRequestCounts, pullRequestState, shapeDiagram } from "./pullRequest.js";

type Thought = ViewPullRequest["model"]["thoughts"][number];

type Asked =
  | { status: "embedded" }
  | { status: "asking" }
  | { status: "answered"; pr: ViewPullRequest | null }
  | { status: "failed" };

/**
 * The map's Pull request view: the checked-out branch as `cogit pr` describes
 * it, for the person about to open the pull request. A page the local server
 * served asks for the branch each time the view opens, and again whenever the
 * window comes back into view (the user switched branches in a terminal),
 * since switching branches does not rebuild the map; a saved page shows the branch it was built on and
 * says so. A thought opens its card, where the Shape and the diff are; the copy
 * button takes the same Markdown `cogit pr` prints.
 */
export function PullRequestView({
  pr,
  builtAt,
  live,
  onSelect,
}: {
  /** The view as of the build. */
  pr: ViewPullRequest | undefined;
  builtAt: string;
  /** The local server to ask for the branch now; absent on a saved page. */
  live?: { dir: string; token: string } | undefined;
  onSelect: (sessionId: string, messageId: string) => void;
}) {
  const [asked, setAsked] = useState<Asked>(() =>
    live === undefined ? { status: "embedded" } : { status: "asking" },
  );
  const dir = live?.dir;
  const token = live?.token;
  useEffect(() => {
    if (dir === undefined || token === undefined) return;
    let current = true;
    // Asking again keeps the view on screen until the answer comes.
    const ask = () =>
      loadPullRequest(dir, token).then(
        (answer) => {
          if (current) setAsked({ status: "answered", pr: answer });
        },
        () => {
          if (current) setAsked({ status: "failed" });
        },
      );
    const askAgain = () => {
      if (document.visibilityState === "visible") void ask();
    };
    void ask();
    window.addEventListener("focus", askAgain);
    document.addEventListener("visibilitychange", askAgain);
    return () => {
      current = false;
      window.removeEventListener("focus", askAgain);
      document.removeEventListener("visibilitychange", askAgain);
    };
  }, [dir, token]);

  if (asked.status === "asking") return <p className="graph-status empty">Reading the branch…</p>;
  const shown = asked.status === "answered" ? (asked.pr ?? undefined) : pr;
  const note =
    asked.status === "answered"
      ? undefined
      : asked.status === "failed"
        ? `Could not ask cogit for the branch now; this is the branch as of ${formatStamp(builtAt)}.`
        : `As of ${formatStamp(builtAt)}, when this page was built.`;
  return <PullRequestBody pr={shown} note={note} onSelect={onSelect} />;
}

function PullRequestBody({
  pr,
  note,
  onSelect,
}: {
  pr: ViewPullRequest | undefined;
  note: string | undefined;
  onSelect: (sessionId: string, messageId: string) => void;
}) {
  const [copy, setCopy] = useState<CopyState>("idle");
  const state = pullRequestState(pr);
  const noteLine = note === undefined ? null : <p className="muted pr-note">{note}</p>;
  const empty = (text: string) => (
    <div className="pr-view pr-empty">
      <p>{text}</p>
      {noteLine}
    </div>
  );
  if (state.kind === "none")
    return empty(
      "No pull request to show: this project is not in git, has no commit yet, or has no branch to merge into.",
    );
  if (state.kind === "on-base")
    return empty(
      `You are on ${state.base}, where pull requests merge. This view fills on a branch that has commits ${state.base} does not have yet.`,
    );
  if (state.kind === "no-commits")
    return empty(
      `${state.branch ?? "This HEAD"} has no commits that ${state.base} does not have yet.`,
    );

  const { model, markdown } = state.pr;
  return (
    <div className="pr-view">
      {noteLine}
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
