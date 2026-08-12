import { describe, expect, it } from '@jest/globals';
import {
  FLOATING_AI_BUTTON_SIZE,
  FLOATING_AI_HUB_ITEMS,
  FLOATING_AI_HUB_SATELLITE_SIZE,
  getFloatingAIHubTriggerBounds,
  resolveFloatingAIButtonPlacement,
  type FloatingButtonGeometry,
  type MenuDirection,
} from '../src/components/ai/floatingAIButtonGeometry';

const STANDARD_GEOMETRY: FloatingButtonGeometry = {
  viewportWidth: 320,
  viewportHeight: 480,
  leftClearance: 16,
  rightClearance: 16,
  topBound: 60,
  tabBarHeight: 0,
  minimumBottomClearance: 100,
};

interface DirectionCase {
  readonly horizontalDirection: MenuDirection;
  readonly verticalDirection: MenuDirection;
  readonly expectedBounds: {
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
  };
}

const DIRECTION_CASES = [
  {
    horizontalDirection: 1,
    verticalDirection: 1,
    expectedBounds: { minX: 16, maxX: 142, minY: 108, maxY: 224 },
  },
  {
    horizontalDirection: 1,
    verticalDirection: -1,
    expectedBounds: { minX: 16, maxX: 142, minY: 160, maxY: 276 },
  },
  {
    horizontalDirection: -1,
    verticalDirection: 1,
    expectedBounds: { minX: 122, maxX: 248, minY: 108, maxY: 224 },
  },
  {
    horizontalDirection: -1,
    verticalDirection: -1,
    expectedBounds: { minX: 122, maxX: 248, minY: 160, maxY: 276 },
  },
] as const satisfies readonly DirectionCase[];

describe('floating AI hub geometry', () => {
  it.each(DIRECTION_CASES)(
    'returns exact trigger bounds for horizontal $horizontalDirection and vertical $verticalDirection',
    ({ horizontalDirection, verticalDirection, expectedBounds }) => {
      // Given
      const directions = { horizontalDirection, verticalDirection };

      // When
      const bounds = getFloatingAIHubTriggerBounds(STANDARD_GEOMETRY, directions);

      // Then
      expect(bounds).toEqual(expectedBounds);
    },
  );

  it.each(DIRECTION_CASES)(
    'keeps every satellite inside safe clearances at horizontal $horizontalDirection and vertical $verticalDirection bounds',
    ({ horizontalDirection, verticalDirection }) => {
      // Given
      const bounds = getFloatingAIHubTriggerBounds(STANDARD_GEOMETRY, {
        horizontalDirection,
        verticalDirection,
      });
      const safeRight = STANDARD_GEOMETRY.viewportWidth - STANDARD_GEOMETRY.rightClearance;
      const safeBottom = STANDARD_GEOMETRY.viewportHeight
        - Math.max(
          STANDARD_GEOMETRY.tabBarHeight,
          STANDARD_GEOMETRY.minimumBottomClearance,
        );
      const anchorInset = (
        FLOATING_AI_BUTTON_SIZE - FLOATING_AI_HUB_SATELLITE_SIZE
      ) / 2;
      const boundaryPositions = [
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.minX, y: bounds.maxY },
        { x: bounds.maxX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY },
      ];

      // When / Then
      for (const position of boundaryPositions) {
        for (const item of FLOATING_AI_HUB_ITEMS) {
          const satelliteLeft = position.x + anchorInset + item.x * horizontalDirection;
          const satelliteTop = position.y + anchorInset + item.y * verticalDirection;
          expect(satelliteLeft).toBeGreaterThanOrEqual(STANDARD_GEOMETRY.leftClearance);
          expect(satelliteLeft + FLOATING_AI_HUB_SATELLITE_SIZE).toBeLessThanOrEqual(
            safeRight,
          );
          expect(satelliteTop).toBeGreaterThanOrEqual(STANDARD_GEOMETRY.topBound);
          expect(satelliteTop + FLOATING_AI_HUB_SATELLITE_SIZE).toBeLessThanOrEqual(
            safeBottom,
          );
        }
      }
    },
  );

  it.each([
    {
      position: { x: 131, y: 211 },
      expectedDirections: { horizontalDirection: 1, verticalDirection: 1 },
    },
    {
      position: { x: 132, y: 212 },
      expectedDirections: { horizontalDirection: -1, verticalDirection: -1 },
    },
  ] as const)(
    'uses the normalized trigger center to resolve direction at $position',
    ({ position, expectedDirections }) => {
      // Given / When
      const placement = resolveFloatingAIButtonPlacement(position, STANDARD_GEOMETRY);

      // Then
      expect(placement).toMatchObject(expectedDirections);
    },
  );

  it('preserves the snapped edge and flips expansion when the center preference cannot fit', () => {
    // Given
    const asymmetricGeometry: FloatingButtonGeometry = {
      ...STANDARD_GEOMETRY,
      leftClearance: 140,
    };

    // When
    const placement = resolveFloatingAIButtonPlacement(
      { x: 0, y: 211 },
      asymmetricGeometry,
    );

    // Then
    expect(placement.position.x).toBe(140);
    expect(placement.horizontalDirection).toBe(1);
  });

  it.each([
    { x: -500, y: -500 },
    { x: 131, y: 211 },
    { x: 132, y: 212 },
    { x: 900, y: 1200 },
  ])('returns an idempotent placement for $x,$y', (position) => {
    // Given
    const firstPlacement = resolveFloatingAIButtonPlacement(position, STANDARD_GEOMETRY);

    // When
    const repeatedPlacement = resolveFloatingAIButtonPlacement(
      firstPlacement.position,
      STANDARD_GEOMETRY,
    );

    // Then
    expect(repeatedPlacement).toEqual(firstPlacement);
  });

  it('exposes impossible viewport bounds instead of fabricating a valid range', () => {
    // Given
    const impossibleGeometry: FloatingButtonGeometry = {
      ...STANDARD_GEOMETRY,
      viewportWidth: 120,
    };

    // When
    const bounds = getFloatingAIHubTriggerBounds(impossibleGeometry, {
      horizontalDirection: 1,
      verticalDirection: 1,
    });

    // Then
    expect(bounds.minX).toBeGreaterThan(bounds.maxX);
  });
});
