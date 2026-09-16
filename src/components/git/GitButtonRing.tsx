/**
 * GitButtonRing - Three-segment hold progress ring using react-native-svg Path.
 *
 * Each segment is a fixed 116-degree arc (4-degree gap between segments)
 * with a static strokeDasharray and animated strokeDashoffset.
 * Segment i (0,1,2) is hidden before progress i/3, fills linearly during
 * [i/3, (i+1)/3], and remains fully revealed thereafter.
 */
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedProps,
  type SharedValue,
} from 'react-native-reanimated';
import { Circle, Path, Svg } from 'react-native-svg';

import { GIT_BUTTON_SIZE } from './gitButtonGeometry';

export const GIT_RING_STROKE_WIDTH = 3.5;
const GIT_RING_PADDING = 2;
const GIT_RING_RADIUS_OFFSET = 6;
export const GIT_RING_RADIUS = GIT_BUTTON_SIZE / 2 + GIT_RING_RADIUS_OFFSET;

const AnimatedPath = Animated.createAnimatedComponent(Path);

const cx = GIT_RING_RADIUS + GIT_RING_STROKE_WIDTH + GIT_RING_PADDING;
const cy = cx;
const canvasSize = GIT_RING_RADIUS * 2 + GIT_RING_STROKE_WIDTH * 2 + GIT_RING_PADDING * 2;

const SEGMENT_ARC_DEGREES = 120 - 4;
const SEGMENT_ARC_RADIANS = (SEGMENT_ARC_DEGREES * Math.PI) / 180;
export const SEGMENT_LENGTH = SEGMENT_ARC_RADIANS * GIT_RING_RADIUS;

const GAP_OFFSET_DEGREES = 2;
const SCORE_DOT_RADIUS = 2.5;

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
      {[0, 1, 2].map((i) => {
        const startAngleDeg = -90 + i * 120 + GAP_OFFSET_DEGREES;
        const endAngleDeg = startAngleDeg + SEGMENT_ARC_DEGREES;
        const endAngleRad = (endAngleDeg * Math.PI) / 180;
        const ex = cx + GIT_RING_RADIUS * Math.cos(endAngleRad);
        const ey = cy + GIT_RING_RADIUS * Math.sin(endAngleRad);
        return (
          <Circle
            key={`dot-${i}`}
            cx={ex}
            cy={ey}
            r={SCORE_DOT_RADIUS}
            fill={colors[i]}
          />
        );
      })}
      {[0, 1, 2].map((i) => (
        <AnimatedSegmentPath
          key={i}
          segIndex={i}
          progress={progress}
          color={colors[i]}
        />
      ))}
    </Svg>
  );
}

interface AnimatedSegmentPathProps {
  segIndex: number;
  progress: SharedValue<number>;
  color: string;
}

function AnimatedSegmentPath({
  segIndex,
  progress,
  color,
}: AnimatedSegmentPathProps) {
  const animatedProps = useAnimatedProps(() => {
    'worklet';
    const x = 3 * progress.value - segIndex;
    const offset = x <= 0 ? SEGMENT_LENGTH : x >= 1 ? 0 : (1 - x) * SEGMENT_LENGTH;
    return { strokeDashoffset: offset };
  });

  const startAngleDeg = -90 + segIndex * 120 + GAP_OFFSET_DEGREES;
  const endAngleDeg = startAngleDeg + SEGMENT_ARC_DEGREES;

  const startAngleRad = (startAngleDeg * Math.PI) / 180;
  const endAngleRad = (endAngleDeg * Math.PI) / 180;

  const sx = cx + GIT_RING_RADIUS * Math.cos(startAngleRad);
  const sy = cy + GIT_RING_RADIUS * Math.sin(startAngleRad);
  const ex = cx + GIT_RING_RADIUS * Math.cos(endAngleRad);
  const ey = cy + GIT_RING_RADIUS * Math.sin(endAngleRad);

  const d = `M ${sx} ${sy} A ${GIT_RING_RADIUS} ${GIT_RING_RADIUS} 0 0 1 ${ex} ${ey}`;

  return (
    <AnimatedPath
      d={d}
      stroke={color}
      strokeWidth={GIT_RING_STROKE_WIDTH}
      strokeLinecap="round"
      fill="none"
      strokeDasharray={[SEGMENT_LENGTH, SEGMENT_LENGTH]}
      animatedProps={animatedProps}
    />
  );
}

const styles = StyleSheet.create({
  svg: {
    position: 'absolute',
  },
});
