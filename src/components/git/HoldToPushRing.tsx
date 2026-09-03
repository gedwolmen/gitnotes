import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedProps,
  type SharedValue,
} from 'react-native-reanimated';
import { Svg, Text as SvgText } from 'react-native-svg';

import {
  GIT_BUTTON_SIZE,
  HOLD_RING_CANVAS_SIZE,
} from './gitButtonGeometry';

const AnimatedSvgText = Animated.createAnimatedComponent(SvgText);
const CANVAS_CENTER = HOLD_RING_CANVAS_SIZE / 2;
const LABEL_RADIUS = GIT_BUTTON_SIZE / 2 + 14;

interface SegmentLabel {
  text: string;
  angle: number;
  /** Start and end of the progress fraction that this segment occupies. */
  start: number;
  end: number;
}

const SEGMENT_LABELS: SegmentLabel[] = [
  { text: 'stage', angle: 60, start: 0, end: 1 / 3 },
  { text: 'commit', angle: 180, start: 1 / 3, end: 2 / 3 },
  { text: 'push', angle: 300, start: 2 / 3, end: 1 },
];

function pointOnCircle(degreesFromTop: number, radius: number) {
  const radians = ((degreesFromTop - 90) * Math.PI) / 180;
  return {
    x: CANVAS_CENTER + Math.cos(radians) * radius,
    y: CANVAS_CENTER + Math.sin(radians) * radius,
  };
}

interface HoldToPushRingProps {
  /** Fill fraction 0..1 — driven by the hold gesture, then by push progress. */
  progress: SharedValue<number>;
  /** Mount/visibility of the ring (parent shows it while holding/pushing). */
  visible: boolean;
  /** Color the text takes when its segment is fully filled. */
  fillColor?: string;
  /** Dim color used while the segment hasn't started yet. */
  dimColor?: string;
  testID?: string;
}

/**
 * Text-as-fill hold indicator. No circle, no ring arc, no tick marks — just
 * three words ("stage" / "commit" / "push") positioned around the button.
 *
 * Each word's opacity ramps 0.15 → 1.0 across its own progress slice:
 *   - stage:  0.00 → 0.33
 *   - commit: 0.33 → 0.66
 *   - push:   0.66 → 1.00
 *
 * The user reads both *what* the next action is and *how close* they are to
 * it from the current brightness of each word. The "fill" is the words
 * themselves lighting up, not an arc sweeping around the button.
 */
export default function HoldToPushRing({
  progress,
  visible,
  fillColor = '#ffffff',
  dimColor = 'rgba(255, 255, 255, 0.18)',
  testID,
}: HoldToPushRingProps) {
  if (!visible) {
    return null;
  }

  return (
    <View pointerEvents="none" testID={testID} style={styles.container}>
      <Svg width={HOLD_RING_CANVAS_SIZE} height={HOLD_RING_CANVAS_SIZE}>
        {SEGMENT_LABELS.map((segment) => {
          const labelPos = pointOnCircle(segment.angle, LABEL_RADIUS);
          return (
            <AnimatedFillText
              key={segment.text}
              progress={progress}
              start={segment.start}
              end={segment.end}
              x={labelPos.x}
              y={labelPos.y}
              text={segment.text}
              fillColor={fillColor}
              dimColor={dimColor}
            />
          );
        })}
      </Svg>
    </View>
  );
}

interface AnimatedFillTextProps {
  progress: SharedValue<number>;
  start: number;
  end: number;
  x: number;
  y: number;
  text: string;
  fillColor: string;
  dimColor: string;
}

function AnimatedFillText({
  progress,
  start,
  end,
  x,
  y,
  text,
  fillColor,
  dimColor,
}: AnimatedFillTextProps) {
  const props = useAnimatedProps(() => {
    const t = interpolate(progress.value, [start, end], [0, 1], 'clamp');
    return {
      fill: t > 0.6 ? fillColor : dimColor,
      opacity: 0.25 + 0.75 * t,
    };
  });
  return (
    <AnimatedSvgText
      x={x}
      y={y + 3}
      fontSize={11}
      fontWeight="700"
      textAnchor="middle"
      letterSpacing={0.4}
      animatedProps={props}
    >
      {text}
    </AnimatedSvgText>
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