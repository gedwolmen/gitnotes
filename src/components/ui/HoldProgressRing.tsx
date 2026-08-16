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
  readonly color: string;
  readonly reduceMotionEnabled: boolean;
}

export function HoldProgressRing({
  progress,
  size,
  color,
  reduceMotionEnabled,
}: HoldProgressRingProps) {
  const ringRadius = size / 2 + HOLD_RING_RADIUS_OFFSET;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringCanvasSize = ringRadius * 2 + HOLD_RING_STROKE_WIDTH * 2 + HOLD_RING_PADDING * 2;
  const ringCenter = ringCanvasSize / 2;
  const ringIntervals = useDerivedValue(() => [
    progress.value * ringCircumference,
    ringCircumference,
  ]);
  const ringOpacity = useDerivedValue(() => Math.min(1, progress.value * 3));

  if (reduceMotionEnabled) {
    return null;
  }

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
      <Circle
        cx={ringCenter}
        cy={ringCenter}
        r={ringRadius}
        color={color}
        style="stroke"
        strokeWidth={HOLD_RING_STROKE_WIDTH}
        strokeCap="round"
        opacity={ringOpacity}
        origin={{ x: ringCenter, y: ringCenter }}
        transform={[{ rotate: -Math.PI / 2 }]}
      >
        <DashPathEffect intervals={ringIntervals} />
      </Circle>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: {
    position: 'absolute',
  },
});
