/**
 * Pan and zoom maths for the Shape modal's diagram (Story 14.2), pure so the
 * tests need no browser. A view is `translate(x, y) scale(s)` with the origin at
 * the top-left; sizes are in CSS pixels, content sizes at scale 1.
 */

export interface Size {
  width: number;
  height: number;
}

export interface PanView {
  x: number;
  y: number;
  scale: number;
}

/** Below this, the opening fit stops shrinking: the labels must stay legible. */
export const FIT_FLOOR = 0.5;
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 3;
/** Room kept between the content's edge and the viewport's when panning. */
export const PAN_PAD = 8;

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/**
 * The scale a diagram opens at: small enough to show it whole, never above 1
 * (a narrow diagram is not enlarged) and never below the legibility floor.
 */
export function fitScale(viewport: Size, content: Size, floor: number = FIT_FLOOR): number {
  if (content.width <= 0 || content.height <= 0 || viewport.width <= 0 || viewport.height <= 0)
    return 1;
  const fit = Math.min(1, viewport.width / content.width, viewport.height / content.height);
  return Math.max(floor, fit);
}

/** The allowed range of one axis: content inside the viewport, or the viewport inside the content. */
function axisRange(view: number, content: number, pad: number): [number, number] {
  const a = pad;
  const b = view - content - pad;
  return [Math.min(a, b), Math.max(a, b)];
}

/**
 * Keeps the content reachable: a part smaller than the viewport stays inside
 * it, a larger one cannot be dragged past its edge plus the padding.
 */
export function clampPan(
  view: PanView,
  viewport: Size,
  content: Size,
  pad: number = PAN_PAD,
): PanView {
  const [minX, maxX] = axisRange(viewport.width, content.width * view.scale, pad);
  const [minY, maxY] = axisRange(viewport.height, content.height * view.scale, pad);
  return { scale: view.scale, x: clamp(view.x, minX, maxX), y: clamp(view.y, minY, maxY) };
}

/** Where one axis opens: centred when it fits, else at its start. */
function openAxis(view: number, content: number, pad: number): number {
  return content + 2 * pad <= view ? (view - content) / 2 : pad;
}

/** The opening view: fitted, centred when it fits, otherwise from the top-left. */
export function fitView(viewport: Size, content: Size, pad: number = PAN_PAD): PanView {
  const scale = fitScale(viewport, content);
  return clampPan(
    {
      scale,
      x: openAxis(viewport.width, content.width * scale, pad),
      y: openAxis(viewport.height, content.height * scale, pad),
    },
    viewport,
    content,
    pad,
  );
}

/**
 * Zooms by `factor` keeping the point under (`px`, `py`) — viewport
 * coordinates — where it is, within the scale bounds.
 */
export function zoomAt(
  view: PanView,
  factor: number,
  px: number,
  py: number,
  bounds: { min: number; max: number } = { min: MIN_SCALE, max: MAX_SCALE },
): PanView {
  const scale = clamp(view.scale * factor, bounds.min, bounds.max);
  const ratio = scale / view.scale;
  return { scale, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio };
}
