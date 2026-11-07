import { useState } from "react";
import { resumeCommand } from "../../cli/src/view/resume.js";
import { type CopyState, copyText } from "./clipboard.js";

type Action = "resume" | "fork";

const LABELS: Record<Action, string> = { resume: "Resume", fork: "Fork" };

/** Said to screen readers, where the copy sign is not seen. */
const SPOKEN: Record<Action, string> = {
  resume: "Copy the resume command",
  fork: "Copy the fork command",
};

/**
 * The copy sign in front of each label: the page cannot start Claude Code, it
 * only copies the command, and a bare "Resume" read as if it would.
 */
const COPY_SIGN = "⧉";

const HINTS: Record<Action, string> = {
  resume: "Copy the command that reopens this session where it left off",
  fork: "Copy the command that continues this session as a new one; the original stays as it is",
};

/**
 * The resume controls of the map's panels (Story 8.7): Resume copies
 * `cd '<project>' && claude --resume <id>`, Fork the same with `--fork-session`.
 * Both act on the whole session, wherever they are shown. When the clipboard
 * fails over `file://`, the command is shown selected so Ctrl+C still works.
 */
export function ResumeButton({
  projectPath,
  sessionId,
  available = true,
}: {
  projectPath: string;
  sessionId: string;
  /** False when the transcript is gone, so resuming cannot work. */
  available?: boolean;
}) {
  const [action, setAction] = useState<Action>("resume");
  const [state, setState] = useState<CopyState>("idle");

  if (!available) {
    return (
      <span className="resume-actions">
        {(["resume", "fork"] as const).map((each) => (
          <button
            key={each}
            type="button"
            className="resume-button"
            aria-label={SPOKEN[each]}
            disabled
          >
            <span aria-hidden="true">{COPY_SIGN}</span> {LABELS[each]}
          </button>
        ))}
        <span className="muted resume-note">session no longer available</span>
      </span>
    );
  }

  const copy = (next: Action): void => {
    setAction(next);
    setState("idle");
    void copyText(resumeCommand(projectPath, sessionId, next === "fork")).then((ok) =>
      setState(ok ? "copied" : "failed"),
    );
  };

  return (
    <span className="resume-actions">
      {(["resume", "fork"] as const).map((each) => (
        <button
          key={each}
          type="button"
          className="resume-button"
          title={`${HINTS[each]}: ${resumeCommand(projectPath, sessionId, each === "fork")}`}
          aria-label={SPOKEN[each]}
          onClick={() => copy(each)}
        >
          <span aria-hidden="true">{COPY_SIGN}</span> {LABELS[each]}
        </button>
      ))}
      {state === "copied" ? (
        <span className="muted resume-note">Copied the {action} command.</span>
      ) : null}
      {state === "failed" ? (
        <>
          <span className="muted resume-note">Copy failed — press Ctrl+C to copy.</span>
          <code
            className="resume-command"
            ref={(element) => {
              if (!element) return;
              const range = document.createRange();
              range.selectNodeContents(element);
              const selection = window.getSelection();
              selection?.removeAllRanges();
              selection?.addRange(range);
            }}
          >
            {resumeCommand(projectPath, sessionId, action === "fork")}
          </code>
        </>
      ) : null}
    </span>
  );
}
