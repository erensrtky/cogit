import type { LineageViewModel, StatusCard } from "../../cli/src/view/model.js";
import { formatTime } from "./format.js";
import { Graph } from "./Graph.js";

function StatusPanel({ status }: { status: StatusCard }) {
  return (
    <section className="status" aria-label="Project status">
      <div className="status-goal">
        <h2>Goal</h2>
        <p>{status.goal || "No goal recorded."}</p>
      </div>
      <div>
        <h3>Done</h3>
        {status.done.length > 0 ? (
          <ul>
            {status.done.map((item, i) => (
              <li key={`${i}-${item}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="empty">Nothing yet.</p>
        )}
      </div>
      <div>
        <h3>Pending</h3>
        {status.pending.length > 0 ? (
          <ul>
            {status.pending.map((item, i) => (
              <li key={`${i}-${item.text}`} className={item.needsUser ? "needs-user" : undefined}>
                {item.text}
                {item.needsUser ? <span className="badge">needs you</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Nothing pending.</p>
        )}
      </div>
      <div>
        <h3>Next</h3>
        <p>{status.next || "No next step recorded."}</p>
        <h3>Last activity</h3>
        <p>{formatTime(status.lastActivity)}</p>
      </div>
    </section>
  );
}

export function App({ model }: { model: LineageViewModel }) {
  const sessionCount =
    model.epochs.reduce((sum, epoch) => sum + epoch.sessions.length, 0) + model.unassigned.length;

  return (
    <main>
      <header className="project">
        <div>
          <h1>{model.project.name}</h1>
          <p className="muted">{model.project.path}</p>
        </div>
        <div className="meta">
          <span>
            {model.epochs.length} epochs · {sessionCount} sessions
          </span>
          <span className="muted">generated {formatTime(model.project.generatedAt)}</span>
        </div>
      </header>

      <StatusPanel status={model.status} />

      <Graph model={model} />
    </main>
  );
}
