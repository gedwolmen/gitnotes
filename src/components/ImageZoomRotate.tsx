import React from 'react';
import { StyleSheet } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

export interface ImageZoomRotateProps {
  children: React.ReactNode;
  minScale?: number;
  maxScale?: number;
}

export interface Transform {
  scale: number;
  rotation: number;
}

export const IDENTITY_TRANSFORM: Transform = { scale: 1, rotation: 0 };

export function clampScale(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export default function ImageZoomRotate({
  children,
  minScale = 1,
  maxScale = 10,
}: ImageZoomRotateProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const savedRotation = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = clampScale(savedScale.value * e.scale, minScale, maxScale);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const rotationGesture = Gesture.Rotation()
    .onUpdate((e) => {
      rotation.value = savedRotation.value + e.rotation;
    })
    .onEnd(() => {
      savedRotation.value = rotation.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value = withSpring(IDENTITY_TRANSFORM.scale);
      savedScale.value = IDENTITY_TRANSFORM.scale;
      rotation.value = withSpring(IDENTITY_TRANSFORM.rotation);
      savedRotation.value = IDENTITY_TRANSFORM.rotation;
    });

  const composed = Gesture.Simultaneous(pinchGesture, rotationGesture, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${rotation.value}rad` },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Reanimated.View style={[styles.container, animatedStyle]}>
        {children}
      </Reanimated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
