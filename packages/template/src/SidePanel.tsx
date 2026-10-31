import { type ReactNode, useEffect, useRef, useState } from "react";
import { formatChange, isBigChange } from "../../cli/src/view/change.js";
import { timeSince } from "../../cli/src/view/inbox.js";
import type {
  LineageViewModel,
  ViewCapture,
  ViewChatTurn,
  ViewNode,
  ViewSession,
} from "../../cli/src/view/model.js";
import { type CopyState, copyText } from "./clipboard.js";
import { parseSubject, splitPath, typeColour } from "./codeRefs.js";
import { DiffView } from "./DiffView.js";
import { isLivePage, pageToken } from "./data.js";
import { formatTime, kindLabel } from "./format.js";
import { layoutGitGraph } from "./gitLayout.js";
import {
  isMessageHash,
  nodeId as messageKey,
  messageNeighbors,
  type NodeDetail,
  sessionId as sessionKey,
  shortHash,
  toNodeDetail,
} from "./graph.js";
import type { OutlineTarget } from "./Outline.js";
import { peopleOf } from "./people.js";
import { ResumeButton } from "./ResumeButton.js";
import { ShapeSection } from "./ShapeModal.js";

/**
 * What the drill-down shows: a message (with the branch it belongs to) or a
 * whole session. Ids, not copies, so a live rebuild does not leave the panel
 * showing stale text.
 */
export type Selection =
  | { type: "node"; sessionId: string; nodeId: string }
  | { type: "session"; sessionId: string };

function findSession(model: LineageViewModel, sessionId: string): ViewSession | undefined {
  return model.sessions.find((session) => session.sessionId === sessionId);
}

function findMessage(session: ViewSession, id: string): ViewNode | undefined {
  return session.messages.find((message) => message.id === id);
}

/**
 * The message's stable hash with a copy button (Story 8.10): the user pastes it
 * to the agent, which runs `cogit show <hash>` for the full record.
 */
