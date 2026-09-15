/**
 * Focused tests for GitButtonRing.
 *
 * GitButtonRing renders a three-segment progress ring using Skia.Canvas
 * with Skia.Path.Circle and animated start/end for progressive segment fill.
 * Segment i (0,1,2) spans progress [i/3, (i+1)/3].
 *
 * Tests verify:
 * - The component renders without crashing
 * - The ring geometry constants are correct
 * - Skia.Path.Circle is used for the base path
 * - Segment end values are correctly derived at progress 0, 1/3, 2/3, 1
 *
 * NOTE: Jest mocks Skia and does NOT validate native pixel rendering.
 * Device visual QA requires a release build, not mocked Jest tests.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { GitButtonRing, GIT_RING_RADIUS, GIT_RING_STROKE_WIDTH } from '@/components/git/GitButtonRing';
import { useSharedValue } from 'react-native-reanimated';

const COLORS: [string, string, string] = ['#3b82f6', '#22c55e', '#f59e0b'];

jest.mock('@shopify/react-native-skia', () => {
  const { View } = require('react-native');
  const passthrough = (name: string) => {
    const Component = ({ children, ...rest }: { children?: React.ReactNode }) =>
      require('react').createElement(View, rest, children);
    Component.displayName = name;
    return Component;
  };
  return {
    __esModule: true,
    Canvas: passthrough('Canvas'),
    Circle: passthrough('Circle'),
    Path: passthrough('Path'),
    Skia: {
      Path: {
        Make: () => ({}),
        Circle: jest.fn(() => ({})),
        Rect: () => ({}),
        Oval: () => ({}),
        RRect: () => ({}),
      },
      PathBuilder: { Make: () => ({}) },
      XYWHRect: () => ({}),
      Font: { Make: () => null },
      Data: { fromBase64: () => ({}) },
      Image: { MakeImageFromEncoded: () => null },
    },
    useFont: () => null,
    useTypeface: () => null,
    useValue: () => ({ current: 0 }),
    default: passthrough('Canvas'),
  };
});

/**
 * Pure segment calculation (mirrors the worklet logic in GitButtonRing).
 * Given progress and segment index, returns the derived end value.
 *
 * Segment i spans [i/3, (i+1)/3]:
 *   seg 0: [0, 1/3]   → end = 0 at p=0, end = 1/3 at p>=1/3
 *   seg 1: [1/3, 2/3] → end = 1/3 at p<=1/3, end = p at 1/3<p<2/3, end = 2/3 at p>=2/3
 *   seg 2: [2/3, 1]  → end = 2/3 at p<=2/3, end = p at 2/3<p<1, end = 1 at p>=1
 */
function computeSegmentEnd(progress: number, segIndex: number): number {
  const segStart = segIndex / 3;
  const segEnd = (segIndex + 1) / 3;
  if (progress <= segStart) return segStart;
  if (progress >= segEnd) return segEnd;
  return Math.max(segStart, progress);
}

describe('GitButtonRing', () => {
  it('renders without crashing', () => {
    const progress = useSharedValue(0);
    expect(() => render(
      <GitButtonRing progress={progress} colors={COLORS} />
    )).not.toThrow();
  });

  it('exposes GIT_RING_RADIUS and GIT_RING_STROKE_WIDTH constants', () => {
    expect(GIT_RING_RADIUS).toBeGreaterThan(0);
    expect(GIT_RING_STROKE_WIDTH).toBeGreaterThan(0);
    expect(GIT_RING_RADIUS).toBe(56 / 2 + 6);
    expect(GIT_RING_STROKE_WIDTH).toBe(3.5);
  });

  it('uses Skia.Path.Circle for base ring geometry', () => {
    const Skia = require('@shopify/react-native-skia').Skia;
    const progress = useSharedValue(0);
    render(<GitButtonRing progress={progress} colors={COLORS} />);
    expect(Skia.Path.Circle).toHaveBeenCalled();
  });

  describe('segment end computation', () => {
    it('at progress=0 all segments have zero-length arcs', () => {
      expect(computeSegmentEnd(0, 0)).toBe(0);     // seg 0: [0,0]
      expect(computeSegmentEnd(0, 1)).toBe(1 / 3); // seg 1: [1/3,1/3] (below seg1 start)
      expect(computeSegmentEnd(0, 2)).toBe(2 / 3); // seg 2: [2/3,2/3] (below seg2 start)
    });

    it('at progress=1/3 segment 0 is fully filled, segment 1 starts', () => {
      const p = 1 / 3;
      expect(computeSegmentEnd(p, 0)).toBeCloseTo(1 / 3); // seg 0: full
      expect(computeSegmentEnd(p, 1)).toBeCloseTo(1 / 3); // seg 1: zero-length at start
      expect(computeSegmentEnd(p, 2)).toBeCloseTo(2 / 3); // seg 2: zero-length at start
    });

    it('at progress=2/3 segments 0 and 1 are fully filled, segment 2 starts', () => {
      const p = 2 / 3;
      expect(computeSegmentEnd(p, 0)).toBeCloseTo(1 / 3); // seg 0: full
      expect(computeSegmentEnd(p, 1)).toBeCloseTo(2 / 3); // seg 1: full
      expect(computeSegmentEnd(p, 2)).toBeCloseTo(2 / 3); // seg 2: zero-length at start
    });

    it('at progress=1 all segments are fully filled', () => {
      expect(computeSegmentEnd(1, 0)).toBeCloseTo(1 / 3);
      expect(computeSegmentEnd(1, 1)).toBeCloseTo(2 / 3);
      expect(computeSegmentEnd(1, 2)).toBeCloseTo(1);
    });

    it('at progress=0.5 segment 0 is complete, segment 1 partially fills (1/3→0.5)', () => {
      // seg 0 [0, 1/3]: complete at 1/3 (p > 1/3)
      // seg 1 [1/3, 2/3]: active, end = p = 0.5 (within segment bounds)
      // seg 2 [2/3, 1]: inactive (p < 2/3), stays at start 2/3
      const p = 0.5;
      expect(computeSegmentEnd(p, 0)).toBeCloseTo(1 / 3); // seg 0: complete
      expect(computeSegmentEnd(p, 1)).toBeCloseTo(0.5);   // seg 1: 1/3→0.5
      expect(computeSegmentEnd(p, 2)).toBeCloseTo(2 / 3); // seg 2: inactive
    });

    it('at progress=0.8 segment 0 and 1 full, segment 2 partial (2/3→0.8)', () => {
      const p = 0.8;
      expect(computeSegmentEnd(p, 0)).toBeCloseTo(1 / 3); // seg 0: full
      expect(computeSegmentEnd(p, 1)).toBeCloseTo(2 / 3); // seg 1: full
      expect(computeSegmentEnd(p, 2)).toBeCloseTo(0.8);   // seg 2: 2/3→0.8
    });
  });

  it('renders with progress=0', () => {
    const progress = useSharedValue(0);
    const { toJSON } = render(
      <GitButtonRing progress={progress} colors={COLORS} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with progress=1/3', () => {
    const progress = useSharedValue(1 / 3);
    const { toJSON } = render(
      <GitButtonRing progress={progress} colors={COLORS} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with progress=2/3', () => {
    const progress = useSharedValue(2 / 3);
    const { toJSON } = render(
      <GitButtonRing progress={progress} colors={COLORS} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with progress=1', () => {
    const progress = useSharedValue(1);
    const { toJSON } = render(
      <GitButtonRing progress={progress} colors={COLORS} />
    );
    expect(toJSON()).toBeTruthy();
  });
});
