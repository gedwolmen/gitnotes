/**
 * GitButtonRing - Three-segment hold progress ring.
 *
 * Each segment uses Skia.Path with animated start/end to progressively
 * fill the active segment's arc. Segment i (0,1,2) spans progress
 * [i/3, (i+1)/3]. The active segment's end is interpolated from
 * progress; completed segments are fully drawn.
 *
 * Geometry constants:
 * - GIT_BUTTON_SIZE = 56
 * - GIT_RING_RADIUS = 34 (56/2 + 6)
 * - GIT_RING_STROKE_WIDTH = 3.5
 */
import { StyleSheet } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
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

// Module-level base circle path (computed once)
const basePath = Skia.Path.Circle(cx, cy, GIT_RING_RADIUS);

export function GitButtonRing({ progress, colors }: GitButtonRingProps) {
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
      {[0, 1, 2].map((i) => {
        const segStart = i / 3;
        const segEnd = (i + 1) / 3;

        const segEndVal = useDerivedValue(() => {
          'worklet';
          const p = progress.value;
          if (p <= segStart) return segStart;
          if (p >= segEnd) return segEnd;
          return Math.max(segStart, p);
        }, [i]);

        return (
          <Path
            key={i}
            path={basePath}
            color={colors[i]}
            style="stroke"
            strokeWidth={GIT_RING_STROKE_WIDTH}
            strokeCap="round"
            start={segStart}
            end={segEndVal}
          />
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
