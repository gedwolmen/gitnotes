/**
 * Focused tests for GitButtonRing using SVG Path arcs.
 *
 * Each segment is a fixed 120-degree arc (with a 4-degree gap) that uses a
 * static strokeDasharray and an animated strokeDashoffset. Segment i (0,1,2)
 * is invisible before progress i/3, fills linearly during [i/3,(i+1)/3],
 * and remains fully revealed thereafter.
 *
 * NOTE: Jest mocks react-native-svg and does NOT validate native pixel rendering.
 * Device visual QA requires a release build, not mocked Jest tests.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { GitButtonRing, GIT_RING_RADIUS, GIT_RING_STROKE_WIDTH, SEGMENT_LENGTH } from '@/components/git/GitButtonRing';
import { useSharedValue } from 'react-native-reanimated';
import { GIT_BUTTON_SIZE } from '@/components/git/gitButtonGeometry';

const COLORS: [string, string, string] = ['#3b82f6', '#22c55e', '#f59e0b'];

const GIT_RING_RADIUS_OFFSET = 6;
const RING_RADIUS = GIT_BUTTON_SIZE / 2 + GIT_RING_RADIUS_OFFSET;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const SEGMENT_ARC_DEGREES = 120 - 4;
const SEGMENT_ARC_RADIANS = (SEGMENT_ARC_DEGREES * Math.PI) / 180;
const COMPUTED_SEGMENT_LENGTH = SEGMENT_ARC_RADIANS * RING_RADIUS;

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

let mockUseAnimatedPropsResults: object[] = [];
let mockAnimatedPathProps: Array<{ d: string; strokeDasharray: [number, number]; animatedProps: object }> = [];

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    useAnimatedProps: (worklet: () => object) => {
      const result = worklet();
      mockUseAnimatedPropsResults.push(result);
      return result;
    },
    useSharedValue: (v: number) => ({ value: v }),
    Animated: {
      createAnimatedComponent: (_Comp: unknown) => {
        const Wrapped = (props: { d?: string; strokeDasharray?: [number, number]; animatedProps?: object; [key: string]: unknown }) => {
          if (props.d !== undefined && props.strokeDasharray !== undefined) {
            mockAnimatedPathProps.push({
              d: props.d,
              strokeDasharray: props.strokeDasharray,
              animatedProps: props.animatedProps ?? {},
            });
          }
          return React.createElement(View, { 'data-testid': `animated-path` });
        };
        Wrapped.displayName = 'AnimatedPath';
        return Wrapped;
      },
    },
    default: {
      createAnimatedComponent: (_Comp: unknown) => {
        const Wrapped = (props: { d?: string; strokeDasharray?: [number, number]; animatedProps?: object; [key: string]: unknown }) => {
          if (props.d !== undefined && props.strokeDasharray !== undefined) {
            mockAnimatedPathProps.push({
              d: props.d,
              strokeDasharray: props.strokeDasharray,
              animatedProps: props.animatedProps ?? {},
            });
          }
          return React.createElement(View, { 'data-testid': `animated-path` });
        };
        Wrapped.displayName = 'AnimatedPath';
        return Wrapped;
      },
    },
  };
});

describe('GitButtonRing', () => {
  beforeEach(() => {
    mockUseAnimatedPropsResults = [];
    mockAnimatedPathProps = [];
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

  it('exposes SEGMENT_LENGTH derived from arc geometry', () => {
    expect(SEGMENT_LENGTH).toBeCloseTo(COMPUTED_SEGMENT_LENGTH, 5);
    expect(SEGMENT_LENGTH).toBeGreaterThan(0);
    expect(SEGMENT_LENGTH).toBeLessThan(CIRCUMFERENCE / 3);
  });

  it('renders three Path elements with valid arc path data and static strokeDasharray', () => {
    const progress = useSharedValue(0);
    render(<GitButtonRing progress={progress} colors={COLORS} />);
    expect(mockAnimatedPathProps.length).toBe(3);
    for (const seg of mockAnimatedPathProps) {
      expect(seg.d).toMatch(/^M -?\d+(\.\d+)? -?\d+(\.\d+)? A \d+(\.\d+)? \d+(\.\d+)? \d+(\.\d+)? [01] [01] -?\d+(\.\d+)? -?\d+(\.\d+)?$/);
      expect(seg.strokeDasharray[0]).toBeCloseTo(SEGMENT_LENGTH, 3);
      expect(seg.strokeDasharray[1]).toBeCloseTo(SEGMENT_LENGTH, 3);
    }
  });

  it('strokeDasharray is NOT in useAnimatedProps result (only strokeDashoffset)', () => {
    const progress = useSharedValue(0.5);
    render(<GitButtonRing progress={progress} colors={COLORS} />);
    for (const result of mockUseAnimatedPropsResults) {
      expect(Object.keys(result)).toEqual(['strokeDashoffset']);
    }
  });

  describe('animated strokeDashoffset thresholds', () => {
    const SEG = SEGMENT_LENGTH;

    it('at progress=0 all segments have offset=SEG (hidden)', () => {
      const progress = useSharedValue(0);
      render(<GitButtonRing progress={progress} colors={COLORS} />);
      expect(mockUseAnimatedPropsResults.length).toBe(3);
      for (const result of mockUseAnimatedPropsResults) {
        const { strokeDashoffset } = result as { strokeDashoffset: number };
        expect(strokeDashoffset).toBeCloseTo(SEG, 3);
      }
    });

    it('at progress=1/3 segment0 offset=0, segments1and2 offset=SEG', () => {
      const progress = useSharedValue(1 / 3);
      render(<GitButtonRing progress={progress} colors={COLORS} />);
      expect(mockUseAnimatedPropsResults.length).toBe(3);
      const offsets = (mockUseAnimatedPropsResults as { strokeDashoffset: number }[]).map((r) => r.strokeDashoffset);
      expect(offsets.filter((o) => o === 0).length).toBe(1);
      expect(offsets.filter((o) => o === SEG).length).toBe(2);
    });

    it('at progress=2/3 segments0and1 offset=0, segment2 offset=SEG', () => {
      const progress = useSharedValue(2 / 3);
      render(<GitButtonRing progress={progress} colors={COLORS} />);
      expect(mockUseAnimatedPropsResults.length).toBe(3);
      const offsets = (mockUseAnimatedPropsResults as { strokeDashoffset: number }[]).map((r) => r.strokeDashoffset);
      expect(offsets.filter((o) => o === 0).length).toBe(2);
      expect(offsets.filter((o) => o === SEG).length).toBe(1);
    });

    it('at progress=1 all segments have offset=0 (fully revealed)', () => {
      const progress = useSharedValue(1);
      render(<GitButtonRing progress={progress} colors={COLORS} />);
      expect(mockUseAnimatedPropsResults.length).toBe(3);
      for (const result of mockUseAnimatedPropsResults) {
        const { strokeDashoffset } = result as { strokeDashoffset: number };
        expect(strokeDashoffset).toBeCloseTo(0, 3);
      }
    });

    it('at progress=0.5: seg0 offset=0, seg1 partial(≈SEG/2), seg2 offset=SEG', () => {
      const progress = useSharedValue(0.5);
      render(<GitButtonRing progress={progress} colors={COLORS} />);
      expect(mockUseAnimatedPropsResults.length).toBe(3);
      const offsets = (mockUseAnimatedPropsResults as { strokeDashoffset: number }[]).map((r) => r.strokeDashoffset);
      const zeroCount = offsets.filter((o) => o === 0).length;
      const segCount = offsets.filter((o) => Math.abs(o - SEG) < 0.01).length;
      const halfSegCount = offsets.filter((o) => Math.abs(o - SEG / 2) < 0.01).length;
      expect(zeroCount).toBe(1);
      expect(segCount).toBe(1);
      expect(halfSegCount).toBe(1);
    });

    it('at progress=0.8: seg0and1 offset=0, seg2 partial(≈0.6*SEG)', () => {
      const progress = useSharedValue(0.8);
      render(<GitButtonRing progress={progress} colors={COLORS} />);
      expect(mockUseAnimatedPropsResults.length).toBe(3);
      const offsets = (mockUseAnimatedPropsResults as { strokeDashoffset: number }[]).map((r) => r.strokeDashoffset);
      const zeroCount = offsets.filter((o) => o === 0).length;
      const seg2Partial = offsets.filter((o) => Math.abs(o - 0.6 * SEG) < 0.01).length;
      expect(zeroCount).toBe(2);
      expect(seg2Partial).toBe(1);
    });
  });

  it('renders with progress=0', () => {
    const progress = useSharedValue(0);
    const { toJSON } = render(<GitButtonRing progress={progress} colors={COLORS} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with progress=1/3', () => {
    const progress = useSharedValue(1 / 3);
    const { toJSON } = render(<GitButtonRing progress={progress} colors={COLORS} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with progress=2/3', () => {
    const progress = useSharedValue(2 / 3);
    const { toJSON } = render(<GitButtonRing progress={progress} colors={COLORS} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with progress=1', () => {
    const progress = useSharedValue(1);
    const { toJSON } = render(<GitButtonRing progress={progress} colors={COLORS} />);
    expect(toJSON()).toBeTruthy();
  });
});
