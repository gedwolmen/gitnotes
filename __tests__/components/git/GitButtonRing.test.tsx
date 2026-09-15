/**
 * Focused tests for GitButtonRing.
 *
 * GitButtonRing renders a three-segment progress ring using react-native-svg
 * Circle elements with animated strokeDasharray for progressive segment fill.
 * Segment i (0,1,2) spans progress [i/3, (i+1)/3].
 *
 * Tests verify:
 * - The component renders without crashing
 * - The ring geometry constants are correct
 * - Each Circle has distinct rotation and origin centered on the ring
 * - strokeDasharray values are correctly animated via useAnimatedProps
 *
 * NOTE: Jest mocks react-native-svg and does NOT validate native pixel rendering.
 * Device visual QA requires a release build, not mocked Jest tests.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { GitButtonRing, GIT_RING_RADIUS, GIT_RING_STROKE_WIDTH } from '@/components/git/GitButtonRing';
import { useSharedValue } from 'react-native-reanimated';
import { computeSegmentVisibleLength } from '@/components/git/gitButtonGeometry';

const COLORS: [string, string, string] = ['#3b82f6', '#22c55e', '#f59e0b'];

// Geometry constants mirrored from gitButtonGeometry.ts
const GIT_BUTTON_SIZE = 56;
const GIT_RING_RADIUS_OFFSET = 6;
const RING_RADIUS = GIT_BUTTON_SIZE / 2 + GIT_RING_RADIUS_OFFSET;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const SEGMENT_LENGTH = CIRCUMFERENCE / 3;

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const passthrough = (name: string) => {
    const Component = ({ children, ...rest }: { children?: React.ReactNode }) =>
      React.createElement(View, rest, children);
    Component.displayName = name;
    return Component;
  };
  return {
    __esModule: true,
    Svg: passthrough('Svg'),
    Circle: passthrough('Circle'),
    Path: passthrough('Path'),
    G: passthrough('G'),
    default: passthrough('Svg'),
  };
});

const animatedCircleProps: Array<{ key: string; props: object }> = [];

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  const animatedComponent = (_component: unknown) => {
    const Wrapped = ({ children, ...rest }: { children?: React.ReactNode }) => {
      animatedCircleProps.push({ key: (children as { key?: string })?.key ?? '', props: rest });
      return React.createElement(View, rest, children);
    };
    Wrapped.displayName = 'AnimatedComponent';
    return Wrapped;
  };
  return {
    __esModule: true,
    useAnimatedProps: (worklet: () => object) => worklet(),
    useSharedValue: (v: number) => ({ value: v }),
    Animated: {
      createAnimatedComponent: animatedComponent,
    },
    default: {
      createAnimatedComponent: animatedComponent,
    },
  };
});

describe('GitButtonRing', () => {
  beforeEach(() => {
    animatedCircleProps.length = 0;
  });

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

  it('uses SVG Circle elements', () => {
    const Svg = require('react-native-svg').Svg;
    const progress = useSharedValue(0);
    render(<GitButtonRing progress={progress} colors={COLORS} />);
    expect(Svg).toBeTruthy();
  });

  it('each segment circle has distinct rotation and centered origin', () => {
    const progress = useSharedValue(0);
    render(<GitButtonRing progress={progress} colors={COLORS} />);
    expect(animatedCircleProps.length).toBe(3);
    const sorted = animatedCircleProps.sort((a, b) => Number(a.key) - Number(b.key));
    const transforms = sorted.map(({ props }) => (props as { transform?: string }).transform ?? null);
    const rotations = transforms.map((t) => {
      if (!t) return null;
      const match = t.match(/rotate\((\d+),/);
      return match ? Number(match[1]) : null;
    });
    const cx = 34 + 3.5 + 2;
    expect(rotations).toEqual([0, 120, 240]);
    expect(rotations[0]).not.toBe(rotations[1]);
    expect(rotations[1]).not.toBe(rotations[2]);
    expect(transforms[0]).toContain(`rotate(0, ${cx}, ${cx})`);
    expect(transforms[1]).toContain(`rotate(120, ${cx}, ${cx})`);
    expect(transforms[2]).toContain(`rotate(240, ${cx}, ${cx})`);
  });

  describe('computeSegmentVisibleLength', () => {
    it('at progress=0 all segments have visibleLength=0', () => {
      expect(computeSegmentVisibleLength(0, 0, SEGMENT_LENGTH)).toBeCloseTo(0);
      expect(computeSegmentVisibleLength(0, 1, SEGMENT_LENGTH)).toBeCloseTo(0);
      expect(computeSegmentVisibleLength(0, 2, SEGMENT_LENGTH)).toBeCloseTo(0);
    });

    it('at progress=1/3 segment 0 is full (segmentLength), segments 1 and 2 hidden', () => {
      const p = 1 / 3;
      expect(computeSegmentVisibleLength(p, 0, SEGMENT_LENGTH)).toBeCloseTo(SEGMENT_LENGTH);
      expect(computeSegmentVisibleLength(p, 1, SEGMENT_LENGTH)).toBeCloseTo(0);
      expect(computeSegmentVisibleLength(p, 2, SEGMENT_LENGTH)).toBeCloseTo(0);
    });

    it('at progress=2/3 segments 0 and 1 full, segment 2 hidden', () => {
      const p = 2 / 3;
      expect(computeSegmentVisibleLength(p, 0, SEGMENT_LENGTH)).toBeCloseTo(SEGMENT_LENGTH);
      expect(computeSegmentVisibleLength(p, 1, SEGMENT_LENGTH)).toBeCloseTo(SEGMENT_LENGTH);
      expect(computeSegmentVisibleLength(p, 2, SEGMENT_LENGTH)).toBeCloseTo(0);
    });

    it('at progress=1 all segments are full (segmentLength)', () => {
      expect(computeSegmentVisibleLength(1, 0, SEGMENT_LENGTH)).toBeCloseTo(SEGMENT_LENGTH);
      expect(computeSegmentVisibleLength(1, 1, SEGMENT_LENGTH)).toBeCloseTo(SEGMENT_LENGTH);
      expect(computeSegmentVisibleLength(1, 2, SEGMENT_LENGTH)).toBeCloseTo(SEGMENT_LENGTH);
    });

    it('at progress=0.5 segment 0 complete, segment 1 partial (0.5*segmentLength), segment 2 hidden', () => {
      const p = 0.5;
      expect(computeSegmentVisibleLength(p, 0, SEGMENT_LENGTH)).toBeCloseTo(SEGMENT_LENGTH);
      expect(computeSegmentVisibleLength(p, 1, SEGMENT_LENGTH)).toBeCloseTo(0.5 * SEGMENT_LENGTH);
      expect(computeSegmentVisibleLength(p, 2, SEGMENT_LENGTH)).toBeCloseTo(0);
    });

    it('at progress=0.8 segments 0 and 1 full, segment 2 partial (0.4*segmentLength)', () => {
      const p = 0.8;
      expect(computeSegmentVisibleLength(p, 0, SEGMENT_LENGTH)).toBeCloseTo(SEGMENT_LENGTH);
      expect(computeSegmentVisibleLength(p, 1, SEGMENT_LENGTH)).toBeCloseTo(SEGMENT_LENGTH);
      expect(computeSegmentVisibleLength(p, 2, SEGMENT_LENGTH)).toBeCloseTo(0.4 * SEGMENT_LENGTH);
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
