import { useState } from "react";
import { resumeCommand } from "../../cli/src/view/resume.js";
import { type CopyState, copyText } from "./clipboard.js";

/**
 * The resume control (Story 8.7, reused by the inbox in 11.1): copies
 * `cd '<project>' && claude --resume <id>` so the user can go back to the
 * session in a terminal. `onFailed` lets a page that shows the command select
 * it, so Ctrl+C still works when both clipboard paths fail over `file://`.
 */
export function ResumeButton({
  projectPath,
  sessionId,
  available = true,
  revealCommand = false,
  onFailed,
}: {
  projectPath: string;
  sessionId: string;
  /** False when the transcript is gone, so resuming cannot work. */
  available?: boolean;
  /**
   * Shows the command when the clipboard fails, for a page with no command of
   * its own on screen (the inbox row); the side panel already prints it.
   */
  revealCommand?: boolean;
  onFailed?: () => void;
}) {
  const [state, setState] = useState<CopyState>("idle");

  if (!available) {
    return (
      <button type="button" className="resume-button" disabled>
        Copy resume command
      </button>
    );
  }

  const copy = (): void => {
    setState("idle");
    void copyText(resumeCommand(projectPath, sessionId)).then((ok) => {
      if (!ok) onFailed?.();
      setState(ok ? "copied" : "failed");
    });
  };

  return (
    <>
      <button type="button" className="resume-button" onClick={copy}>
        Copy resume command
      </button>
      {state === "copied" ? <span className="muted resume-note">Copied.</span> : null}
      {state === "failed" ? (
        <span className="muted resume-note">Copy failed — press Ctrl+C to copy.</span>
      ) : null}
      {revealCommand && state === "failed" ? (
        <code className="resume-command inbox-resume-command">
          {resumeCommand(projectPath, sessionId)}
        </code>
      ) : null}
    </>
  );
}
