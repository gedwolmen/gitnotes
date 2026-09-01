/**
 * Geometry + timing conventions for the floating git button.
 *
 * Follows main's floating-button geometry conventions (corner home position,
 * edge snapping, hold threshold) — rebuilt for the gluestack workspace, not
 * resurrected from the old FloatingPushButton/HoldProgressRing.
 */

/** Button diameter (4 px grid: 14 × spacing-1). */
export const GIT_BUTTON_SIZE = 56;

/** Clearance from the screen edges when the button rests on an edge. */
export const GIT_BUTTON_EDGE_CLEARANCE = 16;

/** Bottom clearance above the safe-area inset. */
export const GIT_BUTTON_BOTTOM_CLEARANCE = 24;

/** Top bound so the button never hides under headers. */
export const GIT_BUTTON_TOP_BOUND = 64;

/** Press-and-hold duration (ms) required to trigger a push. */
export const GIT_BUTTON_HOLD_MS = 800;

/** Hold-to-push progress ring. */
export const HOLD_RING_STROKE_WIDTH = 4;
/** Gap between the button edge and the ring's center line. */
export const HOLD_RING_RADIUS_OFFSET = 5;
/** Diameter of the SVG canvas that hosts the ring (incl. stroke). */
export const HOLD_RING_CANVAS_SIZE =
  GIT_BUTTON_SIZE + (HOLD_RING_RADIUS_OFFSET + HOLD_RING_STROKE_WIDTH / 2) * 2;

/** Blue halo ring (unpushed commits). */
export const HALO_RING_SIZE = GIT_BUTTON_SIZE + 24;
export const HALO_COLOR = '#3b82f6'; // tailwind blue-500 (--color-note-blue)

/** Drag gesture must move at least this far before it wins over tap/hold. */
export const GIT_BUTTON_DRAG_MIN_DISTANCE = 10;
