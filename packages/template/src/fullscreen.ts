import { useCallback, useEffect, useState } from "react";

/**
 * Expands the map over the whole window (CSS, always works) and asks the browser
 * for real full screen on top when it allows it. Esc or leaving full screen closes it.
 */
export function useFullscreen() {
  const [expanded, setExpanded] = useState(false);

  const close = useCallback(() => {
    setExpanded(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    if (expanded) return close();
    setExpanded(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, [expanded, close]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onChange = () => {
      if (!document.fullscreenElement) setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onChange);
    };
  }, [expanded, close]);

  return { expanded, toggle };
}
