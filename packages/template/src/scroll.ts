import { useEffect } from "react";

/**
 * One scroller (Story 9.2). The page itself never scrolls: the head stays put
 * and the map fills the rest of the window. A wheel over the gutters, the head
 * or the toolbar therefore has nothing to scroll, so it is forwarded to the
 * map. Inside the map React Flow already handles the wheel (vertical pan,
 * Shift+wheel horizontal, Ctrl+wheel zoom), and views that scroll on their own
 * (the drill-down, the outline, the files list, the dialogs) keep their wheel.
 */

/** Parts of the page that own their wheel events. */
const OWN_WHEEL_SELECTOR =
  ".react-flow, .settings-overlay, .switcher-overlay, .drilldown, .outline, .files-view";

/** React Flow puts its d3-zoom wheel listener on the renderer element. */
export const PANE_SELECTOR = ".react-flow__renderer";

/**
 * Whether a wheel event over `target` should move the map. Anything inside the
 * map or one of the page's own scrollers decides for itself; the rest of the
 * page is dead space and belongs to the map. A target without `closest` (the
 * document or window) counts as dead space too.
 */
export function shouldForwardWheel(target: EventTarget | null): boolean {
  const element = target as Element | null;
  if (element === null || typeof element.closest !== "function") return true;
  return element.closest(OWN_WHEEL_SELECTOR) === null;
}

/**
 * Re-sends a wheel event to the map. The clone keeps the deltas and the
 * modifier keys, so Ctrl+wheel still zooms and Shift+wheel still pans
 * horizontally; the pointer position is kept for the zoom point. The clone is
 * dispatched on the map, so when it bubbles back to the window listener its
 * target reads as inside the map and it is not forwarded again.
 */
export function forwardWheel(event: WheelEvent, pane: Element): void {
  event.preventDefault();
  pane.dispatchEvent(
    new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      composed: true,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      clientX: event.clientX,
      clientY: event.clientY,
    }),
  );
}

/** The page's wheel listener: forwards every wheel outside the map's own scrollers. */
export function onPageWheel(event: WheelEvent): void {
  if (!shouldForwardWheel(event.target)) return;
  const pane = document.querySelector(PANE_SELECTOR);
  if (pane) forwardWheel(event, pane);
}

/** Installs the page-wheel listener for as long as the map is mounted. */
export function usePageWheel(): void {
  useEffect(() => {
    window.addEventListener("wheel", onPageWheel, { passive: false });
    return () => window.removeEventListener("wheel", onPageWheel);
  }, []);
}
