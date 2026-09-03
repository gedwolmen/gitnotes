import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  type SharedValue,
} from 'react-native-reanimated';
import { Circle, Line, Svg, Text as SvgText } from 'react-native-svg';

import {
  GIT_BUTTON_SIZE,
  HOLD_RING_CANVAS_SIZE,
  HOLD_RING_RADIUS_OFFSET,
  HOLD_RING_STROKE_WIDTH,
  HOLD_RING_TICK_LENGTH,
} from './gitButtonGeometry';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING_RADIUS = GIT_BUTTON_SIZE / 2 + HOLD_RING_RADIUS_OFFSET;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_CENTER = HOLD_RING_CANVAS_SIZE / 2;

/** Where the 1/3 and 2/3 tick marks sit on the circle (degrees from 12 o'clock). */
const TICK_ANGLE_1_OF_3 = 120;
const TICK_ANGLE_2_OF_3 = 240;

/**
 * Labels for each of the three hold segments. Rendered as SVG text at the
 * midpoint of each segment so the user can see what each phase does while
 * holding. `stage` sits in the 12 → 4 o'clock arc, `commit` in 4 → 8,
 * `push` in 8 → 12.
 */
const SEGMENT_LABELS: { angle: number; text: string }[] = [
  { angle: 60, text: 'stage' },
  { angle: 180, text: 'commit' },
  { angle: 300, text: 'push' },
];
const LABEL_RADIUS = RING_RADIUS + HOLD_RING_STROKE_WIDTH / 2 + 7;

function pointOnCircle(degreesFromTop: number, radius: number) {
  const radians = ((degreesFromTop - 90) * Math.PI) / 180;
  return {
    x: RING_CENTER + Math.cos(radians) * radius,
    y: RING_CENTER + Math.sin(radians) * radius,
  };
}

interface HoldToPushRingProps {
  /** Fill fraction 0..1 — driven by the hold gesture, then by push progress. */
  progress: SharedValue<number>;
  /** Mount/visibility of the ring (parent shows it while holding/pushing). */
  visible: boolean;
  /** Fill color of the progress arc. */
  color?: string;
  /** Track color of the unfilled ring. */
  trackColor?: string;
  /** Color of the 1/3 and 2/3 tick marks. */
  tickColor?: string;
  /** Color of the per-segment action labels ('stage' / 'commit' / 'push'). */
  textColor?: string;
  testID?: string;
}

/**
 * Three-segment hold ring drawn around the floating git button.
 *
 * The ring is divided into three arcs by tick marks at 1/3 (120°) and 2/3
 * (240°) so the user can see *where* the next threshold sits while holding.
 * The fill arc sweeps 0 → 1 clockwise from 12 o'clock; the track + ticks stay
 * visible the whole time so the gesture feels anchored.
 *
 * Rebuilt on reanimated + SVG — main's Skia HoldProgressRing was reference-
 * only.
 */
export default function HoldToPushRing({
  progress,
  visible,
  color = '#3b82f6',
  trackColor = 'rgba(255, 255, 255, 0.85)',
  tickColor = 'rgba(255, 255, 255, 0.9)',
  textColor = 'rgba(255, 255, 255, 0.95)',
  testID,
}: HoldToPushRingProps) {
  const arcProps = useAnimatedProps(() => {
    const clamped = Math.min(1, Math.max(0, progress.value));
    return {
      strokeDashoffset: RING_CIRCUMFERENCE * (1 - clamped),
    };
  });

  const tick1Inner = pointOnCircle(TICK_ANGLE_1_OF_3, RING_RADIUS - HOLD_RING_TICK_LENGTH / 2);
  const tick1Outer = pointOnCircle(TICK_ANGLE_1_OF_3, RING_RADIUS + HOLD_RING_TICK_LENGTH / 2);
  const tick2Inner = pointOnCircle(TICK_ANGLE_2_OF_3, RING_RADIUS - HOLD_RING_TICK_LENGTH / 2);
  const tick2Outer = pointOnCircle(TICK_ANGLE_2_OF_3, RING_RADIUS + HOLD_RING_TICK_LENGTH / 2);

  if (!visible) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      testID={testID}
      style={[styles.container, styles.glow]}
    >
      <Svg width={HOLD_RING_CANVAS_SIZE} height={HOLD_RING_CANVAS_SIZE}>
        <Circle
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={RING_RADIUS}
          stroke={trackColor}
          strokeWidth={HOLD_RING_STROKE_WIDTH}
          fill="none"
          opacity={0.45}
        />
        <Line
          x1={tick1Inner.x}
          y1={tick1Inner.y}
          x2={tick1Outer.x}
          y2={tick1Outer.y}
          stroke={tickColor}
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.9}
        />
        <Line
          x1={tick2Inner.x}
          y1={tick2Inner.y}
          x2={tick2Outer.x}
          y2={tick2Outer.y}
          stroke={tickColor}
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.9}
        />
        {SEGMENT_LABELS.map((segment) => {
          const labelPos = pointOnCircle(segment.angle, LABEL_RADIUS);
          return (
            <SvgText
              key={segment.text}
              x={labelPos.x}
              y={labelPos.y + 3}
              fill={textColor}
              fontSize={8.5}
              fontWeight="700"
              textAnchor="middle"
              letterSpacing={0.3}
            >
              {segment.text}
            </SvgText>
          );
        })}
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
  glow: {
    shadowColor: '#ffffff',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
});