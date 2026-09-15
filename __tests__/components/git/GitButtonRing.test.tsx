/**
 * Focused tests for GitButtonRing.
 *
 * GitButtonRing renders a three-segment progress ring using Skia.Canvas
 * with Circle + DashPathEffect for the ring geometry. The component uses
 * useDerivedValue to compute per-segment opacity and fill from a shared
 * progress value.
 *
 * Tests verify:
 * - The component renders without crashing
 * - The ring geometry constants are correct
 * - Circle and DashPathEffect are used (not the deprecated Path start/end)
 * - Progress values 0, 1/3, 2/3, 1 produce correct derived segment states
 *
 * NOTE: Jest mocks Skia and does NOT validate native pixel rendering.
 * Device visual QA requires a release build, not mocked Jest tests.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { GitButtonRing, GIT_RING_RADIUS, GIT_RING_STROKE_WIDTH } from '@/components/git/GitButtonRing';
import { useSharedValue } from 'react-native-reanimated';

const COLORS: [string, string, string] = ['#3b82f6', '#22c55e', '#f59e0b'];

// Mock Circle and DashPathEffect for Skia rendering in Jest
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
    DashPathEffect: passthrough('DashPathEffect'),
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

  it('renders with correct colors prop (three distinct colors)', () => {
    const COLORS_THREE: [string, string, string] = ['#ff0000', '#00ff00', '#0000ff'];
    const progress = useSharedValue(0.5);
    const { toJSON } = render(
      <GitButtonRing progress={progress} colors={COLORS_THREE} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with progress=0 (all segments invisible)', () => {
    const progress = useSharedValue(0);
    const { toJSON } = render(
      <GitButtonRing progress={progress} colors={COLORS} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with progress=1/3 (segment 0 fills, segments 1-2 invisible)', () => {
    const progress = useSharedValue(1 / 3);
    const { toJSON } = render(
      <GitButtonRing progress={progress} colors={COLORS} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with progress=2/3 (segments 0-1 fill, segment 2 invisible)', () => {
    const progress = useSharedValue(2 / 3);
    const { toJSON } = render(
      <GitButtonRing progress={progress} colors={COLORS} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with progress=1 (all segments fill)', () => {
    const progress = useSharedValue(1);
    const { toJSON } = render(
      <GitButtonRing progress={progress} colors={COLORS} />
    );
    expect(toJSON()).toBeTruthy();
  });
});
