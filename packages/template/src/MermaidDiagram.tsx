import { useEffect, useRef, useState } from "react";

/**
 * Draws a Mermaid flowchart (Story 13.6). Mermaid is ~3.5 MB, so it is not
 * part of the map: the local server hands it out at `MERMAID_URL` and the page
 * loads it the first time a diagram is shown. A map opened from `file://` has
 * no server, so it shows the diagram's source as text; a source the renderer
 * refuses falls back to the text too.
 */
export const MERMAID_URL = "/assets/mermaid.js";

interface Mermaid {
  initialize(config: Record<string, unknown>): void;
  render(id: string, source: string): Promise<{ svg: string }>;
}

declare global {
  interface Window {
    mermaid?: Mermaid;
  }
}

let loading: Promise<Mermaid> | undefined;

/** True when the page came from the cogit server, which serves Mermaid. */
export function mermaidAvailable(
  protocol: string = typeof window === "undefined" ? "file:" : window.location.protocol,
): boolean {
  return protocol === "http:" || protocol === "https:";
}

function loadMermaid(): Promise<Mermaid> {
  loading ??= new Promise<Mermaid>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = MERMAID_URL;
    script.onload = () => {
      const mermaid = window.mermaid;
      if (mermaid === undefined) reject(new Error("mermaid did not load"));
      else {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "neutral",
          fontFamily: "inherit",
        });
        resolve(mermaid);
      }
    };
    script.onerror = () => {
      loading = undefined;
      reject(new Error("mermaid did not load"));
    };
    document.head.append(script);
  });
  return loading;
}

let seq = 0;

/**
 * Gives a drawn diagram its own width: Mermaid writes `width="100%"`, which
 * shrinks a wide diagram's text to fit; the Open window scrolls it instead.
 */
export function naturalSize(svg: SVGSVGElement): void {
  const width = svg.style.maxWidth;
  if (width === "") return;
  svg.style.width = width;
  svg.style.maxWidth = "none";
}

export function MermaidDiagram({
  source,
  className,
  fit = false,
}: {
  source: string;
  className?: string;
  /** Shrink to the box (the panel's preview) instead of keeping the drawn size. */
  fit?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const available = mermaidAvailable();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    setFailed(false);
    const id = `cogit-shape-${(seq += 1)}`;
    loadMermaid()
      .then((mermaid) => mermaid.render(id, source))
      .then(({ svg }) => {
        if (cancelled || host.current === null) return;
        host.current.innerHTML = svg;
        const drawn = host.current.querySelector("svg");
        if (!fit && drawn !== null) naturalSize(drawn);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [source, available, fit]);

  const extra = className ? ` ${className}` : "";
  if (!available)
    return (
      <div className={`shape-offline${extra}`}>
        <pre className="shape-source">{source}</pre>
        <p className="shape-note">
          The diagram is drawn when the map is opened with <code>cogit open</code>.
        </p>
      </div>
    );
  if (failed) return <pre className={`shape-source${extra}`}>{source}</pre>;
  return <div ref={host} className={`shape-diagram${extra}`} />;
}
