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

import ConflictRouteBanner from './ConflictRouteBanner';
import GitButtonHalo from './GitButtonHalo';
import GitErrorBanner from './GitErrorBanner';
import HoldToPushRing from './HoldToPushRing';
import UnpushedCommitsModal from './UnpushedCommitsModal';
import {
  GIT_BUTTON_BOTTOM_CLEARANCE,
  GIT_BUTTON_DRAG_MIN_DISTANCE,
  GIT_BUTTON_EDGE_CLEARANCE,
  GIT_BUTTON_HOLD_MS,
  GIT_BUTTON_SIZE,
  GIT_BUTTON_TOP_BOUND,
  HALO_COLOR,
  HALO_RING_SIZE,
  HOLD_RING_CANVAS_SIZE,
} from './gitButtonGeometry';
import { classifyPushError, rejectedPushFailure, type PushFailure } from './pushErrors';
import * as GitEngine from '@/services/git/engine/GitEngine';
import type { GitRepository } from '@/services/GitService';
import type { ManagedRepo } from '@/services/repos/RepoService';
import type { ConflictFile } from '@/services/git/engine/GitEngine';
import { useGitBusy } from '@/hooks/useGitBusy';
import { useGitRepoStatus } from '@/hooks/useGitRepoStatus';
import { useRepoStore } from '@/stores/repoStore';
import { Toast, ToastDescription, ToastTitle, useToast } from '@/components/ui/toast';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/contexts/ThemeContext';
import type { RootStackParamList } from '@/navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** Tap shorter than this (ms) counts as a tap (preview); longer is a hold. */
const TAP_MAX_MS = 280;
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
   * Repo to bind to. `undefined` resolves the active repo (first in the
   * store); `null` forces the button hidden. Hidden anyway when the repo is
   * missing from the store.
   */
  repoId?: string | null;
}

/**
 * Floating git button for repo-aware screens (todo 19).
 *
 * States: hidden (no active repo) → idle (subtle git icon) → blue halo
 * (unpushed commits, engine `ahead > 0`) → hold-to-push (ring fills over
 * GIT_BUTTON_HOLD_MS; completing the hold calls `GitEngine.push`) → busy
 * (greyed/disabled while any engine op holds the flock) → error banner +
 * toast (typed failure with Retry). Tap while haloed previews the unpushed
 * commits. Draggable; snaps to the nearest horizontal edge. No auto-push.
 */
