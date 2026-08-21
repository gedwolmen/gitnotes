import { useEffect } from 'react';
import { withSpring, type SharedValue } from 'react-native-reanimated';
import type { FloatingButtonGeometry } from './ai/floatingAIButtonGeometry';

export type FloatingButtonId = 'ai' | 'stage';

export interface FloatingButtonRect {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export const COLLISION_GAP = 12;

const COLLISION_SPRING = {
  mass: 1,
  damping: 15,
  stiffness: 120,
  overshootClamping: true,
} as const;

const rects: Record<FloatingButtonId, FloatingButtonRect | null> = {
  ai: null,
  stage: null,
};

const listeners = new Set<() => void>();

let notifying = false;

export function publishButtonRect(
  id: FloatingButtonId,
  rect: FloatingButtonRect,
): void {
  rects[id] = rect;
  // Collision resolution publishes the yielding button's new rect from
  // inside a subscriber. Guard against re-entrant notification so a
  // publish→notify→publish cycle cannot recurse into a stack overflow
  // (the other button's rect is already updated, so the next top-level
  // publish still sees the fresh positions).
  if (notifying) {
    return;
  }
  notifying = true;
  try {
    for (const listener of listeners) {
      listener();
    }
  } finally {
    notifying = false;
  }
}

export function getButtonRect(id: FloatingButtonId): FloatingButtonRect | null {
  return rects[id];
}

export function subscribeButtonRects(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function rectsOverlap(
  a: FloatingButtonRect,
  b: FloatingButtonRect,
  gap: number,
): boolean {
  'worklet';

  return (
    a.x < b.x + b.size + gap
    && b.x < a.x + a.size + gap
    && a.y < b.y + b.size + gap
    && b.y < a.y + a.size + gap
  );
}

function overlapAmount(a: FloatingButtonRect, b: FloatingButtonRect): number {
  'worklet';

  const xOverlap = Math.max(
    0,
    Math.min(a.x + a.size + COLLISION_GAP, b.x + b.size)
      - Math.max(a.x - COLLISION_GAP, b.x),
  );
  const yOverlap = Math.max(
    0,
    Math.min(a.y + a.size + COLLISION_GAP, b.y + b.size)
      - Math.max(a.y - COLLISION_GAP, b.y),
  );
  return xOverlap * yOverlap;
}

/**
 * Worklet-safe collision resolution against an explicit other rect. Prefers
 * stacking vertically on the same edge, then flips edges, then falls back to
 * the least-overlapping candidate.
 */
export function resolveNonOverlappingWithRect(
  desired: { readonly x: number; readonly y: number },
  size: number,
  geometry: FloatingButtonGeometry,
  other: FloatingButtonRect | null,
): { x: number; y: number } {
  'worklet';

  if (other === null) {
    return { x: desired.x, y: desired.y };
  }

  const desiredRect: FloatingButtonRect = { x: desired.x, y: desired.y, size };
  if (!rectsOverlap(desiredRect, other, COLLISION_GAP)) {
    return { x: desired.x, y: desired.y };
  }

  const safeBottom = geometry.viewportHeight
    - Math.max(geometry.tabBarHeight, geometry.minimumBottomClearance);
  const leftX = geometry.leftClearance;
  const rightX = geometry.viewportWidth - size - geometry.rightClearance;
  const desiredOnLeft = Math.abs(desired.x - leftX) <= Math.abs(desired.x - rightX);

  const candidates = [
    { x: desired.x, y: Math.max(geometry.topBound, other.y - size - COLLISION_GAP) },
    { x: desired.x, y: Math.min(safeBottom - size, other.y + other.size + COLLISION_GAP) },
    {
      x: desiredOnLeft ? rightX : leftX,
      y: Math.min(Math.max(desired.y, geometry.topBound), safeBottom - size),
    },
  ];

  for (const candidate of candidates) {
    const candidateRect: FloatingButtonRect = {
      x: candidate.x,
      y: candidate.y,
      size,
    };
    if (!rectsOverlap(candidateRect, other, COLLISION_GAP)) {
      return candidate;
    }
  }

  let leastOverlapping = candidates[0];
  for (const candidate of candidates) {
    const candidateAmount = overlapAmount(
      { x: candidate.x, y: candidate.y, size },
      other,
    );
    const leastAmount = overlapAmount(
      { x: leastOverlapping.x, y: leastOverlapping.y, size },
      other,
    );
    if (candidateAmount < leastAmount) {
      leastOverlapping = candidate;
    }
  }
  return leastOverlapping;
}

/**
 * Resolves a desired position against the other button's current registered
 * rect. Runs on the JS thread (position hooks, collision nudges).
 */
export function resolveNonOverlapping(
  myId: FloatingButtonId,
  desired: { readonly x: number; readonly y: number },
  size: number,
  geometry: FloatingButtonGeometry,
): { x: number; y: number } {
  const otherId: FloatingButtonId = myId === 'ai' ? 'stage' : 'ai';
  return resolveNonOverlappingWithRect(desired, size, geometry, rects[otherId]);
}

interface UseFloatingButtonCollisionOptions {
  readonly translateX: SharedValue<number>;
  readonly translateY: SharedValue<number>;
  readonly dragActive: SharedValue<boolean>;
  readonly size: number;
  readonly geometry: FloatingButtonGeometry;
}

/**
 * Subscribes to the shared rect registry. Only the stage button yields to the
 * other while at rest; the AI button resolves collisions at its own drag-end
 * and geometry normalization.
 */
export function useFloatingButtonCollision(
  id: FloatingButtonId,
  options: UseFloatingButtonCollisionOptions,
): void {
  const { translateX, translateY, dragActive, size, geometry } = options;

  useEffect(() => {
    const otherId: FloatingButtonId = id === 'ai' ? 'stage' : 'ai';
    if (id !== 'stage') return;
    return subscribeButtonRects(() => {
      const other = getButtonRect(otherId);
      if (other === null || dragActive.value) return;
      const published = getButtonRect(id);
      const current = published ?? { x: translateX.value, y: translateY.value };
      const currentRect: FloatingButtonRect = { x: current.x, y: current.y, size };
      if (!rectsOverlap(currentRect, other, COLLISION_GAP)) return;
      const resolved = resolveNonOverlapping(id, current, size, geometry);
      if (resolved.x === current.x && resolved.y === current.y) return;
      translateX.value = withSpring(resolved.x, COLLISION_SPRING);
      translateY.value = withSpring(resolved.y, COLLISION_SPRING);
      publishButtonRect(id, { x: resolved.x, y: resolved.y, size });
    });
  }, [dragActive, geometry, id, size, translateX, translateY]);
}
