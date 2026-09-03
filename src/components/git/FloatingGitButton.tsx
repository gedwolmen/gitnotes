import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { Surface } from '@/components/ui/Surface';
import { Text } from '@/components/ui/text';
import GitButtonHalo from './GitButtonHalo';
import { GIT_BUTTON_SIZE } from './gitButtonGeometry';
import { useTheme } from '@/contexts/ThemeContext';
import { useRepoStore } from '@/stores/repoStore';
import type { AggregatedGitState } from '@/hooks/useAllReposStatus';
import { useFloatingGitButtonPosition } from './useFloatingGitButtonPosition';
import { useFloatingGitButtonPanGesture } from './useFloatingGitButtonPanGesture';
import { useFloatingGitButtonAffordances, PRESS_SCALE_FACTOR } from './useFloatingGitButtonAffordances';
import { useFloatingButtonCollision } from '../floatingButtonLayout';

interface FloatingGitButtonProps {
  aggregatedState?: AggregatedGitState;
  /** Informational tap — jumps to the Explore section with pending work. */
  onQuickTap?: () => void;
  /** Nothing pending anywhere: gray the button out and ignore taps. */
  disabled?: boolean;
  /** Name of the current top-level route — used to hide the button on full-screen modals. */
  currentRouteName?: string;
}

const HIDDEN_ROUTES = new Set<string>([
  'Paywall',
  'Onboarding',
  'NoteEditor',
  'CanvasEditor',
  'PdfViewer',
  'FileViewer',
  'ImageViewer',
  'VideoViewer',
  'ChatScreen',
  'ChatThreadList',
  'ConflictResolve',
  'Stage',
  'GraphView',
]);

/**
 * Floating git status button — purely informational (issue #1330):
 *   - Tap  → jump to the Explore section holding the pending work
 *            (changes / staging / commits / conflicts)
 *   - Drag → reposition; auto-snap to nearest edge; auto-avoid the AI button
 *   - Hold → nothing (no action menu — this is not a quick-action button)
 *
 * When nothing is pending (no uncommitted, staged, ahead, or conflicts) the
 * button is grayed out and ignores taps. Status hue ring priority:
 * red (conflicts) > blue (pending push) > green (pending changes).
 */
export default function FloatingGitButton({
  aggregatedState,
  onQuickTap,
  disabled = false,
  currentRouteName,
}: FloatingGitButtonProps) {
  const { colors } = useTheme();
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

  const { mode, totalUncommitted, totalStaged, totalAhead, anyConflicts } = state;
  const actionCount = totalUncommitted + totalStaged + totalAhead;

  const palette = (() => {
    if (disabled) return { bg: colors.surface, fg: colors.textSecondary };
    if (anyConflicts) return { bg: colors.error, fg: '#ffffff' };
    if (totalUncommitted > 0 || totalStaged > 0) return { bg: colors.success, fg: '#ffffff' };
    if (totalAhead > 0) return { bg: colors.primary, fg: '#ffffff' };
    return { bg: colors.surface, fg: colors.textSecondary };
  })();

  // Status hue ring: red (conflicts) > blue (pending push) > green (pending
  // changes). null when clean or disabled — no ring.
  const hueColor = (() => {
    if (disabled) return null;
    if (anyConflicts) return colors.error;
    if (totalAhead > 0) return colors.primary;
    if (totalUncommitted > 0 || totalStaged > 0) return colors.success;
    return null;
  })();

  const position = useFloatingGitButtonPosition();
  useFloatingButtonCollision('stage', {
    translateX: position.translateX,
    translateY: position.translateY,
    dragActive: position.dragActive,
    size: GIT_BUTTON_SIZE,
    geometry: position.geometry,
  });

  const affordances = useFloatingGitButtonAffordances({
    reduceMotionEnabled: false,
    reduceMotionResolved: true,
    menuOpen: false,
  });

  const panGesture = useFloatingGitButtonPanGesture(position, {
    closeMenu: () => undefined,
    setHorizontalDirection: () => undefined,
    setVerticalDirection: () => undefined,
    cancelAffordances: affordances.cancelAffordances,
  });

  const handleTap = useCallback(() => {
    if (disabled) return;
    onQuickTap?.();
  }, [disabled, onQuickTap]);

  const { translateX, translateY } = position;
  const { entranceProgress, pressProgress } = affordances;

  const containerStyle = useAnimatedStyle(() => ({
    opacity: entranceProgress.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: 1 - PRESS_SCALE_FACTOR * pressProgress.value },
    ],
  }));

  if (currentRouteName && HIDDEN_ROUTES.has(currentRouteName)) return null;
  if (repos.length === 0) return null;

  return (
    <Animated.View
      testID="gitbutton.root"
      pointerEvents="box-none"
      style={[styles.container, containerStyle]}
    >
      <GestureDetector gesture={panGesture}>
        <Animated.View
          testID="gitbutton.frame"
          style={[styles.buttonFrame, disabled ? styles.disabledFrame : null]}
        >
          <GitButtonHalo
            active={hueColor !== null}
            color={hueColor ?? undefined}
            testID="gitbutton.halo"
          />
          <Pressable
            testID="gitbutton.press"
            onPress={handleTap}
            onPressIn={affordances.handlePressIn}
            onPressOut={affordances.handlePressOut}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={
              disabled
                ? 'Git status: everything is committed and pushed'
                : anyConflicts
                  ? 'Git: conflicts need attention — tap to review'
                  : `Git: ${actionCount} pending ${actionCount === 1 ? 'item' : 'items'} — tap to review`
            }
            accessibilityState={{ disabled }}
          >
            <Surface
              elevation="raised"
              radius="pill"
              testID="gitbutton.surface"
              style={{
                backgroundColor: palette.bg,
                width: GIT_BUTTON_SIZE,
                height: GIT_BUTTON_SIZE,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons
                name={mode === 'conflicts' ? 'warning-outline' : 'git-pull-request-outline'}
                size={24}
                color={palette.fg}
                testID="gitbutton.icon"
              />
              {actionCount > 0 && (
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: GIT_BUTTON_SIZE,
    height: GIT_BUTTON_SIZE,
  },
  buttonFrame: {
    width: GIT_BUTTON_SIZE,
    height: GIT_BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledFrame: {
    opacity: 0.5,
  },
});
