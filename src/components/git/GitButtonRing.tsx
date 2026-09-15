/**
 * GitButtonRing - Three-segment hold progress ring using react-native-svg.
 *
 * Each segment uses an SVG Circle with animated strokeDasharray to
 * progressively fill the arc. Segment i (0,1,2) spans progress [i/3, (i+1)/3].
 * The strokeDasharray is driven by a SharedValue<number> through useAnimatedProps.
 *
 * Geometry constants:
 * - GIT_BUTTON_SIZE = 56
 * - GIT_RING_RADIUS = 34 (56/2 + 6)
 * - GIT_RING_STROKE_WIDTH = 3.5
 */
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedProps,
  type SharedValue,
} from 'react-native-reanimated';
import { Circle, Svg } from 'react-native-svg';

import { computeSegmentVisibleLength, GIT_BUTTON_SIZE } from './gitButtonGeometry';

export const GIT_RING_STROKE_WIDTH = 3.5;
const GIT_RING_PADDING = 2;
const GIT_RING_RADIUS_OFFSET = 6;
export const GIT_RING_RADIUS = GIT_BUTTON_SIZE / 2 + GIT_RING_RADIUS_OFFSET;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const cx = GIT_RING_RADIUS + GIT_RING_STROKE_WIDTH + GIT_RING_PADDING;
const cy = cx;
const canvasSize = GIT_RING_RADIUS * 2 + GIT_RING_STROKE_WIDTH * 2 + GIT_RING_PADDING * 2;

const CIRCUMFERENCE = 2 * Math.PI * GIT_RING_RADIUS;
const SEGMENT_LENGTH = CIRCUMFERENCE / 3;

interface GitButtonRingProps {
  readonly progress: SharedValue<number>;
  readonly colors: [string, string, string];
}

export function GitButtonRing({ progress, colors }: GitButtonRingProps) {
  return (
    <Svg
      width={canvasSize}
      height={canvasSize}
      pointerEvents="none"
      style={[
        styles.svg,
        {
          width: canvasSize,
          height: canvasSize,
          top: -(canvasSize - GIT_BUTTON_SIZE) / 2,
          left: -(canvasSize - GIT_BUTTON_SIZE) / 2,
        },
      ]}
    >
      {[0, 1, 2].map((i) => (
        <AnimatedSegmentCircle
          key={i}
          segIndex={i}
          progress={progress}
          color={colors[i]}
        />
      ))}
    </Svg>
  );
}

interface AnimatedSegmentCircleProps {
  segIndex: number;
  progress: SharedValue<number>;
  color: string;
}

function AnimatedSegmentCircle({
  segIndex,
  progress,
  color,
}: AnimatedSegmentCircleProps) {
  const animatedProps = useAnimatedProps(() => {
    'worklet';
    const visibleLength = computeSegmentVisibleLength(
      progress.value,
      segIndex,
      SEGMENT_LENGTH,
    );
    const opacity = visibleLength > 0 ? 1 : 0;
    return {
      strokeDasharray: [visibleLength, CIRCUMFERENCE - visibleLength],
      strokeOpacity: opacity,
    };
  });

  return (
    <AnimatedCircle
      cx={cx}
      cy={cy}
      r={GIT_RING_RADIUS}
      stroke={color}
      strokeWidth={GIT_RING_STROKE_WIDTH}
      strokeLinecap="round"
      fill="none"
      transform={`rotate(${segIndex * 120}, ${cx}, ${cy})`}
      animatedProps={animatedProps}
    />
  );
}

const styles = StyleSheet.create({
  svg: {
    position: 'absolute',
  },
});
