import { StyleSheet } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { type SharedValue } from 'react-native-reanimated';
import { GIT_BUTTON_SIZE } from '../git/gitButtonGeometry';

export const GIT_RING_STROKE_WIDTH = 3.5;
const GIT_RING_PADDING = 2;
const GIT_RING_RADIUS_OFFSET = 6;
export const GIT_RING_RADIUS = GIT_BUTTON_SIZE / 2 + GIT_RING_RADIUS_OFFSET;

interface GitButtonRingProps {
  readonly progress: SharedValue<number>;
  readonly colors: [string, string, string];
}

function makeCirclePath(cx: number, cy: number, r: number): ReturnType<typeof Skia.Path.Make> {
  return Skia.Path.Make().addCircle(cx, cy, r).close();
}

export function GitButtonRing({ progress, colors }: GitButtonRingProps) {
  const ringRadius = GIT_BUTTON_SIZE / 2 + GIT_RING_RADIUS_OFFSET;
  const canvasSize = ringRadius * 2 + GIT_RING_STROKE_WIDTH * 2 + GIT_RING_PADDING * 2;
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;

  const basePath = makeCirclePath(cx, cy, ringRadius);

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
        return (
          <Path
            key={i}
            path={basePath}
            color={colors[i]}
            style="stroke"
            strokeWidth={GIT_RING_STROKE_WIDTH}
            strokeCap="round"
            start={segStart}
            end={segEnd}
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
