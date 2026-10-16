import type { CarryPoint } from "./carry";

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// Includes the left hand and the 28px lifted alignment before lowering.
// These are screen-space artwork bounds, never geographic offsets.
export const MASCOT_SCREEN_EXTENTS = {
  left: 70,
  right: 48,
  top: 88,
  bottom: 60,
} as const;
const CLEARANCE = 8;
const OFFSETS = [
  [0, 0],
  [96, 0],
  [-96, 0],
  [0, -96],
  [0, 96],
  [96, -96],
  [-96, -96],
  [96, 96],
  [-96, 96],
] as const;
const finiteRect = (rect: ScreenRect) =>
  [rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite) &&
  rect.right > rect.left &&
  rect.bottom > rect.top;

/** Prefer the actual projection; move only within 136 screen pixels or dock. */
export function visibleMascotAnchor(
  projected: CarryPoint,
  viewport: ScreenRect,
  occlusions: readonly ScreenRect[],
): CarryPoint | null {
  if (
    !Number.isFinite(projected.x) ||
    !Number.isFinite(projected.y) ||
    !finiteRect(viewport)
  )
    return null;
  // A genuinely offscreen subject remains docked; nearby offsets must not
  // make an unseen geographic subject appear to be on the map.
  if (
    projected.x < viewport.left ||
    projected.x > viewport.right ||
    projected.y < viewport.top ||
    projected.y > viewport.bottom
  )
    return null;
  for (const [dx, dy] of OFFSETS) {
    const anchor = { x: projected.x + dx, y: projected.y + dy };
    const bounds = {
      left: anchor.x - MASCOT_SCREEN_EXTENTS.left,
      right: anchor.x + MASCOT_SCREEN_EXTENTS.right,
      top: anchor.y - MASCOT_SCREEN_EXTENTS.top,
      bottom: anchor.y + MASCOT_SCREEN_EXTENTS.bottom,
    };
    if (
      bounds.left < viewport.left + CLEARANCE ||
      bounds.right > viewport.right - CLEARANCE ||
      bounds.top < viewport.top + CLEARANCE ||
      bounds.bottom > viewport.bottom - CLEARANCE
    )
      continue;
    if (
      occlusions.some(
        (rect) =>
          finiteRect(rect) &&
          bounds.left < rect.right + CLEARANCE &&
          bounds.right > rect.left - CLEARANCE &&
          bounds.top < rect.bottom + CLEARANCE &&
          bounds.bottom > rect.top - CLEARANCE,
      )
    )
      continue;
    return anchor;
  }
  return null;
}
