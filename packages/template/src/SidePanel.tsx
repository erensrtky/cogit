import { useEffect, useRef, useState } from "react";
import type { LineageViewModel, ViewSession } from "../../cli/src/view/model.js";
import { resumeCommand } from "../../cli/src/view/resume.js";
import { formatTime, kindLabel } from "./format.js";
import type { NodeDetail } from "./graph.js";

/** What the drill-down shows: a graph node or a whole session. */
export type Selection = { type: "node"; node: NodeDetail } | { type: "session"; sessionId: string };

function findSession(model: LineageViewModel, sessionId: string): ViewSession | undefined {
  for (const epoch of model.epochs) {
    for (const session of epoch.sessions) {
      if (session.sessionId === sessionId) return session;
    }
  }
  return model.unassigned.find((session) => session.sessionId === sessionId);
}

/**
 * `navigator.clipboard` is unavailable or rejected in some `file://` contexts,
 * so fall back to the hidden-textarea + `execCommand("copy")` path.
 * Returns false when both fail, letting the caller select the text instead.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

type CopyState = "idle" | "copied" | "failed";

function ResumeRow({ model, session }: { model: LineageViewModel; session: ViewSession }) {
  const [state, setState] = useState<CopyState>("idle");
  const code = useRef<HTMLElement>(null);
  const command = resumeCommand(model.project.path, session.sessionId);

  if (!session.transcriptAvailable) {
    return (
      <div className="resume">
        <button type="button" className="resume-button" disabled>
          Copy resume command
        </button>
        <p className="muted resume-note">session no longer available</p>
      </div>
    );
  }

  const copy = (): void => {
    setState("idle");
    void copyText(command).then((ok) => {
      if (ok) {
        setState("copied");
        return;
      }
      // Last resort: select the command so the user can press Ctrl+C.
      const element = code.current;
      if (element) {
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setState("failed");
    });
  };

  return (
    <div className="resume">
      <button type="button" className="resume-button" onClick={copy}>
        Copy resume command
      </button>
      {state === "copied" ? <p className="muted resume-note">Copied.</p> : null}
      {state === "failed" ? (
        <p className="muted resume-note">Copy failed — press Ctrl+C to copy.</p>
      ) : null}
      <pre className="resume-command">
        <code ref={code}>{command}</code>
      </pre>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="drilldown-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function SessionSummary({ model, session }: { model: LineageViewModel; session: ViewSession }) {
  return (
    <>
      <dl className="drilldown-meta">
        <Field label="Agent">{session.agent}</Field>
        <Field label="Session">
          <code>{session.sessionId}</code>
        </Field>
        <Field label="Started">{formatTime(session.startedAt)}</Field>
        <Field label="Updated">{formatTime(session.updatedAt)}</Field>
      </dl>
      <ResumeRow model={model} session={session} />
    </>
  );
}

const DECIDED_LABEL = {
  user: "You",
  agent: "The agent, on its own",
  agreed: "You, approving the agent's proposal",
} as const;

function NodeDetails({ model, node }: { model: LineageViewModel; node: NodeDetail }) {
  const session = findSession(model, node.sessionId);
  return (
    <>
      {node.summary ? (
        <section>
          <h3>Summary</h3>
          <p>{node.summary}</p>
        </section>
      ) : null}
      {node.why ? (
        <section>
          <h3>Why</h3>
          <p>{node.why}</p>
        </section>
      ) : null}
      {node.alternatives?.length ? (
        <section>
          <h3>Considered and rejected</h3>
          <ul className="drilldown-list">
            {node.alternatives.map((alt) => (
              <li key={alt.option}>
                <strong>{alt.option}</strong>
                {alt.why ? <> — {alt.why}</> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {node.commits?.length || node.files?.length ? (
        <section>
          <h3>In the code</h3>
          {node.commits?.length ? (
            <p className="drilldown-code">
              {node.commits.map((commit) => (
                <code key={commit}>{commit}</code>
              ))}
            </p>
          ) : null}
          {node.files?.length ? (
            <ul className="drilldown-list">
              {node.files.map((file) => (
                <li key={file}>
                  <code>{file}</code>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      <dl className="drilldown-meta">
        {node.decidedBy ? <Field label="Decided by">{DECIDED_LABEL[node.decidedBy]}</Field> : null}
        <Field label="Recorded">{formatTime(node.at ?? node.addedAt ?? null)}</Field>
        {node.touchedAt && node.touchedAt !== node.addedAt ? (
          <Field label="Last changed">{formatTime(node.touchedAt)}</Field>
        ) : null}
        <Field label="Session">
          {session ? (
            <>
              {session.title || session.sessionId} <code>{session.sessionId}</code>
            </>
          ) : (
            <code>{node.sessionId}</code>
          )}
        </Field>
        {session ? (
          <>
            <Field label="Session started">{formatTime(session.startedAt)}</Field>
            <Field label="Session updated">{formatTime(session.updatedAt)}</Field>
          </>
        ) : null}
      </dl>
      {session ? <ResumeRow model={model} session={session} /> : null}
    </>
  );
}

function SessionDetails({ model, session }: { model: LineageViewModel; session: ViewSession }) {
  return (
    <>
      <section>
        <h3>Goal</h3>
        <p>{session.status.goal || "No goal recorded."}</p>
      </section>
      <section>
        <h3>Next</h3>
        <p>{session.status.next || "No next step recorded."}</p>
      </section>
      <SessionSummary model={model} session={session} />
    </>
  );
}

/** Side panel for a clicked node or session, with the resume button. */
export function DrillDown({
  model,
  selection,
  onClose,
}: {
  model: LineageViewModel;
  selection: Selection | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!selection) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, onClose]);

  if (!selection) return null;

  if (selection.type === "session") {
    const session = findSession(model, selection.sessionId);
    if (!session) return null;
    return (
      <aside className="drilldown" role="dialog" aria-label="Session details">
        <header className="drilldown-head">
          <div>
            <span className="kind">session</span>
            <h2>{session.title || session.sessionId}</h2>
          </div>
          <button type="button" className="drilldown-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="drilldown-body">
          <SessionDetails model={model} session={session} />
        </div>
      </aside>
    );
  }

  const { node } = selection;
  return (
    <aside className="drilldown" role="dialog" aria-label="Node details">
      <header className="drilldown-head">
        <div>
          <span className={`kind kind-${node.kind}`}>{kindLabel(node.kind)}</span>
          <h2>{node.title}</h2>
        </div>
        <button type="button" className="drilldown-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="drilldown-body">
        <NodeDetails model={model} node={node} />
      </div>
    </aside>
  );
}
