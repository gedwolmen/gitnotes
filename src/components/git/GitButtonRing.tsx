/**
 * GitButtonRing - Three-segment hold progress ring using Circle + DashPathEffect.
 *
 * Replaces the fragile Path start/end animation with the proven Circle+DashPathEffect
 * Skia pattern from HoldProgressRing. Each of the three colored layers reveals
 * only its one-third arc via DashPathEffect intervals, with opacity controlling
 * the stepped segment visibility (segment 0 visible at progress 0→1/3, etc.).
 *
 * Uses the same geometry constants as the original implementation:
 * - GIT_BUTTON_SIZE = 56
 * - GIT_RING_RADIUS = 34 (56/2 + 6)
 * - GIT_RING_STROKE_WIDTH = 3.5
 * - Three distinct colors from props
 */
import { StyleSheet } from 'react-native';
import { Canvas, Circle, DashPathEffect } from '@shopify/react-native-skia';
import {
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { GIT_BUTTON_SIZE } from './gitButtonGeometry';

export const GIT_RING_STROKE_WIDTH = 3.5;
const GIT_RING_PADDING = 2;
const GIT_RING_RADIUS_OFFSET = 6;
export const GIT_RING_RADIUS = GIT_BUTTON_SIZE / 2 + GIT_RING_RADIUS_OFFSET;

interface GitButtonRingProps {
  readonly progress: SharedValue<number>;
  readonly colors: [string, string, string];
}

const cx = GIT_RING_RADIUS + GIT_RING_STROKE_WIDTH + GIT_RING_PADDING;
const cy = cx;
const canvasSize = GIT_RING_RADIUS * 2 + GIT_RING_STROKE_WIDTH * 2 + GIT_RING_PADDING * 2;
const circumference = 2 * Math.PI * GIT_RING_RADIUS;
const SEGMENT_LENGTH = circumference / 3; // Each segment is 1/3 of the circle

/**
 * Compute derived values for segment i (0, 1, 2).
 * Each segment's dash length equals SEGMENT_LENGTH, revealing only its one-third arc.
 * Opacity controls stepped visibility: segment i is visible when progress >= i/3.
 */
function useSegmentDerivedValues(progress: SharedValue<number>, i: number) {
  const fill = useDerivedValue(() => {
    'worklet';
    const p = progress.value;
    // All segments show their full dash length when active
    // The dash reveals only 1/3 arc per segment via DashPathEffect intervals
    if (p <= i / 3) return 0;
    return SEGMENT_LENGTH;
  }, [i]);

  const opacity = useDerivedValue(() => {
    'worklet';
    const p = progress.value;
    // Stepped reveal: segment i visible when progress >= i/3
    // This matches HoldProgressRing's opacity pattern for stepped segments
    const raw = (p - i / 3) * 3;
    return Math.max(0, Math.min(1, raw));
  }, [i]);

  // Rotation positions this segment's dash at angle: -π/2 + i * 2π/3
  // So segment 0 is at top (270°), segment 1 at 30°, segment 2 at 150°
  const rotation = -Math.PI / 2 + i * (2 * Math.PI / 3);

  return { fill, opacity, rotation };
}

export function GitButtonRing({ progress, colors }: GitButtonRingProps) {
  const seg0 = useSegmentDerivedValues(progress, 0);
  const seg1 = useSegmentDerivedValues(progress, 1);
  const seg2 = useSegmentDerivedValues(progress, 2);

  return (
    <Canvas
      pointerEvents="none"
      style={[
        styles.canvas,
        {
          width: canvasSize,
          height: canvasSize,
          top: -(canvasSize - GIT_BUTTON_SIZE) / 2,
          left: -(canvasSize - GIT_BUTTON_SIZE) / 2,
        },
      ]}
    >
      {/* Segment 0: top position (270° / -π/2), reveals 0→1/3 arc */}
      <Circle
        cx={cx}
        cy={cy}
        r={GIT_RING_RADIUS}
        color={colors[0]}
        style="stroke"
        strokeWidth={GIT_RING_STROKE_WIDTH}
        strokeCap="round"
        opacity={seg0.opacity}
        origin={{ x: cx, y: cy }}
        transform={[{ rotate: seg0.rotation }]}
      >
        <DashPathEffect intervals={[SEGMENT_LENGTH, circumference]} />
      </Circle>

      {/* Segment 1: 30° position, reveals 1/3→2/3 arc */}
      <Circle
        cx={cx}
        cy={cy}
        r={GIT_RING_RADIUS}
        color={colors[1]}
        style="stroke"
        strokeWidth={GIT_RING_STROKE_WIDTH}
        strokeCap="round"
        opacity={seg1.opacity}
        origin={{ x: cx, y: cy }}
        transform={[{ rotate: seg1.rotation }]}
      >
        <DashPathEffect intervals={[SEGMENT_LENGTH, circumference]} />
      </Circle>

      {/* Segment 2: 150° position, reveals 2/3→1 arc */}
      <Circle
        cx={cx}
        cy={cy}
        r={GIT_RING_RADIUS}
        color={colors[2]}
        style="stroke"
        strokeWidth={GIT_RING_STROKE_WIDTH}
        strokeCap="round"
        opacity={seg2.opacity}
        origin={{ x: cx, y: cy }}
        transform={[{ rotate: seg2.rotation }]}
      >
        <DashPathEffect intervals={[SEGMENT_LENGTH, circumference]} />
      </Circle>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: {
    position: 'absolute',
  },
});
