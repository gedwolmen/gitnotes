import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import GitButtonHalo from './GitButtonHalo';
import HoldToPushRing from './HoldToPushRing';
import {
  GIT_BUTTON_BOTTOM_CLEARANCE,
  GIT_BUTTON_DRAG_MIN_DISTANCE,
  GIT_BUTTON_EDGE_CLEARANCE,
  GIT_BUTTON_PUSH_HOLD_MS,
  GIT_BUTTON_SIZE,
  GIT_BUTTON_STAGE_HOLD_MS,
  GIT_BUTTON_TOP_BOUND,
  HALO_RING_SIZE,
  HOLD_RING_CANVAS_SIZE,
} from './gitButtonGeometry';
import { useTheme } from '@/contexts/ThemeContext';
import { useRepoStore } from '@/stores/repoStore';
import type { AggregatedGitState } from '@/hooks/useAllReposStatus';
import type { RootStackParamList } from '@/navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** Below this duration, a press is a tap (no hold). */
const TAP_MAX_MS = 100;
/** Container hosts halo + ring + button; sized for the largest decoration. */
const CONTAINER_SIZE = Math.max(HOLD_RING_CANVAS_SIZE, HALO_RING_SIZE);
const INNER_OFFSET = (CONTAINER_SIZE - GIT_BUTTON_SIZE) / 2;
const SNAP_SPRING = { mass: 1, damping: 18, stiffness: 180, overshootClamping: true } as const;

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

interface FloatingGitButtonProps {
  /**
   * Aggregated per-repo state from `useAllReposStatus`. Drives the color
   * (conflicts=red, changes=green, push=blue, clean=muted) and the badge
   * count. If omitted, the button degrades to a plain tap target.
   */
  aggregatedState?: AggregatedGitState;
  /** Short tap (<100ms). Use for smart navigation. */
  onQuickTap?: () => void;
  /** Fired once when the press reaches 100ms. Should stage everything pending. */
  onStageAll?: () => void | Promise<void>;
  /** Fired once when the press reaches 300ms. Should commit + push everything. */
  onStageCommitPushAll?: () => void | Promise<void>;
}

/**
 * Floating git button for repo-aware screens.
 *
 * Color reflects the aggregated state across all repos:
 *   - red    → anyConflicts (button is warning-level, hold still works)
 *   - green  → uncommitted or staged somewhere, no conflicts
 *   - blue   → only ahead > 0, no changes
 *   - muted  → everything clean
 *
 * Gestures (replaces the old single-stage 800ms hold):
 *   - tap (<100ms)  → onQuickTap (parent navigates to the latest-changed repo's tab)
 *   - hold 100ms    → onStageAll
 *   - hold 300ms    → onStageCommitPushAll
 *
 * The progress ring fills over the full 300ms so the user can see the
 * trigger coming. Draggable, edge-snapping; no auto-push.
 */
