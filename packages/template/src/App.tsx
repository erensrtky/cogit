import type {
  LineageViewModel,
  StatusCard,
  ViewNode,
  ViewSession,
} from "../../cli/src/view/model.js";

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function NodeItem({ node }: { node: ViewNode }) {
  return (
    <li className="node">
      <div className="node-head">
        <span className={`kind kind-${node.kind}`}>{node.kind}</span>
        <strong>{node.title}</strong>
        {node.at ? <time dateTime={node.at}>{formatTime(node.at)}</time> : null}
      </div>
      {node.summary ? <p>{node.summary}</p> : null}
      {node.why ? (
        <p className="why">
          <span>why</span> {node.why}
        </p>
      ) : null}
      {node.children.length > 0 ? <NodeList nodes={node.children} /> : null}
    </li>
  );
}

function NodeList({ nodes }: { nodes: ViewNode[] }) {
  if (nodes.length === 0) return <p className="empty">No steps recorded yet.</p>;
  return (
    <ul className="nodes">
      {nodes.map((node) => (
        <NodeItem key={node.id} node={node} />
      ))}
    </ul>
  );
}

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

function SessionCard({ session }: { session: ViewSession }) {
  return (
    <article className="session">
      <header>
        <h3>{session.title || session.sessionId}</h3>
        <code>{session.sessionId}</code>
        <span className="muted">updated {formatTime(session.updatedAt)}</span>
      </header>
      <p className="session-goal">{session.status.goal}</p>
      <NodeList nodes={session.nodes} />
    </article>
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

      {model.epochs.map((epoch) => (
        <section className="epoch" key={epoch.id}>
          <h2>
            {epoch.title} <span className="muted">({epoch.sessions.length})</span>
          </h2>
          {epoch.sessions.map((session) => (
            <SessionCard key={session.sessionId} session={session} />
          ))}
        </section>
      ))}

      {model.unassigned.length > 0 ? (
        <section className="epoch unassigned">
          <h2>
            Unassigned <span className="muted">({model.unassigned.length})</span>
          </h2>
          {model.unassigned.map((session) => (
            <SessionCard key={session.sessionId} session={session} />
          ))}
        </section>
      ) : null}
    </main>
  );
}
