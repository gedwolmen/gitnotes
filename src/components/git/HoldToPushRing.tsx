import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedProps,
  type SharedValue,
} from 'react-native-reanimated';
import { Circle, Svg } from 'react-native-svg';

import {
  GIT_BUTTON_SIZE,
  HOLD_RING_CANVAS_SIZE,
  HOLD_RING_RADIUS_OFFSET,
  HOLD_RING_STROKE_WIDTH,
} from './gitButtonGeometry';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING_RADIUS = GIT_BUTTON_SIZE / 2 + HOLD_RING_RADIUS_OFFSET;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_CENTER = HOLD_RING_CANVAS_SIZE / 2;

interface HoldToPushRingProps {
  /** Fill fraction 0..1 — driven by the hold gesture, then by push progress. */
  progress: SharedValue<number>;
  /** Mount/visibility of the ring (parent shows it while holding/pushing). */
  visible: boolean;
  /** Fill color of the progress arc. */
  color?: string;
  /** Track color of the unfilled ring. */
  trackColor?: string;
  testID?: string;
}

/**
 * Circular progress ring drawn around the floating git button's border.
 * Fills clockwise from 12 o'clock as `progress` goes 0 → 1 (SVG dash-offset
 * animated on the UI thread via reanimated). Rebuilt on reanimated + SVG —
 * main's Skia HoldProgressRing was reference-only.
 */
export default function HoldToPushRing({
  progress,
  visible,
  color = '#3b82f6',
  trackColor = 'rgba(148, 163, 184, 0.35)',
  testID,
}: HoldToPushRingProps) {
  const arcProps = useAnimatedProps(() => {
    const clamped = Math.min(1, Math.max(0, progress.value));
    return {
      strokeDashoffset: RING_CIRCUMFERENCE * (1 - clamped),
      opacity: interpolate(clamped, [0, 0.08, 1], [0, 1, 1]),
    };
  });

  if (!visible) {
    return null;
  }

  return (
    <View pointerEvents="none" testID={testID} style={styles.container}>
      <Svg width={HOLD_RING_CANVAS_SIZE} height={HOLD_RING_CANVAS_SIZE}>
        <Circle
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={RING_RADIUS}
          stroke={trackColor}
          strokeWidth={HOLD_RING_STROKE_WIDTH}
          fill="none"
          opacity={0.6}
        />
        <AnimatedCircle
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={RING_RADIUS}
          stroke={color}
          strokeWidth={HOLD_RING_STROKE_WIDTH}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
          animatedProps={arcProps}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: HOLD_RING_CANVAS_SIZE,
    height: HOLD_RING_CANVAS_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
