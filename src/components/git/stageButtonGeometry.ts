import {
  FLOATING_AI_BUTTON_SIZE,
  type FloatingButtonGeometry,
  type FloatingButtonPosition,
} from '../ai/floatingAIButtonGeometry';

export const STAGE_BUTTON_SIZE = 52;
export const STAGE_BUTTON_LONG_PRESS_MS = 500;
export const STAGE_BUTTON_VERTICAL_GAP = 12;

/**
 * Vertical space reserved below the stage button's resting zone so it never
 * snaps on top of the AI button's bottom-corner home on the same edge.
 */
export const STAGE_BUTTON_BOTTOM_RESERVE =
  FLOATING_AI_BUTTON_SIZE + STAGE_BUTTON_SIZE + STAGE_BUTTON_VERTICAL_GAP;

export interface StageButtonPlacement {
  readonly position: FloatingButtonPosition;
}

function clamp(value: number, minimum: number, maximum: number): number {
  'worklet';

  return Math.min(Math.max(value, minimum), maximum);
}

export function resolveStageButtonPlacement(
  position: FloatingButtonPosition,
  geometry: FloatingButtonGeometry,
): StageButtonPlacement {
  'worklet';

  const leftX = geometry.leftClearance;
  const rightX = geometry.viewportWidth - STAGE_BUTTON_SIZE - geometry.rightClearance;
  const x = Math.abs(position.x - leftX) < Math.abs(position.x - rightX) ? leftX : rightX;
  const safeBottom = geometry.viewportHeight - Math.max(
    geometry.tabBarHeight,
    geometry.minimumBottomClearance,
  );
  const stageBottomBound = safeBottom - STAGE_BUTTON_BOTTOM_RESERVE;
  const y = clamp(position.y, geometry.topBound, stageBottomBound);

  return { position: { x, y } };
}
