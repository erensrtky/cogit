import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { type DiagramTheme, effectiveTheme, mermaidThemeVariables } from "./diagramTheme.js";
import { clampPan, fitView, type PanView, type Size, zoomAt } from "./panZoom.js";
import { getTheme, subscribeTheme, type ThemeMode } from "./theme.js";

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
      else resolve(mermaid);
    };
    script.onerror = () => {
      loading = undefined;
      reject(new Error("mermaid did not load"));
    };
    document.head.append(script);
  });
  return loading;
}

/** One of the page's colour tokens, or `undefined` when it is missing. */
function readToken(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value === "" ? undefined : value;
}

/** The palette the page is showing right now (Story 14.3). */
function pageTheme(): DiagramTheme {
  if (typeof document === "undefined") return "dark";
  const marked = document.documentElement.dataset.theme;
  const mode: ThemeMode = marked === "light" || marked === "dark" ? marked : getTheme();
  const prefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return effectiveTheme(mode, prefersDark);
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

/** How far an arrow key pans, in pixels. */
const KEY_STEP = 40;
/** Zoom per button press. */
const ZOOM_STEP = 1.25;

export function MermaidDiagram({
  source,
  className,
  fit = false,
  interactive = false,
  available = mermaidAvailable(),
}: {
  source: string;
  className?: string;
  /** Shrink to the box (the panel's preview) instead of keeping the drawn size. */
  fit?: boolean;
  /**
   * Open fitted in a fixed viewport that drags and zooms (Story 14.2): the
   * Open window's diagram. The panel's preview leaves it off.
   */
  interactive?: boolean;
  /** Whether Mermaid can be loaded; the page's protocol decides by default. */
  available?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [theme, setTheme] = useState<DiagramTheme>(pageTheme);
  const [view, setView] = useState<PanView>({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  const sizes = useCallback((): { box: Size; content: Size } | null => {
    if (viewport.current === null || host.current === null) return null;
    return {
      box: { width: viewport.current.clientWidth, height: viewport.current.clientHeight },
      // Layout size: the transform does not change it.
      content: { width: host.current.offsetWidth, height: host.current.offsetHeight },
    };
  }, []);

  const refit = useCallback(() => {
    const measured = sizes();
    if (measured !== null) setView(fitView(measured.box, measured.content));
  }, [sizes]);

  const move = useCallback(
    (next: (view: PanView) => PanView) => {
      setView((current) => {
        const measured = sizes();
        const moved = next(current);
        return measured === null ? moved : clampPan(moved, measured.box, measured.content);
      });
    },
    [sizes],
  );

  // The theme switch (and the system preference while on System) repaints the
  // diagrams in place; the Mermaid already loaded is reused, never fetched again.
  useEffect(() => {
    const update = () => setTheme(pageTheme());
    update();
    const unsubscribe = subscribeTheme(update);
    const media =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : undefined;
    media?.addEventListener("change", update);
    return () => {
      unsubscribe();
      media?.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    setFailed(false);
    const id = `cogit-shape-${(seq += 1)}`;
    loadMermaid()
      .then((mermaid) => {
        // Mermaid keeps its config globally, so it is set again for every
        // render: the colours come from the page's tokens, never from here.
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: mermaidThemeVariables(readToken),
        });
        return mermaid.render(id, source);
      })
      .then(({ svg }) => {
        if (cancelled || host.current === null) return;
        host.current.innerHTML = svg;
        const drawn = host.current.querySelector("svg");
        if (!fit && drawn !== null) naturalSize(drawn);
        if (interactive) refit();
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [source, available, fit, interactive, refit, theme]);

  // A plain wheel over the diagram zooms around the pointer and never scrolls
  // the window behind it; React's wheel listener is passive, so this one is not.
  useEffect(() => {
    const box = viewport.current;
    if (!interactive || box === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = box.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * 0.0015);
      move((current) =>
        zoomAt(current, factor, event.clientX - rect.left, event.clientY - rect.top),
      );
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [interactive, move]);

  // A resize keeps the user's scale and only pulls the diagram back in reach.
  useEffect(() => {
    if (!interactive) return;
    const onResize = () => move((current) => current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [interactive, move]);

  const zoomCentre = (factor: number) => {
    const measured = sizes();
    if (measured === null) return;
    move((current) => zoomAt(current, factor, measured.box.width / 2, measured.box.height / 2));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (start === null || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    drag.current = { id: start.id, x: event.clientX, y: event.clientY };
    move((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, [number, number]> = {
      ArrowLeft: [KEY_STEP, 0],
      ArrowRight: [-KEY_STEP, 0],
      ArrowUp: [0, KEY_STEP],
      ArrowDown: [0, -KEY_STEP],
    };
    const delta = step[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    move((current) => ({ ...current, x: current.x + delta[0], y: current.y + delta[1] }));
  };

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
  if (!interactive) return <div ref={host} className={`shape-diagram${extra}`} />;
  return (
    <div className={`shape-diagram shape-diagram-interactive${extra}`}>
      <div
        ref={viewport}
        className={`shape-viewport${dragging ? " is-dragging" : ""}`}
        tabIndex={0}
        aria-label="Diagram: drag or use the arrow keys to move, the wheel to zoom"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={refit}
        onKeyDown={onKeyDown}
      >
        <div
          ref={host}
          className="shape-pan-content"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        />
      </div>
      <div className="shape-zoom-controls">
        <button type="button" aria-label="Zoom out" onClick={() => zoomCentre(1 / ZOOM_STEP)}>
          −
        </button>
        <button type="button" aria-label="Fit the diagram" onClick={refit}>
          Fit
        </button>
        <button type="button" aria-label="Zoom in" onClick={() => zoomCentre(ZOOM_STEP)}>
          +
        </button>
      </div>
    </div>
  );
}
