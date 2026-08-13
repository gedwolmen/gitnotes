import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cancelAnimation,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

export const FLOATING_AI_BUTTON_LONG_PRESS_MS = 450;
export const PRESS_SCALE_FACTOR = 0.08;

const PRESS_SPRING = { mass: 0.6, damping: 16, stiffness: 480 } as const;
const ENTRANCE_SPRING = { mass: 0.9, damping: 14, stiffness: 240 } as const;
const HOLD_ABSORB_MS = 200;
const HOLD_DRAIN_MS = 150;
const TEASER_INITIAL_DELAY_MS = 900;
const TEASER_INTERVAL_MS = 2200;
const TEASER_PULSE_MS = 550;
const TEASER_PEAK = 0.3;
const TEASER_REPEAT_COUNT = 3;
const HUB_DISCOVERED_STORAGE_KEY = 'ai-hub-discovered';

export interface FloatingAIButtonAffordanceOptions {
  readonly reduceMotionEnabled: boolean;
  readonly reduceMotionResolved: boolean;
  readonly menuOpen: boolean;
}

export interface FloatingAIButtonAffordances {
  readonly entranceProgress: SharedValue<number>;
  readonly pressProgress: SharedValue<number>;
  readonly holdProgress: SharedValue<number>;
  readonly hintProgress: SharedValue<number>;
  readonly hubDiscovered: boolean;
  readonly discoveryChecked: boolean;
  readonly handlePressIn: () => void;
  readonly handlePressOut: () => void;
  readonly handleHoldComplete: () => void;
  readonly cancelAffordances: () => void;
  readonly markHubDiscovered: () => void;
}

export function useFloatingAIButtonAffordances(
  options: FloatingAIButtonAffordanceOptions,
): FloatingAIButtonAffordances {
  const { reduceMotionEnabled, reduceMotionResolved, menuOpen } = options;

  // Creation order is load-bearing: component tests reference these shared
  // values by creation index (entrance, press, hold, hint).
  const entranceProgress = useSharedValue(0);
  const pressProgress = useSharedValue(0);
  const holdProgress = useSharedValue(0);
  const hintProgress = useSharedValue(0);

  const holdCompletedRef = useRef(false);
  const entrancePlayedRef = useRef(false);
  const [hubDiscovered, setHubDiscovered] = useState(false);
  const [discoveryChecked, setDiscoveryChecked] = useState(false);

  useEffect(() => {
    let isMounted = true;

    AsyncStorage.getItem(HUB_DISCOVERED_STORAGE_KEY)
      .then((storedDiscoveryFlag) => {
        if (!isMounted) return;
        if (storedDiscoveryFlag === 'true') {
          setHubDiscovered(true);
        }
        setDiscoveryChecked(true);
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        console.warn('Failed to read AI hub discovery flag:', error);
        setDiscoveryChecked(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!reduceMotionResolved) return;

    if (reduceMotionEnabled) {
      cancelAnimation(entranceProgress);
      entranceProgress.value = 1;
      return;
    }

    if (entrancePlayedRef.current) return;
    entrancePlayedRef.current = true;
    entranceProgress.value = withSpring(1, ENTRANCE_SPRING);
  }, [reduceMotionEnabled, reduceMotionResolved, entranceProgress]);

  useEffect(() => {
    if (!discoveryChecked || hubDiscovered || reduceMotionEnabled || menuOpen) {
      return;
    }

    hintProgress.value = withDelay(
      TEASER_INITIAL_DELAY_MS,
      withRepeat(
        withSequence(
          withDelay(TEASER_INTERVAL_MS, withTiming(TEASER_PEAK, { duration: TEASER_PULSE_MS })),
          withTiming(0, { duration: TEASER_PULSE_MS }),
        ),
        TEASER_REPEAT_COUNT,
        false,
      ),
    );

    return () => {
      cancelAnimation(hintProgress);
      hintProgress.value = 0;
    };
  }, [discoveryChecked, hubDiscovered, reduceMotionEnabled, menuOpen, hintProgress]);

  useEffect(() => {
    return () => {
      cancelAnimation(entranceProgress);
      cancelAnimation(pressProgress);
      cancelAnimation(holdProgress);
      cancelAnimation(hintProgress);
    };
  }, [entranceProgress, pressProgress, holdProgress, hintProgress]);

  const handlePressIn = useCallback(() => {
    holdCompletedRef.current = false;
    pressProgress.value = withSpring(1, PRESS_SPRING);
    if (!reduceMotionEnabled) {
      holdProgress.value = withTiming(1, { duration: FLOATING_AI_BUTTON_LONG_PRESS_MS });
    }
  }, [reduceMotionEnabled, pressProgress, holdProgress]);

  const handlePressOut = useCallback(() => {
    pressProgress.value = withSpring(0, PRESS_SPRING);
    if (!holdCompletedRef.current) {
      holdProgress.value = withTiming(0, { duration: HOLD_DRAIN_MS });
    }
  }, [pressProgress, holdProgress]);

  const handleHoldComplete = useCallback(() => {
    holdCompletedRef.current = true;
    holdProgress.value = withTiming(0, { duration: HOLD_ABSORB_MS });
  }, [holdProgress]);

  const cancelAffordances = useCallback(() => {
    for (const affordanceProgress of [pressProgress, holdProgress, hintProgress]) {
      cancelAnimation(affordanceProgress);
      affordanceProgress.value = 0;
    }
  }, [pressProgress, holdProgress, hintProgress]);

  const markHubDiscovered = useCallback(() => {
    setHubDiscovered(true);
    AsyncStorage.setItem(HUB_DISCOVERED_STORAGE_KEY, 'true').catch((error: unknown) => {
      console.warn('Failed to persist AI hub discovery:', error);
    });
  }, []);

  return {
    entranceProgress,
    pressProgress,
    holdProgress,
    hintProgress,
    hubDiscovered,
    discoveryChecked,
    handlePressIn,
    handlePressOut,
    handleHoldComplete,
    cancelAffordances,
    markHubDiscovered,
  };
}
