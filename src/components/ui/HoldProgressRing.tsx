import { StyleSheet } from 'react-native';
import { Canvas, Circle, DashPathEffect } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { FLOATING_AI_BUTTON_SIZE } from '../ai/floatingAIButtonGeometry';

export const HOLD_RING_STROKE_WIDTH = 3.5;
export const HOLD_RING_RADIUS_OFFSET = 6;
const HOLD_RING_PADDING = 2;
export const HOLD_RING_RADIUS = FLOATING_AI_BUTTON_SIZE / 2 + HOLD_RING_RADIUS_OFFSET;
export const HOLD_RING_CIRCUMFERENCE = 2 * Math.PI * HOLD_RING_RADIUS;

interface HoldProgressRingProps {
  readonly progress: SharedValue<number>;
  readonly size: number;
  /** Single color for backward compat with AI button; ignored when colors is set. */
  readonly color?: string;
  /** Three colors for git button: [green=stage, yellow=commit, blue=push]. */
  readonly colors?: [string, string, string];
  readonly reduceMotionEnabled: boolean;
}

export function HoldProgressRing({
  progress,
  size,
  color,
  colors,
  reduceMotionEnabled,
}: HoldProgressRingProps) {
  const ringRadius = size / 2 + HOLD_RING_RADIUS_OFFSET;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringCanvasSize = ringRadius * 2 + HOLD_RING_STROKE_WIDTH * 2 + HOLD_RING_PADDING * 2;
  const ringCenter = ringCanvasSize / 2;

  if (reduceMotionEnabled) {
    return null;
  }

  const isMultiColor = Boolean(colors);
  const ringColors: [string, string, string] = isMultiColor
    ? colors!
    : [
        color ?? '#22c55e',
        color ?? '#22c55e',
        color ?? '#22c55e',
      ];

  return (
    <Canvas
      pointerEvents="none"
      style={[
        styles.canvas,
        {
          width: ringCanvasSize,
          height: ringCanvasSize,
          top: -(ringCanvasSize - size) / 2,
          left: -(ringCanvasSize - size) / 2,
        },
      ]}
    >
      {[0, 1, 2].map((i) => {
        const intervals = useDerivedValue(
          // Inline worklet: segmentInterval logic must be inside the worklet callback,
          // not a cross-context plain-function call.
          () => {
            'worklet';
            const SEGMENT_WIDTH = 1 / 3;
            const start = i * SEGMENT_WIDTH;
            const fillFraction = Math.max(0, Math.min(1, (progress.value - start) / SEGMENT_WIDTH));
            return [fillFraction * ringCircumference, ringCircumference] as [number, number];
          },
          [i, ringCircumference],
        );
        const opacity = useDerivedValue(
          () => (progress.value > i / 3 ? 1 : 0),
          [i],
        );
        const rotation = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
        return (
          <Circle
            key={i}
            cx={ringCenter}
            cy={ringCenter}
            r={ringRadius}
            color={ringColors[i]}
            style="stroke"
            strokeWidth={HOLD_RING_STROKE_WIDTH}
            strokeCap="round"
            opacity={opacity}
            origin={{ x: ringCenter, y: ringCenter }}
            transform={[{ rotate: rotation }]}
          >
            <DashPathEffect intervals={intervals} />
          </Circle>
        );
      })}
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: {
    position: 'absolute',
  },
});
