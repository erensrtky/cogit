import { useEffect, useRef, useState } from "react";

/**
 * Draws a Mermaid flowchart without a network (Story 13.6): the library is a
 * dependency of the template, so the page works from `file://` too. Imported
 * only when a Shape with a diagram is first shown; the map itself does not pay
 * for it. A source the renderer refuses falls back to the text.
 */
let seq = 0;

export function MermaidDiagram({ source, className }: { source: string; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    const id = `cogit-shape-${(seq += 1)}`;
    void import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "neutral",
          fontFamily: "inherit",
        });
        return mermaid.render(id, source);
      })
      .then(({ svg }) => {
        if (!cancelled && host.current !== null) host.current.innerHTML = svg;
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (failed)
    return <pre className={`shape-source${className ? ` ${className}` : ""}`}>{source}</pre>;
  return <div ref={host} className={`shape-diagram${className ? ` ${className}` : ""}`} />;
}
