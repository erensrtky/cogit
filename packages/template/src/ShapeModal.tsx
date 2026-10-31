import { type ReactNode, useEffect, useRef, useState } from "react";
import { TOKEN_HEADER_NAME, type ViewNode } from "../../cli/src/view/model.js";
import {
  flowToMermaid,
  parseFlow,
  SHAPE_READING,
  shapeKindsUsed,
  shapePreview,
  shapeState,
  tableRows,
  UNIVERSAL_KINDS,
} from "../../cli/src/view/shape.js";
import { DiffView } from "./DiffView.js";
import { isLivePage, pageToken } from "./data.js";
import { HelpTip } from "./HelpTip.js";
import { MermaidDiagram } from "./MermaidDiagram.js";

/**
 * Intent, Shape and Code (Story 13.6): the three layers of a message that
 * landed commits, top to bottom, with 1/2/3 tabs. Opening on Shape shows what
 * the change does first; Intent is the record, read but never rewritten here,
 * and Code is the same diff the panel already shows.
 */
export type ShapeTab = "intent" | "shape" | "code";

/** The fields the three layers read; a message node or the panel's detail both fit. */
export interface ShapeNode {
  title: string;
  kind: ViewNode["kind"];
  why?: string | undefined;
  alternatives?: ViewNode["alternatives"];
  agentDecisions?: ViewNode["agentDecisions"];
  work?: ViewNode["work"];
  decidedBy?: ViewNode["decidedBy"];
  commits?: string[] | undefined;
  commitTags?: ViewNode["commitTags"];
  shape?: ViewNode["shape"];
  /** The owning session and the message's id: what the Regenerate button posts. */
  sessionId?: string | undefined;
  nodeId?: string | undefined;
}

const TABS: { id: ShapeTab; number: string; label: string }[] = [
  { id: "intent", number: "1", label: "Intent" },
  { id: "shape", number: "2", label: "Shape" },
  { id: "code", number: "3", label: "Code" },
];

const DECIDED_LABEL = {
  user: "You",
  agent: "The agent, on its own",
  agreed: "You, approving the agent's proposal",
} as const;

