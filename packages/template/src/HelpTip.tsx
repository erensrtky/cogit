import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react";

/**
 * A "?" with a plain-language explanation (Story 12.1): it floats over the page
 * while the pointer rests on the "?" or the keyboard focuses it, so nothing
 * below it moves; there is nothing to click. Escape closes it. The settings
 * modal explains each setting with it, and the Shape layer each tool.
 *
 * The bubble is placed against the window, not its scrolling parent, so a "?"
 * near the edge of a modal never has its explanation cut off: it opens below
 * the "?" when there is room and above it otherwise.
 */
export function HelpTip({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const open = hovered || focused;
  const detailId = `${id}-details`;
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const [place, setPlace] = useState<CSSProperties | undefined>(undefined);
  useLayoutEffect(() => {
    if (!open) {
      setPlace(undefined);
      return;
    }
    if (anchor.current === null || bubble.current === null) return;
    setPlace(
      bubblePlace(
        anchor.current.getBoundingClientRect(),
        bubble.current.offsetHeight,
        window.innerWidth,
        window.innerHeight,
      ),
    );
  }, [open]);
  return (
    <span
      className="settings-why-wrap"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        ref={anchor}
        className="settings-why"
        // Focusable so the keyboard reaches the explanation too.
        tabIndex={0}
        role="img"
        aria-label={label}
        aria-describedby={open ? detailId : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !open) return;
          // Close the bubble, not the modal around it.
          event.stopPropagation();
          setHovered(false);
          setFocused(false);
        }}
      >
        ?
      </span>
      {open ? (
        <span
          ref={bubble}
          className="settings-details"
          id={detailId}
          role="tooltip"
          style={place ?? HIDDEN}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}

/** Measured before it is placed, so the first frame never shows it in the wrong spot. */
const HIDDEN: CSSProperties = { position: "fixed", left: 0, top: 0, visibility: "hidden" };

/** Space kept between the bubble and the window's edges. */
const EDGE = 8;

/**
 * Where the bubble goes, fixed to the window: below the "?" when it fits, else
 * above when that fits, else on the roomier side with its height capped so it
 * scrolls inside itself. Never past the window's edges.
 */
export function bubblePlace(
  rect: { left: number; top: number; bottom: number },
  bubbleHeight: number,
  width: number,
  height: number,
): CSSProperties {
  const left = Math.max(EDGE, Math.min(rect.left - EDGE, width - EDGE - 360));
  const below = height - rect.bottom - 6 - EDGE;
  const above = rect.top - 6 - EDGE;
  if (bubbleHeight <= below || (bubbleHeight > above && below >= above))
    return {
      position: "fixed",
      left,
      top: rect.bottom + 6,
      bottom: "auto",
      maxHeight: below,
      overflowY: "auto",
    };
  return {
    position: "fixed",
    left,
    // The stylesheet places the bubble with `top`; clear it, or both apply.
    top: "auto",
    bottom: height - rect.top + 6,
    maxHeight: above,
    overflowY: "auto",
  };
}