export default function FloatingGitButton({ repoId }: FloatingGitButtonProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const navigation = useNavigation<NavigationProp>();
  const repos = useRepoStore((state) => state.repositories);

  const repo = useMemo(() => {
    if (repoId === null) return null;
    if (repoId) return repos.find((candidate: GitRepository) => candidate.id === repoId) ?? null;
    return repos[0] ?? null;
  }, [repoId, repos]);

  const repoPath = repo?.path ?? null;
  const { ahead, refresh: refreshStatus } = useGitRepoStatus(repo?.id ?? null, repoPath);
  const { busy: engineBusy } = useGitBusy(repoPath ?? '');

  const [pushing, setPushing] = useState(false);
  const [ringVisible, setRingVisible] = useState(false);
  const [failure, setFailure] = useState<PushFailure | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pendingConflicts, setPendingConflicts] = useState<ConflictFile[] | null>(null);

  const busy = engineBusy || pushing;
  const hasUnpushed = ahead > 0;
  const canPush = hasUnpushed && !busy;

  const ringProgress = useSharedValue(0);
  const holdTriggeredRef = useRef(false);
  const pressStartRef = useRef(0);
  const pushSeqRef = useRef(0);
  const progressSubRef = useRef<{ remove: () => void } | null>(null);

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
      progressSubRef.current?.remove();
    },
    [],
  );

  const showToast = useCallback(
    (action: 'success' | 'error', title: string, description: string) => {
      toast.show({
        placement: 'top',
        duration: 4200,
        render: ({ id }: { id: string }) => (
          <Toast action={action} nativeID={`gitbutton-toast-${id}`}>
            <ToastTitle>{title}</ToastTitle>
            <ToastDescription>{description}</ToastDescription>
          </Toast>
        ),
      });
    },
    [toast],
  );

  const startPush = useCallback(async () => {
    if (!repo) return;
    const seq = ++pushSeqRef.current;
    setPushing(true);
    setRingVisible(true);
    setFailure(null);
    setPendingConflicts(null);

    progressSubRef.current?.remove();
    progressSubRef.current = GitEngine.addEngineProgressListener((event) => {
      if (event.kind !== 'Push') return;
      const fraction =
        event.total > 0
          ? Math.min(1, event.received / event.total)
          : Math.min(1, Math.max(0, event.percent / 100));
      // Push transfer progress only moves forward.
      if (fraction > ringProgress.value) ringProgress.value = fraction;
    });

    try {
      const result = await GitEngine.pushWithIntegrate(repo.path, 'origin', repo.id);
      if (result.kind === 'Conflicts') {
        setPendingConflicts(result.conflicts.map((c: { path: string }) => ({ path: c.path, status: 'conflict' })));
        showToast('error', 'Merge conflicts', 'The push diverged; resolve the conflicts.');
        await refreshStatus();
      } else if (result.pushed) {
        await refreshStatus();
        showToast(
          'success',
          result.integrated ? 'Pushed with integration' : 'Pushed',
          result.message,
        );
      } else {
        const rejection = rejectedPushFailure(result.message);
        setFailure(rejection);
        showToast('error', rejection.label, rejection.message);
      }
    } catch (error) {
      const classified = classifyPushError(error);
      setFailure(classified);
      showToast('error', classified.label, classified.message);
    } finally {
      progressSubRef.current?.remove();
      progressSubRef.current = null;
      if (pushSeqRef.current === seq) {
        setPushing(false);
        holdTriggeredRef.current = false;
        ringProgress.value = withTiming(0, { duration: 250 });
        setTimeout(() => {
          if (pushSeqRef.current === seq) setRingVisible(false);
        }, 280);
      }
    }
  }, [repo, refreshStatus, ringProgress, showToast]);

  const completeHold = useCallback(() => {
    holdTriggeredRef.current = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    void startPush();
  }, [startPush]);

  const startHold = useCallback(() => {
    if (!canPush) return;
    holdTriggeredRef.current = false;
    pressStartRef.current = Date.now();
    setFailure(null);
    setRingVisible(true);
    ringProgress.value = 0;
    ringProgress.value = withTiming(
      1,
      { duration: GIT_BUTTON_HOLD_MS, easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(completeHold)();
      },
    );
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, [canPush, completeHold, ringProgress]);

  const cancelHold = useCallback(() => {
    if (holdTriggeredRef.current || pushing) return;
    ringProgress.value = withTiming(0, { duration: 160, easing: Easing.out(Easing.cubic) });
    const seq = pushSeqRef.current;
    setTimeout(() => {
      if (pushSeqRef.current === seq && !holdTriggeredRef.current) setRingVisible(false);
    }, 180);
  }, [pushing, ringProgress]);

  const handleTap = useCallback(() => {
    const pressStart = pressStartRef.current;
    pressStartRef.current = 0;
    if (holdTriggeredRef.current) return;
    const elapsed = pressStart > 0 ? Date.now() - pressStart : 0;
    if (elapsed > TAP_MAX_MS) return;
    if (!hasUnpushed || busy) return;
    setPreviewOpen(true);
  }, [busy, hasUnpushed]);

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

  const accessibilityLabel = busy
    ? 'Git sync busy'
    : hasUnpushed
      ? `${ahead} unpushed commit${ahead === 1 ? '' : 's'}. Hold to push, tap to preview.`
      : 'Git: branch up to date';

  return (
    <>
      <GestureDetector gesture={panGesture}>
        <Animated.View
          testID="gitbutton.root"
          style={[styles.container, { width: CONTAINER_SIZE, height: CONTAINER_SIZE }, containerStyle]}
        >
          <View style={styles.buttonFrame}>
            <GitButtonHalo active={hasUnpushed && !busy} testID="gitbutton.halo" />
            <HoldToPushRing
              progress={ringProgress}
              visible={ringVisible}
              color={HALO_COLOR}
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
              className={`items-center justify-center rounded-full border-2 shadow-lg ${
                busy
                  ? 'border-border bg-muted'
                  : hasUnpushed
                    ? 'border-primary bg-primary'
                    : 'border-border bg-popover'
              }`}
              style={({ pressed }) => [
                { width: GIT_BUTTON_SIZE, height: GIT_BUTTON_SIZE },
                { transform: [{ scale: pressed && canPush ? 0.94 : 1 }] },
              ]}
            >
              {busy ? (
                <ActivityIndicator
                  size="small"
                  color={colors.textSecondary}
                  testID="gitbutton.spinner"
                />
              ) : (
                <Ionicons
                  name={hasUnpushed ? 'cloud-upload' : 'git-commit-outline'}
                  size={24}
                  color={hasUnpushed ? '#ffffff' : colors.textSecondary}
                />
              )}
              {hasUnpushed && !busy && (
                <View
                  testID="gitbutton.badge"
                  pointerEvents="none"
                  className="absolute -right-1 -top-1 min-w-[20px] items-center justify-center rounded-full border-2 border-popover bg-blue-500 px-1 py-0.5"
                >
                  <Text className="text-[10px] font-bold leading-[12px] text-white">
                    {ahead > 99 ? '99+' : ahead}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>
        </Animated.View>
      </GestureDetector>

      {pendingConflicts && !pushing && (
        <View style={[styles.bannerAnchor, { top: insets.top + 8 }]}>
          <ConflictRouteBanner
            fileCount={pendingConflicts.length}
            onResolve={() => {
              navigation.navigate('ExploreConflict', { repoId: repo.id });
              setPendingConflicts(null);
            }}
            onDismiss={() => setPendingConflicts(null)}
          />
        </View>
      )}

      {failure && !pushing && (
        <View style={[styles.bannerAnchor, { top: insets.top + 8 }]}>
          <GitErrorBanner
            failure={failure}
            retrying={pushing}
            onRetry={() => void startPush()}
            onDismiss={() => setFailure(null)}
          />
        </View>
      )}

      <UnpushedCommitsModal
        repo={repo as any}
        ahead={ahead}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}

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
  bannerAnchor: {
    position: 'absolute',
    left: GIT_BUTTON_EDGE_CLEARANCE,
    right: GIT_BUTTON_EDGE_CLEARANCE,
    alignItems: 'center',
    zIndex: 31,
  },
});
