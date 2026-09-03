export const GIT_BUTTON_SIZE = 56;
export const FLOATING_GIT_HUB_SATELLITE_SIZE = 52;

export type GitHubItemId = 'stage' | 'commit' | 'push';
export type MenuDirection = -1 | 1;

export interface FloatingGitHubItem {
  readonly id: GitHubItemId;
  readonly x: number;
  readonly y: number;
}

export const FLOATING_GIT_HUB_ITEMS = [
  { id: 'stage', x: 64, y: -90 },
  { id: 'commit', x: 100, y: 0 },
  { id: 'push', x: 64, y: 90 },
] as const satisfies readonly FloatingGitHubItem[];

export interface FloatingButtonPosition {
  readonly x: number;
  readonly y: number;
}

export interface FloatingButtonGeometry {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly leftClearance: number;
  readonly rightClearance: number;
  readonly topBound: number;
  readonly tabBarHeight: number;
  readonly minimumBottomClearance: number;
}

export interface MenuDirections {
  readonly horizontalDirection: MenuDirection;
  readonly verticalDirection: MenuDirection;
}

export interface FloatingButtonBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface FloatingButtonPlacement extends MenuDirections {
  readonly position: FloatingButtonPosition;
}

function clamp(value: number, minimum: number, maximum: number): number {
  'worklet';
  return Math.min(Math.max(value, minimum), maximum);
}

function oppositeDirection(direction: MenuDirection): MenuDirection {
  'worklet';
  return direction === 1 ? -1 : 1;
}

export function getFloatingGitHubTriggerBounds(
  geometry: FloatingButtonGeometry,
  directions: MenuDirections,
): FloatingButtonBounds {
  'worklet';
  const anchorInset = (
    GIT_BUTTON_SIZE - FLOATING_GIT_HUB_SATELLITE_SIZE
  ) / 2;
  let minimumRelativeX = 0;
  let maximumRelativeX = GIT_BUTTON_SIZE;
  let minimumRelativeY = 0;
  let maximumRelativeY = GIT_BUTTON_SIZE;

  for (const item of FLOATING_GIT_HUB_ITEMS) {
    const satelliteLeft = anchorInset + item.x * directions.horizontalDirection;
    const satelliteTop = anchorInset + item.y * directions.verticalDirection;
    minimumRelativeX = Math.min(minimumRelativeX, satelliteLeft);
    maximumRelativeX = Math.max(
      maximumRelativeX,
      satelliteLeft + FLOATING_GIT_HUB_SATELLITE_SIZE,
    );
    minimumRelativeY = Math.min(minimumRelativeY, satelliteTop);
    maximumRelativeY = Math.max(
      maximumRelativeY,
      satelliteTop + FLOATING_GIT_HUB_SATELLITE_SIZE,
    );
  }

  const safeRight = geometry.viewportWidth - geometry.rightClearance;
  const safeBottom = geometry.viewportHeight - Math.max(
    geometry.tabBarHeight,
    geometry.minimumBottomClearance,
  );

  return {
    minX: geometry.leftClearance - minimumRelativeX,
    maxX: safeRight - maximumRelativeX,
    minY: geometry.topBound - minimumRelativeY,
    maxY: safeBottom - maximumRelativeY,
  };
}

export function resolveFloatingGitButtonPlacement(
  position: FloatingButtonPosition,
  geometry: FloatingButtonGeometry,
): FloatingButtonPlacement {
  'worklet';
  const leftX = geometry.leftClearance;
  const rightX = geometry.viewportWidth
    - GIT_BUTTON_SIZE
    - geometry.rightClearance;
  const x = Math.abs(position.x - leftX) < Math.abs(position.x - rightX)
    ? leftX
    : rightX;
  const safeBottom = geometry.viewportHeight - Math.max(
    geometry.tabBarHeight,
    geometry.minimumBottomClearance,
  );
  const triggerBottomBound = safeBottom - GIT_BUTTON_SIZE;
  const normalizedY = clamp(position.y, geometry.topBound, triggerBottomBound);

  let horizontalDirection: MenuDirection = (
    x + GIT_BUTTON_SIZE / 2 < geometry.viewportWidth / 2
  ) ? 1 : -1;
  let verticalDirection: MenuDirection = (
    normalizedY + GIT_BUTTON_SIZE / 2 < geometry.viewportHeight / 2
  ) ? 1 : -1;

  let bounds = getFloatingGitHubTriggerBounds(geometry, {
    horizontalDirection,
    verticalDirection,
  });
  if (x < bounds.minX || x > bounds.maxX) {
    const alternateHorizontalDirection = oppositeDirection(horizontalDirection);
    const alternateBounds = getFloatingGitHubTriggerBounds(geometry, {
      horizontalDirection: alternateHorizontalDirection,
      verticalDirection,
    });
    if (x >= alternateBounds.minX && x <= alternateBounds.maxX) {
      horizontalDirection = alternateHorizontalDirection;
      bounds = alternateBounds;
    }
  }

  let y = clamp(normalizedY, bounds.minY, bounds.maxY);
  const resolvedVerticalDirection: MenuDirection = (
    y + GIT_BUTTON_SIZE / 2 < geometry.viewportHeight / 2
  ) ? 1 : -1;
  if (resolvedVerticalDirection !== verticalDirection) {
    const alternateBounds = getFloatingGitHubTriggerBounds(geometry, {
      horizontalDirection,
      verticalDirection: resolvedVerticalDirection,
    });
    if (alternateBounds.minY <= alternateBounds.maxY) {
      verticalDirection = resolvedVerticalDirection;
      y = clamp(y, alternateBounds.minY, alternateBounds.maxY);
    }
  }

  return {
    position: { x, y },
    horizontalDirection,
    verticalDirection,
  };
}