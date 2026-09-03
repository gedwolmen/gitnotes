import { useCallback, useEffect, useState } from 'react';
import {
  cancelAnimation,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

export const PRESS_SCALE_FACTOR = 0.08;
const PRESS_SPRING = { mass: 0.6, damping: 16, stiffness: 480 } as const;
const ENTRANCE_SPRING = { mass: 0.9, damping: 14, stiffness: 240 } as const;
const HOLD_DRAIN_MS = 150;

export interface FloatingGitButtonAffordanceOptions {
  readonly reduceMotionEnabled: boolean;
  readonly reduceMotionResolved: boolean;
  readonly menuOpen: boolean;
}

export interface FloatingGitButtonAffordances {
  readonly entranceProgress: SharedValue<number>;
  readonly pressProgress: SharedValue<number>;
  readonly holdProgress: SharedValue<number>;
  readonly handlePressIn: () => void;
  readonly handlePressOut: () => void;
  readonly handleHoldComplete: () => void;
  readonly cancelAffordances: () => void;
}

export function useFloatingGitButtonAffordances(
  options: FloatingGitButtonAffordanceOptions,
): FloatingGitButtonAffordances {
  const { reduceMotionEnabled, reduceMotionResolved, menuOpen } = options;

  const entranceProgress = useSharedValue(0);
  const pressProgress = useSharedValue(0);
  const holdProgress = useSharedValue(0);

  const [reduceMotionEnabledState, setReduceMotionEnabled] = useState(true);
  const [reduceMotionResolvedState, setReduceMotionResolved] = useState(false);

  useEffect(() => {
    if (!reduceMotionResolved) return;
    if (reduceMotionEnabled) {
      cancelAnimation(entranceProgress);
      entranceProgress.value = 1;
      return;
    }
    entranceProgress.value = withSpring(1, ENTRANCE_SPRING);
  }, [reduceMotionEnabled, reduceMotionResolved, entranceProgress]);

  useEffect(() => {
    return () => {
      cancelAnimation(entranceProgress);
      cancelAnimation(pressProgress);
      cancelAnimation(holdProgress);
    };
  }, [entranceProgress, pressProgress, holdProgress]);

  const handlePressIn = useCallback(() => {
    pressProgress.value = withSpring(1, PRESS_SPRING);
    if (!reduceMotionEnabledState) {
      holdProgress.value = withTiming(0, { duration: HOLD_DRAIN_MS });
    }
  }, [reduceMotionEnabledState, pressProgress, holdProgress]);

  const handlePressOut = useCallback(() => {
    pressProgress.value = withSpring(0, PRESS_SPRING);
  }, [pressProgress]);

  const handleHoldComplete = useCallback(() => {
    holdProgress.value = withTiming(0, { duration: HOLD_DRAIN_MS });
  }, [holdProgress]);

  const cancelAffordances = useCallback(() => {
    for (const shared of [pressProgress, holdProgress]) {
      cancelAnimation(shared);
      shared.value = 0;
    }
  }, [pressProgress, holdProgress]);

  return {
    entranceProgress,
    pressProgress,
    holdProgress,
    handlePressIn,
    handlePressOut,
    handleHoldComplete,
    cancelAffordances,
  };
}