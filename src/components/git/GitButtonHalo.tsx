import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { GIT_BUTTON_SIZE, HALO_COLOR, HALO_RING_SIZE } from './gitButtonGeometry';

interface GitButtonHaloProps {
  /** Whether the halo should pulse (true when the repo has unpushed commits). */
  active: boolean;
  /** Halo color (design token: tailwind blue-500 by default). */
  color?: string;
  testID?: string;
}

/**
 * Animated blue halo rendered around the floating git button when the active
 * repository has unpushed commits. Two concentric rings pulse on a repeating
 * reanimated clock (opacity + scale); toggling `active` fades the halo in/out
 * instead of unmounting it, so state transitions stay smooth.
 */
export default function GitButtonHalo({ active, color = HALO_COLOR, testID }: GitButtonHaloProps) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (active) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 0 }),
          withTiming(1, { duration: 1500 }),
        ),
        -1,
        false,
      );
    } else {
      pulse.value = withTiming(0, { duration: 240 });
    }
  }, [active, pulse]);

  const innerRingStyle = useAnimatedStyle(() => ({
    opacity: active ? interpolate(pulse.value, [0, 0.5, 1], [0.85, 0.35, 0.85]) : 0,
    transform: [{ scale: interpolate(pulse.value, [0, 0.5, 1], [0.94, 1.04, 0.94]) }],
  }));

  const outerRingStyle = useAnimatedStyle(() => ({
    opacity: active ? interpolate(pulse.value, [0, 0.5, 1], [0.35, 0.12, 0.35]) : 0,
    transform: [{ scale: interpolate(pulse.value, [0, 0.5, 1], [0.98, 1.12, 0.98]) }],
  }));

  return (
    <View
      pointerEvents="none"
      testID={testID}
      style={[StyleSheet.absoluteFill, styles.container]}
    >
      <Animated.View
        style={[
          styles.outerRing,
          { borderColor: color, shadowColor: color },
          outerRingStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.innerRing,
          { borderColor: color, shadowColor: color },
          innerRingStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerRing: {
    width: GIT_BUTTON_SIZE + 8,
    height: GIT_BUTTON_SIZE + 8,
    borderRadius: (GIT_BUTTON_SIZE + 8) / 2,
    borderWidth: 2.5,
    position: 'absolute',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 6,
  },
  outerRing: {
    width: HALO_RING_SIZE,
    height: HALO_RING_SIZE,
    borderRadius: HALO_RING_SIZE / 2,
    borderWidth: 1.5,
    position: 'absolute',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 3,
  },
});