function MessageHash({ value }: { value: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const code = useRef<HTMLElement>(null);
  const title = `Ask your agent: cogit show ${value}`;

  const copy = (): void => {
    setState("idle");
    void copyText(value).then((ok) => {
      if (ok) {
        setState("copied");
        return;
      }
      // Last resort, as for the resume command: select the hash for Ctrl+C.
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
    <div className="message-hash" title={title}>
      <code ref={code}>{shortHash(value)}</code>
      <button type="button" onClick={copy}>
        Copy hash
      </button>
      {state === "copied" ? <span className="muted">Copied.</span> : null}
      {state === "failed" ? (
        <span className="muted">Copy failed — press Ctrl+C to copy.</span>
      ) : null}
    </div>
  );
}

function ResumeRow({ model, session }: { model: LineageViewModel; session: ViewSession }) {
  return (
    <div className="resume">
      <ResumeButton
        projectPath={model.project.path}
        sessionId={session.sessionId}
        available={session.transcriptAvailable}
      />
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

const CAPTURE_STATE_LABEL = {
  suggested: "To review",
  open: "Open",
  done: "Done",
  dismissed: "Dismissed",
} as const;

/**
 * The captured work the session stands for (Story 15.3), on its card — the card
 * the session row's capture badge opens. Read-only: accepting, dismissing or
 * closing stays in the Captured list, so a stray click here cannot close work.
 * `reveal` changes when the badge asked for the section; the card then brings it
 * into view.
 */
function CapturedWork({ items, reveal = 0 }: { items: readonly ViewCapture[]; reveal?: number }) {
  const section = useRef<HTMLElement>(null);
  // A dismissed item is closed away from the reading view, like in the list.
  const shown = items
    .filter((item) => item.state !== "dismissed")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  useEffect(() => {
    if (reveal === 0) return;
    section.current?.scrollIntoView({ block: "nearest" });
  }, [reveal]);
  if (shown.length === 0) return null;
  const now = new Date().toISOString();
  return (
    <section className="captured-work" ref={section}>
      <h3>
        Captured work <span className="count">{shown.length}</span>
      </h3>
      <ul className="drilldown-list capture-here-list">
        {shown.map((item) => {
          const age = timeSince(item.updatedAt, now);
          return (
            <li key={item.id}>
              <span className={`capture-state is-${item.state}`}>
                {CAPTURE_STATE_LABEL[item.state]}
              </span>{" "}
              {item.text}
              {age === "" ? null : <span className="muted"> · {age} ago</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Where a session ran when it was not the main checkout. */
function WorktreeField({ session }: { session: ViewSession }) {
  const { worktree } = session;
  if (!worktree) return null;
  return (
    <Field label="Worktree">
      {worktree.branch ?? "detached HEAD"} <code>{worktree.path}</code>
    </Field>
  );
}

function SessionSummary({ model, session }: { model: LineageViewModel; session: ViewSession }) {
  return (
    <>
      <dl className="drilldown-meta">
        <Field label="Agent">{session.agent}</Field>
        {session.author ? (
          <Field label="Recorded by">
            {session.author}
            {peopleOf(model).mine(session) ? " (you)" : ""}
          </Field>
        ) : null}
        <Field label="Session">
          <code>{session.sessionId}</code>
        </Field>
        <Field label="Started">{formatTime(session.startedAt)}</Field>
        <Field label="Updated">{formatTime(session.updatedAt)}</Field>
        <WorktreeField session={session} />
        {session.unrecordedMessages ? (
          <Field label="Not recorded">
            {session.unrecordedMessages} message
            {session.unrecordedMessages === 1 ? "" : "s"} not recorded (the side model at session
            end is off)
          </Field>
        ) : null}
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

/** Above this length a chat entry opens folded, with a button to show the rest. */
const FOLD_AT = 1200;

function LongText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (text.length <= FOLD_AT || open) return <p className="chat-text">{text}</p>;
  return (
    <>
      <p className="chat-text">{text.slice(0, FOLD_AT)}…</p>
      <button type="button" className="chat-more" onClick={() => setOpen(true)}>
        Show all ({text.length.toLocaleString()} characters)
      </button>
    </>
  );
}

function toolLine(tools: ViewChatTurn["tools"]): string {
  const parts: string[] = [];
  if (tools.commands > 0)
    parts.push(`ran ${tools.commands} command${tools.commands === 1 ? "" : "s"}`);
  const files = tools.files.length;
  if (files > 0) parts.push(`edited ${files} file${files === 1 ? "" : "s"}`);
  if (tools.other > 0) parts.push(`${tools.other} other tool call${tools.other === 1 ? "" : "s"}`);
  return parts.join(", ");
}

/** The message as the user wrote it and the agent's written answer, from the transcript. */
function Conversation({ session, id }: { session: ViewSession | undefined; id: string }) {
  if (!session) return null;
  const turn = session.chat?.find((entry) => entry.id === id);
  let body: ReactNode;
  if (turn) {
    const tools = toolLine(turn.tools);
    body = (
      <>
        <div className="chat-entry chat-user">
          <div className="chat-who">You · {formatTime(turn.at)}</div>
          <LongText text={turn.text} />
        </div>
        <div className="chat-entry chat-agent">
          <div className="chat-who">Agent</div>
          {turn.replies.length === 0 ? (
            <p className="muted">No written reply.</p>
          ) : (
            turn.replies.map((reply, index) => (
              <LongText key={`${turn.id}-${index}`} text={reply} />
            ))
          )}
          {tools ? (
            <p className="chat-tools" title={turn.tools.files.join("\n")}>
              {tools}
            </p>
          ) : null}
        </div>
      </>
    );
  } else if (!session.transcriptAvailable) {
    // A clone has the session record (it travels with the repo) but usually not
    // the raw chat: conversations stay local unless `shareConversations` is on.
    body = (
      <p className="muted">
        This conversation is not on this machine. The summary above is what remains.
      </p>
    );
  } else {
    body = <p className="muted">This message was not found in the transcript.</p>;
  }
  return (
    <details className="chat fold">
      <summary>Conversation</summary>
      {body}
    </details>
  );
}

/** The branch a message belongs to, so the panel survives prev/next navigation. */
function branchOf(session: ViewSession, messageId: string): string | undefined {
  return layoutGitGraph(session.messages).segments.find((segment) =>
    segment.ids.includes(messageId),
  )?.id;
}

/** The branch summary of the selected message (Story 8.2), wherever it was opened from. */
function BranchDetails({
  session,
  branchId,
}: {
  session: ViewSession;
  branchId?: string | undefined;
}) {
  if (!branchId) return null;
  const segment = layoutGitGraph(session.messages).segments.find(
    (candidate) => candidate.id === branchId,
  );
  if (!segment) return null;
  const { branch } = segment;
  const span =
    branch.firstAt && branch.lastAt && branch.firstAt !== branch.lastAt
      ? ` · ${formatTime(branch.firstAt)} → ${formatTime(branch.lastAt)}`
      : "";
  return (
    <details className="branch-detail fold">
      <summary>
        Branch · <span style={{ color: `var(--l${segment.colorIndex})` }}>{branch.title}</span>
      </summary>
      <p className="branch-range">
        {branch.count > 1 ? `${branch.fromLabel}–${branch.toLabel}` : branch.fromLabel} ·{" "}
        {branch.count} message{branch.count === 1 ? "" : "s"}
        {span}
      </p>
      {branch.asked ? (
        <p>
          <b>Asked:</b> {branch.asked}
        </p>
      ) : null}
      {branch.outcome ? (
        <p>
          <b>Outcome:</b> {branch.outcome}
        </p>
      ) : null}
      {branch.open ? (
        <p>
          <b>Open:</b> {branch.open}
        </p>
      ) : null}
    </details>
  );
}

/** Previous and next message of the session, so the chat can be read in order. */
function MessageNav({
  session,
  node,
  onNavigate,
}: {
  session: ViewSession | undefined;
  node: NodeDetail;
  onNavigate: ((target: OutlineTarget) => void) | undefined;
}) {
  if (!session || !onNavigate || node.kind !== "message") return null;
  const { previous, next } = messageNeighbors(session.messages, node.nodeId);
  const go = (target: ViewNode | null) =>
    target
      ? () =>
          onNavigate({
            sessionId: session.sessionId,
            focusId: messageKey(sessionKey(session.sessionId), target.id),
            selection: {
              type: "node",
              sessionId: session.sessionId,
              nodeId: target.id,
            },
          })
      : undefined;
  return (
    <nav className="message-nav" aria-label="Messages">
      <button type="button" disabled={!previous} onClick={go(previous)} title={previous?.title}>
        ← Previous message
      </button>
      <button type="button" disabled={!next} onClick={go(next)} title={next?.title}>
        Next message →
      </button>
    </nav>
  );
}

function NodeDetails({
  model,
  node,
  onNavigate,
  bigChangeLines,
}: {
  model: LineageViewModel;
  node: NodeDetail;
  onNavigate: ((target: OutlineTarget) => void) | undefined;
  /** A change at or above this many lines is marked as big. */
  bigChangeLines: number;
}) {
  const session = findSession(model, node.sessionId);
  // Diffs are read from the local server (Story 10.5); a `file://` map has no
  // git endpoint, and the rows say so once instead of failing on every click.
  const live = typeof document !== "undefined" && isLivePage() && pageToken() !== null;
  return (
    <>
      <MessageNav session={session} node={node} onNavigate={onNavigate} />
      {node.kind === "message" && isMessageHash(node.nodeId) ? (
        <MessageHash value={node.nodeId} />
      ) : null}
      {/* The reason first; the long text folded at the end. */}
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
      {node.decidedBy ? (
        <p className="decided-by">Decided by: {DECIDED_LABEL[node.decidedBy]}</p>
      ) : null}
      {node.agentDecisions?.length ? (
        <section>
          <h3>Decided by the agent on its own</h3>
          <ul className="drilldown-list">
            {node.agentDecisions.map((decision) => (
              <li key={decision.title}>
                <strong>{decision.title}</strong>
                {decision.why ? <> — {decision.why}</> : null}
                {decision.alternatives?.length ? (
                  <ul>
                    {decision.alternatives.map((alt) => (
                      <li key={alt.option}>
                        Not: {alt.option}
                        {alt.why ? <> — {alt.why}</> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {node.work?.length ? (
        <section>
          <h3>What the agent did</h3>
          <ul className="drilldown-list">
            {node.work.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {node.kind === "message" && node.commits?.length ? (
        <ShapeSection
          node={node}
          root={model.project.path}
          enabled={model.settings?.shapes ?? true}
        />
      ) : null}
      {node.kind === "message" && node.change ? (
        <section>
          <h3>Code landed</h3>
          <p>
            <span
              className={`git-change${isBigChange(node.change, bigChangeLines) ? " is-big" : ""}`}
            >
              {formatChange(node.change)}
            </span>{" "}
            after this message.
          </p>
        </section>
      ) : null}
      {node.commits?.length ? (
        <section>
          <h3>
            Commits <span className="count">{node.commits.length}</span>
          </h3>
          <ul className="commit-list">
            {node.commits.map((commit) => {
              const tag = node.commitTags?.find((candidate) => candidate.hash === commit);
              const missing = node.commitTags !== undefined && tag?.subject === undefined;
              return (
                <CommitItem
                  key={commit}
                  hash={commit}
                  subject={tag?.subject}
                  missing={missing}
                  root={model.project.path}
                  expandable={live && !missing}
                />
              );
            })}
          </ul>
        </section>
      ) : null}
      {node.files?.length ? (
        <section>
          <h3>
            Changed files <span className="count">{node.files.length}</span>
          </h3>
          <ul className="file-list">
            {node.files.map((file) => {
              // The newest commit that touched the file; a file only the record
              // lists has no patch to open.
              const owner = [...(node.commitTags ?? [])]
                .reverse()
                .find((tag) => tag.files?.includes(file));
              return (
                <FileItem
                  key={file}
                  file={file}
                  root={model.project.path}
                  commit={owner?.hash}
                  expandable={live && owner !== undefined}
                />
              );
            })}
          </ul>
        </section>
      ) : null}
      {!live && (node.commits?.length || node.files?.length) ? (
        <p className="muted">Open with `cogit open` to see diffs.</p>
      ) : null}
      {node.kind === "message" ? <Conversation session={session} id={node.nodeId} /> : null}
      {session ? (
        <BranchDetails session={session} branchId={branchOf(session, node.nodeId)} />
      ) : null}
      <dl className="drilldown-meta">
        <Field label={node.kind === "message" ? "Sent" : "Recorded"}>
          {formatTime(node.at ?? node.addedAt ?? null)}
        </Field>
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
            <WorktreeField session={session} />
          </>
        ) : null}
      </dl>
      {session ? <ResumeRow model={model} session={session} /> : null}
    </>
  );
}

/**
 * One commit of a message: the short hash, the Conventional Commits type as a
 * coloured badge, the scope and the description. A commit git no longer has
 * stays listed, greyed (Story 8.8). On a live page the row opens the patch the
 * commit carries (Story 10.5).
 */
function CommitItem({
  hash,
  subject,
  missing,
  root,
  expandable,
}: {
  hash: string;
  subject: string | undefined;
  missing: boolean;
  root: string;
  expandable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const parsed = subject === undefined ? undefined : parseSubject(subject);
  const lane = parsed?.type === undefined ? undefined : typeColour(parsed.type);
  const content = (
    <>
      <code className="commit-hash">{hash.slice(0, 7)}</code>
      {parsed?.type ? (
        <span
          className="commit-type"
          style={lane === undefined ? undefined : { background: `var(--l${lane})` }}
        >
          {parsed.type}
          {parsed.breaking ? "!" : ""}
        </span>
      ) : null}
      {parsed?.scope ? <span className="commit-scope">{parsed.scope}</span> : null}
      <span className="commit-subject">{parsed ? parsed.text : "not in this repository"}</span>
      {expandable ? <span className="diff-caret">{open ? "−" : "+"}</span> : null}
    </>
  );
  return (
    <li className={missing ? "commit-item is-missing" : "commit-item"} title={hash}>
      {expandable ? (
        <button
          type="button"
          className="commit-row"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {content}
        </button>
      ) : (
        <div className="commit-row">{content}</div>
      )}
      {open ? <DiffView dir={root} commit={hash} /> : null}
    </li>
  );
}

/**
 * One file of a message's changes (Story 10.5). It opens the patch of the
 * commit that touched it; a file only the record lists stays a plain row.
 */
function FileItem({
  file,
  root,
  commit,
  expandable,
}: {
  file: string;
  root: string;
  commit: string | undefined;
  expandable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { dir, name } = splitPath(file);
  const content = (
    <>
      <span className="file-name">{name}</span>
      {dir ? <span className="file-dir">{dir}</span> : null}
      {expandable ? <span className="diff-caret">{open ? "−" : "+"}</span> : null}
    </>
  );
  return (
    <li title={file}>
      {expandable && commit !== undefined ? (
        <button
          type="button"
          className="file-row"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {content}
        </button>
      ) : (
        <div className="file-row">{content}</div>
      )}
      {open && commit !== undefined ? <DiffView dir={root} commit={commit} file={file} /> : null}
    </li>
  );
}

/**
 * The session's "squash message" (Story 8.7): what the whole session was for,
 * what it got done and what is still open.
 */
function SessionDetails({
  model,
  session,
  captureReveal = 0,
}: {
  model: LineageViewModel;
  session: ViewSession;
  /** Changes when the session row's capture badge asked for its section (Story 15.3). */
  captureReveal?: number;
}) {
  const { done, pending } = session.status;
  return (
    <>
      <section>
        <h3>Goal</h3>
        <p>{session.status.goal || "No goal recorded."}</p>
      </section>
      <section>
        <h3>Done</h3>
        {done.length > 0 ? (
          <ul className="drilldown-list">
            {done.map((item, index) => (
              <li key={`${index}-${item}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">Nothing yet.</p>
        )}
      </section>
      <section>
        <h3>Pending</h3>
        {pending.length > 0 ? (
          <ul className="drilldown-list">
            {pending.map((item, index) => (
              <li
                key={`${index}-${item.text}`}
                className={item.needsUser ? "needs-user" : undefined}
              >
                {item.text}
                {item.needsUser ? <span className="badge">needs you</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Nothing pending.</p>
        )}
      </section>
      <section>
        <h3>Next</h3>
        <p>{session.status.next || "No next step recorded."}</p>
      </section>
      <CapturedWork
        items={(model.captures ?? []).filter((item) => item.source.sessionId === session.sessionId)}
        reveal={captureReveal}
      />
      <SessionSummary model={model} session={session} />
    </>
  );
}

/** Side panel for a clicked node or session, with the resume button. */
export function DrillDown({
  model,
  selection,
  captureReveal = 0,
  onClose,
  onNavigate,
  bigChangeLines = 300,
}: {
  model: LineageViewModel;
  selection: Selection | null;
  /** Counts the clicks on a session row's capture badge; the card shows the section (15.3). */
  captureReveal?: number;
  onClose: () => void;
  /** Moves the selection to another node and reveals it on the map. */
  onNavigate?: (target: OutlineTarget) => void;
  bigChangeLines?: number;
}) {
  useEffect(() => {
    if (!selection) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        // The three-layer modal sits on top; Escape closes it first.
        if (document.querySelector(".shape-overlay") !== null) return;
        onClose();
      }
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
          <SessionDetails model={model} session={session} captureReveal={captureReveal} />
        </div>
      </aside>
    );
  }

  const session = findSession(model, selection.sessionId);
  const message = session ? findMessage(session, selection.nodeId) : undefined;
  if (!session || !message) return null;
  const node = toNodeDetail(message, session.sessionId);
  return (
    <aside className="drilldown" role="dialog" aria-label="Message details">
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
        <NodeDetails
          model={model}
          node={node}
          onNavigate={onNavigate}
          bigChangeLines={bigChangeLines}
        />
      </div>
    </aside>
  );
}
