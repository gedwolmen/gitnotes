import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
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

import { Surface } from '@/components/ui/Surface';
import { Text } from '@/components/ui/text';
import {
  GIT_BUTTON_BOTTOM_CLEARANCE,
  GIT_BUTTON_DRAG_MIN_DISTANCE,
  GIT_BUTTON_EDGE_CLEARANCE,
  GIT_BUTTON_PUSH_HOLD_MS,
  GIT_BUTTON_SIZE,
  GIT_BUTTON_STAGE_HOLD_MS,
  GIT_BUTTON_TOP_BOUND,
} from './gitButtonGeometry';
import { useTheme } from '@/contexts/ThemeContext';
import { useRepoStore } from '@/stores/repoStore';
import type { AggregatedGitState } from '@/hooks/useAllReposStatus';
import type { RootStackParamList } from '@/navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const TAP_MAX_MS = 100;
const PRESS_SPRING = { mass: 0.6, damping: 16, stiffness: 480 } as const;
const SNAP_SPRING = { mass: 1, damping: 18, stiffness: 180, overshootClamping: true } as const;

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

interface FloatingGitButtonProps {
  aggregatedState?: AggregatedGitState;
  onQuickTap?: () => void;
  onStageAll?: () => void | Promise<void>;
  onStageCommitPushAll?: () => void | Promise<void>;
}

/**
 * Floating git button for repo-aware screens.
 *
 * Visual model matches the floating AI button: a clean `Surface` pill with
 * `elevation="raised"` and `radius="pill"`, no decorative halo, no border,
 * 56pt diameter, white icon. The background color follows the aggregated
 * state across all repos (red=conflicts, green=changes, blue=push, muted=clean).
 *
 * Gestures (replaces the old single-stage 800ms hold):
 *   - tap (<100ms)  → onQuickTap (parent navigates to the latest-changed repo's tab)
 *   - hold 100ms    → onStageAll
 *   - hold 300ms    → onStageCommitPushAll
 *
 * Hold progress is communicated by the press scale animation (same approach
 * as the AI button). No external ring overlay.
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

  const [stageFired, setStageFired] = useState(false);
  const [pushFired, setPushFired] = useState(false);
  const [busy, setBusy] = useState(false);

  const pressScale = useSharedValue(1);
  const pressStartRef = useRef(0);
  const stageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const frame = useSafeAreaFrame();
  const insets = useSafeAreaInsets();
  const minX = GIT_BUTTON_EDGE_CLEARANCE;
  const maxX = frame.width - GIT_BUTTON_SIZE - GIT_BUTTON_EDGE_CLEARANCE;
  const minY = GIT_BUTTON_TOP_BOUND;
  const maxY = frame.height - GIT_BUTTON_SIZE - GIT_BUTTON_BOTTOM_CLEARANCE;

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
    pressScale.value = withSpring(0.92, PRESS_SPRING);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    clearTimers();
    stageTimerRef.current = setTimeout(() => runOnJS(fireStage)(), GIT_BUTTON_STAGE_HOLD_MS);
    pushTimerRef.current = setTimeout(() => runOnJS(firePush)(), GIT_BUTTON_PUSH_HOLD_MS);
  }, [pressScale, fireStage, firePush, clearTimers]);

  const cancelHold = useCallback(() => {
    if (pushFired) return;
    clearTimers();
    pressScale.value = withSpring(1, PRESS_SPRING);
  }, [pushFired, pressScale, clearTimers]);

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
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: pressScale.value },
    ],
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

  const accessibilityLabel = busy ? 'Git sync busy' : palette.label;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        testID="gitbutton.root"
        style={[styles.container, containerStyle]}
      >
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
        >
          <Surface
            elevation="raised"
            radius="pill"
            testID="gitbutton.surface"
            style={{ backgroundColor: palette.bg, width: GIT_BUTTON_SIZE, height: GIT_BUTTON_SIZE, alignItems: 'center', justifyContent: 'center' }}
          >
            {busy ? (
              <ActivityIndicator size="small" color={palette.fg} testID="gitbutton.spinner" />
            ) : (
              <Ionicons
                name={mode === 'conflicts' ? 'warning-outline' : 'git-pull-request-outline'}
                size={24}
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
                <Text className="text-[10px] font-bold text-foreground">
                  {actionCount > 99 ? '99+' : actionCount}
                </Text>
              </View>
            )}
          </Surface>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: GIT_BUTTON_SIZE,
    height: GIT_BUTTON_SIZE,
    zIndex: 30,
  },
});