export default function FloatingGitButton({
  aggregatedState,
  onQuickTap,
  onStageAll,
  onStageCommitPushAll,
}: FloatingGitButtonProps) {
  const { colors } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const repos = useRepoStore((state) => state.repositories);

  const state: AggregatedGitState = aggregatedState ?? {
    perRepo: new Map(),
    totalUncommitted: 0,
    totalStaged: 0,
    totalAhead: 0,
    anyConflicts: false,
    anyBusy: false,
    latestChangedRepoId: null,
    mode: 'clean',
    refresh: async () => undefined,
  };

  const repo = useMemo(() => repos[0] ?? null, [repos]);

  const [ringVisible, setRingVisible] = useState(false);
  const [stageFired, setStageFired] = useState(false);
  const [pushFired, setPushFired] = useState(false);
  const [busy, setBusy] = useState(false);

  const ringProgress = useSharedValue(0);
  const pressStartRef = useRef(0);
  const stageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const frame = useSafeAreaFrame();
  const insets = useSafeAreaInsets();
  const minX = GIT_BUTTON_EDGE_CLEARANCE - INNER_OFFSET;
  const maxX = frame.width - GIT_BUTTON_SIZE - GIT_BUTTON_EDGE_CLEARANCE - INNER_OFFSET;
  const minY = GIT_BUTTON_TOP_BOUND - INNER_OFFSET;
  const maxY = frame.height - GIT_BUTTON_SIZE - GIT_BUTTON_BOTTOM_CLEARANCE - INNER_OFFSET;

  const translateX = useSharedValue(maxX);
  const translateY = useSharedValue(maxY);
  const dragStartX = useSharedValue(maxX);
  const dragStartY = useSharedValue(maxY);

  useEffect(
    () => () => {
      if (stageTimerRef.current) clearTimeout(stageTimerRef.current);
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    },
    [],
  );

  const clearTimers = useCallback(() => {
    if (stageTimerRef.current) {
      clearTimeout(stageTimerRef.current);
      stageTimerRef.current = null;
    }
    if (pushTimerRef.current) {
      clearTimeout(pushTimerRef.current);
      pushTimerRef.current = null;
    }
  }, []);

  const fireStage = useCallback(() => {
    if (stageFired || pushFired) return;
    setStageFired(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    void onStageAll?.();
  }, [stageFired, pushFired, onStageAll]);

  const firePush = useCallback(() => {
    if (pushFired) return;
    setPushFired(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setBusy(true);
    void Promise.resolve(onStageCommitPushAll?.()).finally(() => {
      setBusy(false);
    });
  }, [pushFired, onStageCommitPushAll]);

  const startHold = useCallback(() => {
    setStageFired(false);
    setPushFired(false);
    pressStartRef.current = Date.now();
    setRingVisible(true);
    ringProgress.value = 0;
    ringProgress.value = withTiming(
      1,
      { duration: GIT_BUTTON_PUSH_HOLD_MS, easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(clearTimers)();
      },
    );
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    clearTimers();
    stageTimerRef.current = setTimeout(() => runOnJS(fireStage)(), GIT_BUTTON_STAGE_HOLD_MS);
    pushTimerRef.current = setTimeout(() => runOnJS(firePush)(), GIT_BUTTON_PUSH_HOLD_MS);
  }, [ringProgress, fireStage, firePush, clearTimers]);

  const cancelHold = useCallback(() => {
    if (pushFired) return;
    clearTimers();
    ringProgress.value = withTiming(0, { duration: 160, easing: Easing.out(Easing.cubic) });
    const seq = pressStartRef.current;
    setTimeout(() => {
      if (pressStartRef.current === seq && !pushFired) setRingVisible(false);
    }, 180);
  }, [pushFired, ringProgress, clearTimers]);

  const handleTap = useCallback(() => {
    if (pushFired || stageFired) {
      setStageFired(false);
      setPushFired(false);
      return;
    }
    const elapsed = pressStartRef.current > 0 ? Date.now() - pressStartRef.current : 0;
    pressStartRef.current = 0;
    if (elapsed > TAP_MAX_MS) return;
    onQuickTap?.();
  }, [stageFired, pushFired, onQuickTap]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(GIT_BUTTON_DRAG_MIN_DISTANCE)
        .onStart(() => {
          dragStartX.value = translateX.value;
          dragStartY.value = translateY.value;
        })
        .onUpdate((event) => {
          translateX.value = clamp(dragStartX.value + event.translationX, minX, maxX);
          translateY.value = clamp(dragStartY.value + event.translationY, minY, maxY);
        })
        .onEnd(() => {
          const snapLeft =
            Math.abs(translateX.value - minX) <= Math.abs(maxX - translateX.value);
          translateX.value = withSpring(snapLeft ? minX : maxX, SNAP_SPRING);
          translateY.value = withSpring(clamp(translateY.value, minY, maxY), SNAP_SPRING);
        }),
    [dragStartX, dragStartY, maxX, maxY, minX, minY, translateX, translateY],
  );

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  if (!repo) return null;

  const { mode, totalUncommitted, totalStaged, totalAhead, anyConflicts } = state;
  const actionCount = totalUncommitted + totalStaged + totalAhead;
  const hasAny = actionCount > 0 || anyConflicts;

  const palette = (() => {
    if (anyConflicts) {
      return { bg: colors.error, fg: '#ffffff', label: 'Conflicts — open the resolver' };
    }
    if (totalUncommitted > 0 || totalStaged > 0) {
      return { bg: colors.success, fg: '#ffffff', label: `${actionCount} change${actionCount === 1 ? '' : 's'} pending — hold 100ms to stage, 300ms to commit + push` };
    }
    if (totalAhead > 0) {
      return { bg: colors.primary, fg: '#ffffff', label: `${totalAhead} unpushed commit${totalAhead === 1 ? '' : 's'} — hold 300ms to commit + push` };
    }
    return { bg: colors.surface, fg: colors.textSecondary, label: 'Git: branch up to date — tap to preview' };
  })();

  const accessibilityLabel = busy
    ? 'Git sync busy'
    : palette.label;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        testID="gitbutton.root"
        style={[styles.container, { width: CONTAINER_SIZE, height: CONTAINER_SIZE }, containerStyle]}
      >
        <View style={styles.buttonFrame}>
          <GitButtonHalo active={hasAny && !busy} color={palette.bg} testID="gitbutton.halo" />
          <HoldToPushRing
            progress={ringProgress}
            visible={ringVisible}
            color={palette.bg}
            testID="gitbutton.ring"
          />
          <Pressable
            testID="gitbutton.press"
            onPressIn={startHold}
            onPressOut={cancelHold}
            onPress={handleTap}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ disabled: busy }}
            accessibilityHint="Tap to jump to the latest changed repo. Hold 100ms to stage everything. Hold 300ms to commit and push."
            style={({ pressed }) => [
              { width: GIT_BUTTON_SIZE, height: GIT_BUTTON_SIZE, backgroundColor: palette.bg, borderColor: palette.bg },
              { transform: [{ scale: pressed && !busy ? 0.94 : 1 }] },
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={palette.fg} testID="gitbutton.spinner" />
            ) : (
              <Ionicons
                name={mode === 'conflicts' ? 'warning-outline' : 'git-pull-request-outline'}
                size={26}
                color={palette.fg}
                testID="gitbutton.icon"
              />
            )}
            {hasAny && !busy && (
              <View
                testID="gitbutton.badge"
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  right: -4,
                  top: -4,
                  minWidth: 20,
                  paddingHorizontal: 4,
                  paddingVertical: 1,
                  borderRadius: 10,
                  borderWidth: 2,
                  borderColor: colors.background,
                  backgroundColor: colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text>{`${actionCount > 99 ? '99+' : actionCount}`}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

import { Text } from '@/components/ui/text';

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  buttonFrame: {
    width: GIT_BUTTON_SIZE,
    height: GIT_BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});