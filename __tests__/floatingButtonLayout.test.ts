import { describe, expect, it } from '@jest/globals';
import {
  COLLISION_GAP,
  getButtonRect,
  publishButtonRect,
  rectsOverlap,
  resolveNonOverlapping,
  resolveNonOverlappingWithRect,
  subscribeButtonRects,
  type FloatingButtonGeometry,
} from '../src/components/floatingButtonLayout';

const STANDARD_GEOMETRY: FloatingButtonGeometry = {
  viewportWidth: 320,
  viewportHeight: 480,
  leftClearance: 16,
  rightClearance: 16,
  topBound: 60,
  tabBarHeight: 0,
  minimumBottomClearance: 100,
};

const SHORT_GEOMETRY: FloatingButtonGeometry = {
  ...STANDARD_GEOMETRY,
  viewportHeight: 220,
};

describe('rectsOverlap', () => {
  it('returns true when the rects intersect', () => {
    expect(rectsOverlap(
      { x: 0, y: 0, size: 50 },
      { x: 10, y: 10, size: 50 },
      COLLISION_GAP,
    )).toBe(true);
  });

  it('returns true when the rects are within the gap', () => {
    expect(rectsOverlap(
      { x: 0, y: 0, size: 50 },
      { x: 58, y: 0, size: 50 },
      COLLISION_GAP,
    )).toBe(true);
  });

  it('returns false when the rects are farther apart than the gap', () => {
    expect(rectsOverlap(
      { x: 0, y: 0, size: 50 },
      { x: 100, y: 0, size: 50 },
      COLLISION_GAP,
    )).toBe(false);
  });
});

describe('resolveNonOverlapping', () => {
  it('returns the desired position unchanged when the other rect is absent', () => {
    const desired = { x: 248, y: 216 };

    const resolved = resolveNonOverlappingWithRect(
      desired,
      56,
      STANDARD_GEOMETRY,
      null,
    );

    expect(resolved).toEqual(desired);
  });

  it('returns the desired position unchanged when it does not overlap', () => {
    publishButtonRect('stage', { x: 16, y: 300, size: 52 });
    const desired = { x: 248, y: 216 };

    const resolved = resolveNonOverlapping('ai', desired, 56, STANDARD_GEOMETRY);

    expect(resolved).toEqual(desired);
  });

  it('stacks above the other button on the same edge', () => {
    publishButtonRect('stage', { x: 248, y: 260, size: 52 });

    const resolved = resolveNonOverlapping('ai', { x: 248, y: 260 }, 56, STANDARD_GEOMETRY);

    expect(resolved).toEqual({ x: 248, y: 192 });
  });

  it('stacks below the other button on the same edge when above is blocked', () => {
    publishButtonRect('stage', { x: 248, y: 60, size: 52 });

    const resolved = resolveNonOverlapping('ai', { x: 248, y: 60 }, 56, STANDARD_GEOMETRY);

    expect(resolved).toEqual({ x: 248, y: 124 });
  });

  it('flips to the opposite edge when both vertical stack slots are clamped and blocked', () => {
    publishButtonRect('stage', { x: 248, y: 60, size: 52 });

    const resolved = resolveNonOverlapping('ai', { x: 248, y: 60 }, 56, SHORT_GEOMETRY);

    expect(resolved).toEqual({ x: 16, y: 60 });
  });

  it('never returns a position outside the safe bounds', () => {
    const collidingStageRects = [
      { x: 248, y: 60, size: 52 },
      { x: 248, y: 260, size: 52 },
      { x: 16, y: 60, size: 52 },
      { x: 16, y: 300, size: 52 },
    ];

    for (const stageRect of collidingStageRects) {
      publishButtonRect('stage', stageRect);
      const safeBottom = STANDARD_GEOMETRY.viewportHeight - 100;

      const resolved = resolveNonOverlapping('ai', { x: stageRect.x, y: stageRect.y }, 56, STANDARD_GEOMETRY);

      expect(resolved.y).toBeGreaterThanOrEqual(STANDARD_GEOMETRY.topBound);
      expect(resolved.y + 56).toBeLessThanOrEqual(safeBottom);
      expect(resolved.x).toBeGreaterThanOrEqual(STANDARD_GEOMETRY.leftClearance);
      expect(resolved.x + 56).toBeLessThanOrEqual(
        STANDARD_GEOMETRY.viewportWidth - STANDARD_GEOMETRY.rightClearance,
      );
    }
  });
});

describe('button rect registry', () => {
  it('stores and returns published rects per button id', () => {
    publishButtonRect('ai', { x: 248, y: 216, size: 56 });

    expect(getButtonRect('ai')).toEqual({ x: 248, y: 216, size: 56 });
  });

  it('notifies subscribers on every publish and stops after unsubscribe', () => {
    const seenRects: unknown[] = [];
    const unsubscribe = subscribeButtonRects(() => {
      seenRects.push(getButtonRect('ai'));
    });

    publishButtonRect('ai', { x: 248, y: 216, size: 56 });
    publishButtonRect('ai', { x: 16, y: 168, size: 56 });

    expect(seenRects).toEqual([
      { x: 248, y: 216, size: 56 },
      { x: 16, y: 168, size: 56 },
    ]);

    unsubscribe();
    publishButtonRect('ai', { x: 248, y: 96, size: 56 });

    expect(seenRects).toHaveLength(2);
  });

  it('does not recurse infinitely when a subscriber publishes during notification', () => {
    publishButtonRect('stage', { x: 16, y: 168, size: 56 });
    const subscriberCalls: number[] = [];
    const unsubscribe = subscribeButtonRects(() => {
      const ai = getButtonRect('ai');
      const stage = getButtonRect('stage');
      if (ai === null || stage === null) return;
      subscriberCalls.push(subscriberCalls.length);
      publishButtonRect('stage', { x: ai.x + 40, y: ai.y + 40, size: 56 });
    });

    publishButtonRect('ai', { x: 16, y: 168, size: 56 });

    // Without the re-entrancy guard this would blow the stack.
    expect(subscriberCalls).toEqual([0]);
    unsubscribe();
  });
});
