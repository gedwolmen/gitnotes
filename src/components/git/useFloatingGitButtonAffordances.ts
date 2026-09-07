import { useCallback, useEffect, useRef, useState } from 'react';
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
/** Time for the hold ring to fill from 0→1 (1/3 ≈ 333ms, 2/3 ≈ 667ms). */
const HOLD_FILL_MS = 3000;
/** Threshold fractions for stage / commit / push segments. */
const STAGE_FRACTION = 1 / 3;   // 0.333…
const COMMIT_FRACTION = 2 / 3;   // 0.666…

export type ReleaseSegment = 'stage' | 'commit' | 'push';

export interface FloatingGitButtonAffordanceOptions {
  readonly reduceMotionEnabled: boolean;
  readonly reduceMotionResolved: boolean;
  readonly menuOpen: boolean;
  /** Called once on release with the highest segment reached. */
  readonly onReleaseSegment?: (segment: ReleaseSegment) => void;
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
  const { reduceMotionEnabled, reduceMotionResolved, menuOpen, onReleaseSegment } = options;

  const entranceProgress = useSharedValue(0);
  const pressProgress = useSharedValue(0);
  const holdProgress = useSharedValue(0);

  const [reduceMotionEnabledState, setReduceMotionEnabled] = useState(false);
  const [reduceMotionResolvedState, setReduceMotionResolved] = useState(false);

  // Guard against handlePressOut firing after a completed hold (double-fire).
  const holdCompletedRef = useRef(false);

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
    holdCompletedRef.current = false;
    pressProgress.value = withSpring(1, PRESS_SPRING);
    console.log('[DEBUG handlePressIn] starting hold animation, reduceMotionEnabledState =', reduceMotionEnabledState);
    if (!reduceMotionEnabledState) {
      holdProgress.value = withTiming(1, { duration: HOLD_FILL_MS });
    }
  }, [reduceMotionEnabledState, pressProgress, holdProgress]);

  const handlePressOut = useCallback(() => {
    pressProgress.value = withSpring(0, PRESS_SPRING);
    console.log('[DEBUG handlePressOut] holdProgress.value =', holdProgress.value, 'holdCompletedRef.current =', holdCompletedRef.current);
    if (holdCompletedRef.current) return;

    // Determine the highest segment reached at release time.
    const fraction = holdProgress.value;
    let segment: ReleaseSegment | null = null;
    if (fraction >= 0.95) {
      segment = 'push';
    } else if (fraction >= COMMIT_FRACTION) {
      segment = 'commit';
    } else if (fraction >= STAGE_FRACTION) {
      segment = 'stage';
    }
    // Short tap (< 1/3): no segment — the tap handler navigates instead.

    // Drain the ring.
    holdProgress.value = withTiming(0, { duration: HOLD_DRAIN_MS });

    if (segment && onReleaseSegment) {
      onReleaseSegment(segment);
    }
  }, [pressProgress, holdProgress, onReleaseSegment]);

  const handleHoldComplete = useCallback(() => {
    holdCompletedRef.current = true;
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