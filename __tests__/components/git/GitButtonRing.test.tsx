/**
 * Focused tests for GitButtonRing.
 *
 * GitButtonRing renders a three-segment progress ring using Skia.Canvas
 * with Skia.Path.Circle for the ring geometry. The component uses
 * useDerivedValue to compute per-segment end values from a shared
 * progress value.
 *
 * These tests verify:
 * - The component renders without crashing
 * - The ring geometry constants are correct
 * - Skia.Path.Circle is used (not the deprecated PathBuilder.addCircle)
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { GitButtonRing, GIT_RING_RADIUS, GIT_RING_STROKE_WIDTH } from '@/components/git/GitButtonRing';
import { useSharedValue } from 'react-native-reanimated';

// --- Mock react-native-skia globally so Skia Canvas renders in tests ---
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
    Path: passthrough('Path'),
    Skia: {
      Path: {
        Make: () => ({ moveTo: () => {}, lineTo: () => {}, close: () => {}, build: () => ({}), rewind: () => {}, setIsVolatile: () => {} }),
        Circle: jest.fn(() => ({})),
        Rect: () => ({}),
        Oval: () => ({}),
        RRect: () => ({}),
      },
      PathBuilder: {
        Make: () => ({
          moveTo: () => {},
          lineTo: () => {},
          close: () => {},
          arcToOval: () => {},
          build: () => ({}),
        }),
      },
      XYWHRect: () => ({}),
      RRect: () => ({}),
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

const COLORS: [string, string, string] = ['#3b82f6', '#22c55e', '#f59e0b'];

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
    // GIT_RING_RADIUS = GIT_BUTTON_SIZE/2 + 6, GIT_BUTTON_SIZE=56
    expect(GIT_RING_RADIUS).toBe(56 / 2 + 6);
    expect(GIT_RING_STROKE_WIDTH).toBe(3.5);
  });

  it('uses Skia.Path.Circle for ring geometry (not PathBuilder.addCircle)', () => {
    const Skia = require('@shopify/react-native-skia').Skia;
    const progress = useSharedValue(0);
    render(<GitButtonRing progress={progress} colors={COLORS} />);
    // Verify Skia.Path.Circle was called
    expect(Skia.Path.Circle).toHaveBeenCalled();
  });
});