/** The record's Intent: the same fields the panel shows, in reading order. */
function IntentLayer({ node }: { node: ShapeNode }) {
  const empty =
    !node.why &&
    !node.alternatives?.length &&
    !node.agentDecisions?.length &&
    !node.work?.length &&
    !node.decidedBy;
  if (empty) return <p className="muted">No reason was recorded for this message.</p>;
  return (
    <div className="shape-intent">
      {node.why ? (
        <section>
          <h4>Why</h4>
          <p>{node.why}</p>
        </section>
      ) : null}
      {node.alternatives?.length ? (
        <section>
          <h4>Considered and rejected</h4>
          <ul>
            {node.alternatives.map((alt) => (
              <li key={alt.option}>
                <strong>{alt.option}</strong>
                {alt.why ? <> — {alt.why}</> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {node.agentDecisions?.length ? (
        <section>
          <h4>Decided by the agent on its own</h4>
          <ul>
            {node.agentDecisions.map((decision) => (
              <li key={decision.title}>
                <strong>{decision.title}</strong>
                {decision.why ? <> — {decision.why}</> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {node.work?.length ? (
        <section>
          <h4>What the agent did</h4>
          <ul>
            {node.work.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {node.decidedBy ? (
        <p className="decided-by">Decided by: {DECIDED_LABEL[node.decidedBy]}</p>
      ) : null}
    </div>
  );
}

/** How a tool's output is named when it is shown as plain text. */
const TEXT_CAPTION: Record<string, string> = {
  pseudo: "Steps",
  example: "Example",
  flow: "Flow source (not drawn)",
  mermaid: "Flowchart source (not drawn)",
  sequence: "Sequence source (not drawn)",
  table: "Before / After (as written)",
  interface: "Interface (as written)",
};

/** Tools whose "?" lists every kind, so the reader can decode the symbols. */
const KINDS_CAPTIONS = new Set(["flow", "pseudo"]);

/**
 * A tool's caption with a "?" that says how to read it; a Flow or Steps also
 * lists every kind, so the symbols name themselves. `reading` swaps in another
 * tool's explanation (an ordered Flow reads like a Sequence).
 */
function ToolCaption({
  id,
  kind,
  label,
  reading = kind,
}: {
  id: string;
  kind: string;
  label: string;
  reading?: string;
}) {
  const help = SHAPE_READING[reading];
  const listsKinds = KINDS_CAPTIONS.has(kind);
  return (
    <figcaption className="shape-caption">
      <span>{label}</span>
      {help ? (
        <HelpTip id={`shape-${id}`} label={`How to read the ${label}`}>
          <span className="shape-reading">{help}</span>
          {listsKinds ? (
            <span className="shape-kinds">
              {UNIVERSAL_KINDS.map((kind) => (
                <span key={kind.id} className="shape-kind-row">
                  <code>{kind.symbol}</code> {kind.name} — {kind.means}
                </span>
              ))}
            </span>
          ) : null}
        </HelpTip>
      ) : null}
    </figcaption>
  );
}

/** Tools Mermaid draws; a Flow is turned into Mermaid source first. */
const DIAGRAM_KINDS = new Set(["flow", "mermaid", "sequence"]);

/** A diagram tool's caption, distinct from the plain-text fallback caption. */
function diagramLabel(kind: string): string {
  if (kind === "sequence") return "Sequence";
  if (kind === "flow") return "Flow";
  return "Flowchart";
}

/** The header of each table tool; the writer sends only the rows. */
const TABLE_COLUMNS: Record<string, readonly [string, string, string]> = {
  table: ["Case", "Before", "After"],
  interface: ["Item", "Before", "After"],
};

/** A three-column table: Before / After or Interface, one row per case or item. */
function ShapeTable({
  columns,
  rows,
}: {
  columns: readonly [string, string, string];
  rows: readonly (readonly [string, string, string])[];
}) {
  return (
    <table className="shape-table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(([what, before, after], index) => (
          <tr key={`${index}-${what}`}>
            <th scope="row">{what}</th>
            <td>{before}</td>
            <td>{after}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The Shape layer: each tool's output; Mermaid drawn, the table laid out. */
function ShapeLayer({
  node,
  enabled,
  renderMermaid,
}: {
  node: ShapeNode;
  enabled: boolean;
  renderMermaid: (source: string) => ReactNode;
}) {
  const state = shapeState(node.shape, enabled);
  if (state === "off") {
    return <p className="muted">Shapes are off. Turn them on in Settings → Recording.</p>;
  }
  if (state === "queued") {
    return <p className="muted">This Shape is being prepared, or the message landed no commits.</p>;
  }
  if (state === "empty") {
    return <p className="muted">Nothing to show: the change was too small to draw.</p>;
  }
  const tools = node.shape?.tools ?? [];
  const kinds = shapeKindsUsed(tools);
  return (
    <div className="shape-tools">
      {kinds.length > 0 ? (
        <div className="shape-legend" aria-label="Kinds in this Shape">
          {kinds.map((kind) => (
            <span key={kind.id} className="shape-kind">
              <span className="shape-kind-symbol">{kind.symbol}</span>
              {kind.name}
            </span>
          ))}
        </div>
      ) : null}
      {tools.map((tool, index) => {
        const key = `${tool.kind}-${index}`;
        const source = tool.kind === "flow" ? flowToMermaid(tool.text) : tool.text;
        const orderedFlow = tool.kind === "flow" && parseFlow(tool.text)?.ordered === true;
        if (DIAGRAM_KINDS.has(tool.kind) && tool.valid !== false && source !== undefined)
          return (
            <figure key={key} className="shape-figure">
              {renderMermaid(source)}
              <ToolCaption
                id={key}
                kind={tool.kind}
                label={orderedFlow ? "Sequence" : diagramLabel(tool.kind)}
                reading={orderedFlow ? "sequence" : tool.kind}
              />
            </figure>
          );
        const columns = TABLE_COLUMNS[tool.kind];
        const rows = columns && tool.valid !== false ? tableRows(tool.text) : undefined;
        if (columns && rows !== undefined)
          return (
            <figure key={key} className="shape-figure">
              <ShapeTable columns={columns} rows={rows} />
              <ToolCaption
                id={key}
                kind={tool.kind}
                label={tool.kind === "interface" ? "Interface" : "Before / After"}
              />
            </figure>
          );
        return (
          <figure key={key} className="shape-figure">
            <pre className={`shape-source is-${tool.kind}`}>{tool.text}</pre>
            <ToolCaption id={key} kind={tool.kind} label={TEXT_CAPTION[tool.kind] ?? tool.kind} />
          </figure>
        );
      })}
      {node.shape?.by ? (
        <p className="shape-by">
          Written by {node.shape.by === "side" ? "the side model" : "the agent"}.
        </p>
      ) : null}
    </div>
  );
}

/** What the Regenerate button posts: the message and the project it belongs to. */
export interface RegenerateRequest {
  dir: string;
  sessionId: string;
  nodeId: string;
}

/** The POST the button makes; the token is the one the served page carries. */
async function requestShape(request: RegenerateRequest): Promise<void> {
  const token = pageToken();
  if (token === null) throw new Error("Open the map with `cogit open` to regenerate a Shape.");
  const response = await fetch("/api/shape/regenerate", {
    method: "POST",
    headers: { "content-type": "application/json", [TOKEN_HEADER_NAME]: token },
    body: JSON.stringify(request),
  });
  if (response.ok) return;
  const text = (await response.text()).trim();
  throw new Error(text === "" ? `the Shape was not written (${response.status})` : text);
}

/**
 * Asks the side model to write this message's Shape again, for the answer a
 * small model missed or one the reader wants differently. The server holds the
 * request until the model answers and then rebuilds the open maps, so the layer
 * swaps in the new Shape by itself; this only shows whether the ask is running.
 */
function RegenerateButton({ request }: { request: RegenerateRequest }) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const run = async (): Promise<void> => {
    setState("running");
    setError("");
    try {
      await requestShape(request);
      setState("done");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <div className="shape-regenerate">
      <button
        type="button"
        className="shape-regenerate-button"
        title="Ask the side model to write this Shape again"
        onClick={() => void run()}
        disabled={state === "running"}
      >
        {state === "running" ? "Regenerating…" : "Regenerate"}
      </button>
      {state === "done" ? <span className="muted">Written again.</span> : null}
      {state === "error" ? <span className="shape-regenerate-error">{error}</span> : null}
    </div>
  );
}

/** The Code layer: the message's commits and their patches. */
function CodeLayer({ node, root }: { node: ShapeNode; root: string }) {
  const live = typeof document !== "undefined" && isLivePage();
  const commits = node.commits ?? [];
  if (commits.length === 0) return <p className="muted">No commit is linked to this message.</p>;
  return (
    <div className="shape-code">
      {commits.map((commit) => (
        <section key={commit}>
          <h4>
            <code>{commit.slice(0, 7)}</code>{" "}
            {node.commitTags?.find((tag) => tag.hash === commit)?.subject ?? ""}
          </h4>
          {live ? <DiffView dir={root} commit={commit} /> : null}
        </section>
      ))}
      {live ? null : <p className="muted">Open with `cogit open` to see the diffs.</p>}
    </div>
  );
}

/**
 * The three layers with their tabs. Presentational (no state, no effects) so a
 * render test can check the layers and the pending states without a browser;
 * `renderMermaid` lets that test stand in for the real renderer.
 */
export function ShapeLayers({
  node,
  root,
  tab,
  enabled,
  onTab,
  regenerate,
  renderMermaid = (source) => <MermaidDiagram source={source} />,
}: {
  node: ShapeNode;
  root: string;
  tab: ShapeTab;
  enabled: boolean;
  onTab: (tab: ShapeTab) => void;
  /** Set on a served page for a message that can be shaped again. */
  regenerate?: RegenerateRequest | undefined;
  renderMermaid?: (source: string) => ReactNode;
}) {
  return (
    <div className="shape-layers">
      <div className="shape-tabs" role="tablist" aria-label="Intent, Shape and Code">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={tab === entry.id ? "shape-tab is-active" : "shape-tab"}
            onClick={() => onTab(entry.id)}
          >
            <span className="shape-tab-no">{entry.number}</span> {entry.label}
          </button>
        ))}
      </div>
      <div
        className="shape-layer"
        role="tabpanel"
        aria-label={TABS.find((entry) => entry.id === tab)?.label}
      >
        {tab === "intent" ? <IntentLayer node={node} /> : null}
        {tab === "shape" ? (
          <>
            <ShapeLayer node={node} enabled={enabled} renderMermaid={renderMermaid} />
            {regenerate === undefined ? null : <RegenerateButton request={regenerate} />}
          </>
        ) : null}
        {tab === "code" ? <CodeLayer node={node} root={root} /> : null}
      </div>
    </div>
  );
}

/** The large modal, opened from the panel's code section. */
export function ShapeModal({
  node,
  root,
  enabled,
  regenerate,
  onClose,
}: {
  node: ShapeNode;
  root: string;
  enabled: boolean;
  regenerate?: RegenerateRequest | undefined;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ShapeTab>("shape");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    box.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      } else if (event.key === "1") setTab("intent");
      else if (event.key === "2") setTab("shape");
      else if (event.key === "3") setTab("code");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="shape-overlay" onClick={onClose}>
      <div
        ref={box}
        className="shape-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${node.title} — Intent, Shape and Code`}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shape-head">
          <div>
            <span className="kind">message</span>
            <h2>{node.title}</h2>
          </div>
          <button type="button" className="drilldown-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <ShapeLayers
          node={node}
          root={root}
          tab={tab}
          enabled={enabled}
          onTab={setTab}
          regenerate={regenerate}
        />
      </div>
    </div>
  );
}

/**
 * The panel's code section entry (Story 13.6): a short preview of the Shape and
 * an Open button that shows the three layers. With no Shape yet it still opens,
 * and the Shape tab explains why (queued or off).
 */
export function ShapeSection({
  node,
  root,
  enabled,
}: {
  node: ShapeNode;
  root: string;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const state = shapeState(node.shape, enabled);
  const preview = shapePreview(node.shape);
  // Only a page the local server served can ask for a new Shape: over
  // `file://` nothing would answer, and the button stays out.
  const live = typeof document !== "undefined" && isLivePage();
  const regenerate =
    enabled && live && node.sessionId !== undefined && node.nodeId !== undefined
      ? { dir: root, sessionId: node.sessionId, nodeId: node.nodeId }
      : undefined;
  const diagram = node.shape?.tools.find(
    (tool) => DIAGRAM_KINDS.has(tool.kind) && tool.valid !== false,
  );
  const diagramSource =
    diagram === undefined
      ? undefined
      : diagram.kind === "flow"
        ? flowToMermaid(diagram.text)
        : diagram.text;
  return (
    <section className="shape-section">
      <h3>Intent, Shape and Code</h3>
      {state === "ready" ? (
        preview ? (
          <pre className="shape-preview">{preview}</pre>
        ) : diagramSource !== undefined ? (
          <MermaidDiagram source={diagramSource} className="shape-preview-diagram" fit />
        ) : null
      ) : state === "off" ? (
        <p className="muted">Shapes are off.</p>
      ) : state === "empty" ? (
        <p className="muted">Nothing to show for this change.</p>
      ) : (
        <p className="muted">Shape is being prepared.</p>
      )}
      <button type="button" className="shape-open" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? (
        <ShapeModal
          node={node}
          root={root}
          enabled={enabled}
          regenerate={regenerate}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </section>
  );
}
