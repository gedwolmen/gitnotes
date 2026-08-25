import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { HapticService } from '../../utils/haptics';
import type { RootStackParamList } from '../../navigation/types';
import { useRepoStore } from '../../stores/repoStore';
import { useGitActivityStore } from '../../stores/gitActivityStore';
import { LastUsedRepoService } from '../../services/LastUsedRepoService';
import { UnpushedCommitsService } from '../../services/git/UnpushedCommitsService';
import { LocalGitWriter } from '../../services/git/LocalGitWriter';
import { AuthService } from '../../services/AuthService';
import { pullFromSingleRepo } from '../../services/RepoPullService';
import {
  FLOATING_AI_BUTTON_LONG_PRESS_MS,
  useFloatingAIButtonAffordances,
} from '../ai/useFloatingAIButtonAffordances';
import { HoldProgressRing } from '../ui/HoldProgressRing';
import { useTabBarHeight } from '../ui/TabBar';
import { STAGE_BUTTON_SIZE } from './stageButtonGeometry';

const BUTTON_SIZE = STAGE_BUTTON_SIZE;
const BADGE_SIZE = 20;
const EDGE_INSET = 16;
const POSITION_SPRING = {
  mass: 1,
  damping: 15,
  stiffness: 120,
  overshootClamping: true,
} as const;

interface FloatingPushButtonProps {
  readonly currentRouteName?: string;
}

export function FloatingPushButton({ currentRouteName }: FloatingPushButtonProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const repositories = useRepoStore((s) => s.repositories);

  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(true);
  const [reduceMotionResolved, setReduceMotionResolved] = useState(false);
  const [activeRepoPath, setActiveRepoPath] = useState<string | null>(null);
  const [activeBranch, setActiveBranch] = useState<string>('main');
  const [unpushedCount, setUnpushedCount] = useState(0);
  const [isPushing, setIsPushing] = useState(false);
  const commitRevision = useGitActivityStore((s) => s.commitRevision);

  useEffect(() => {
    let isMounted = true;

    const resolve = async () => {
      const lastUsed = await LastUsedRepoService.get();
      if (!isMounted) return;

      const targetPath = lastUsed ?? repositories[0]?.path ?? null;
      if (!targetPath) return;

      const repo = repositories.find((r) => r.path === targetPath);
      if (!isMounted) return;

      if (!repo) {
        setActiveRepoPath(null);
        setActiveBranch('main');
        return;
      }

      setActiveRepoPath(targetPath);
      setActiveBranch(repo?.branch ?? 'main');
    };

    void resolve();
  }, [repositories]);

  useEffect(() => {
    if (!activeRepoPath) {
      setUnpushedCount(0);
      return;
    }
    let isMounted = true;

    const load = async () => {
      try {
        const count = await UnpushedCommitsService.count({
          repo: activeRepoPath,
          branch: activeBranch,
        });
        if (isMounted) setUnpushedCount(count);
      } catch {
        if (isMounted) setUnpushedCount(0);
      }
    };

    void load();
    const interval = setInterval(() => void load(), 30_000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeRepoPath, activeBranch, commitRevision]);

  const defaultX = viewportWidth - BUTTON_SIZE - insets.right - EDGE_INSET;
  const safeBottom = viewportHeight - Math.max(tabBarHeight, insets.bottom + EDGE_INSET);
  const defaultY = safeBottom - BUTTON_SIZE - 8;

  const translateX = useSharedValue(defaultX);
  const translateY = useSharedValue(defaultY);
  const savedTranslateX = useSharedValue(defaultX);
  const savedTranslateY = useSharedValue(defaultY);
  const dragActive = useSharedValue(false);

  useEffect(() => {
    const clampedX = Math.max(
      insets.left + EDGE_INSET,
      Math.min(viewportWidth - BUTTON_SIZE - insets.right - EDGE_INSET, savedTranslateX.value),
    );
    const clampedY = Math.max(
      insets.top + EDGE_INSET,
      Math.min(safeBottom - BUTTON_SIZE, savedTranslateY.value),
    );
    if (clampedX !== translateX.value || clampedY !== translateY.value) {
      translateX.value = withSpring(clampedX, POSITION_SPRING);
      translateY.value = withSpring(clampedY, POSITION_SPRING);
      savedTranslateX.value = clampedX;
      savedTranslateY.value = clampedY;
    }
  }, [
    viewportWidth,
    viewportHeight,
    insets,
    safeBottom,
    translateX,
    translateY,
    savedTranslateX,
    savedTranslateY,
  ]);

  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!isMounted) return;
      setReduceMotionEnabled(enabled);
      setReduceMotionResolved(true);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => {
        setReduceMotionEnabled(enabled);
        setReduceMotionResolved(true);
      },
    );

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  const affordances = useFloatingAIButtonAffordances({
    reduceMotionEnabled,
    reduceMotionResolved,
    menuOpen: false,
  });

  const navigateToPush = useCallback(() => {
    if (!activeRepoPath) return;
    navigation.navigate('Push', { repoPath: activeRepoPath, branch: activeBranch });
  }, [navigation, activeRepoPath, activeBranch]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          dragActive.value = true;
        })
        .onUpdate((event) => {
          translateX.value = savedTranslateX.value + event.translationX;
          translateY.value = savedTranslateY.value + event.translationY;
        })
        .onEnd(() => {
          const clampedX = Math.max(
            insets.left + EDGE_INSET,
            Math.min(viewportWidth - BUTTON_SIZE - insets.right - EDGE_INSET, translateX.value),
          );
          const clampedY = Math.max(
            insets.top + EDGE_INSET,
            Math.min(safeBottom - BUTTON_SIZE, translateY.value),
          );
          translateX.value = withSpring(clampedX, POSITION_SPRING);
          translateY.value = withSpring(clampedY, POSITION_SPRING);
          savedTranslateX.value = clampedX;
          savedTranslateY.value = clampedY;
        })
        .onFinalize(() => {
          dragActive.value = false;
        }),
    [
      dragActive,
      translateX,
      translateY,
      savedTranslateX,
      savedTranslateY,
      viewportWidth,
      viewportHeight,
      insets,
      safeBottom,
    ],
  );

  const triggerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: 1 - 0.08 * affordances.pressProgress.value,
      },
    ],
  }));

  const handleTap = useCallback(() => {
    HapticService.selection();
    navigateToPush();
  }, [navigateToPush]);

  const handleLongPress = useCallback(async () => {
    affordances.handleHoldComplete();
    HapticService.selection();
    if (isPushing || !activeRepoPath) return;
    setIsPushing(true);
    try {
      const token = (await AuthService.getToken()) ?? undefined;
      const pushPromise = LocalGitWriter.push({
        repoPath: activeRepoPath,
        branch: activeBranch,
        token,
      });
      const timeoutMs = 60_000;
      const timeoutPromise = new Promise<{ success: false; error: string }>((_, reject) =>
        setTimeout(() => reject(new Error('Push timed out after 60s. Pull and try again.')), timeoutMs),
      );
      const result = await Promise.race([pushPromise, timeoutPromise]);
      if (result.success) {
        await pullFromSingleRepo(activeRepoPath);
        useGitActivityStore.getState().incrementRevision();
        Alert.alert('Pushed', 'All commits have been pushed to GitHub.');
      } else {
        const error = result.error ?? 'Unknown error';
        if (error.includes('conflict-detected')) {
          navigation.navigate('Conflicts', { repoPath: activeRepoPath, branch: activeBranch });
        } else {
          Alert.alert('Push failed', error);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('60s')) {
        Alert.alert('Push timed out', 'Push timed out after 60s. Pull and try again.');
      } else {
        Alert.alert('Push failed', message);
      }
    } finally {
      setIsPushing(false);
    }
  }, [affordances, isPushing, activeRepoPath, activeBranch, navigation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  if (
    unpushedCount === 0
    || currentRouteName === 'ChatThreadList'
    || currentRouteName === 'ChatScreen'
    || currentRouteName === 'Paywall'
    || currentRouteName === 'Push'
  ) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, animatedStyle]} pointerEvents="box-none">
      <HoldProgressRing
        progress={affordances.holdProgress}
        size={BUTTON_SIZE}
        color={colors.primary}
        reduceMotionEnabled={reduceMotionEnabled}
      />
      <GestureDetector gesture={panGesture}>
        <Animated.View style={triggerAnimatedStyle}>
          <Pressable
            testID="floating-push.button.navigate-push"
            accessibilityRole="button"
            accessibilityLabel={`Push ${unpushedCount} commits`}
            accessibilityHint="Tap to view unpushed commits. Press and hold to push them now."
            accessibilityState={{ busy: isPushing }}
            onPress={handleTap}
            onLongPress={handleLongPress}
            onPressIn={affordances.handlePressIn}
            onPressOut={affordances.handlePressOut}
            delayLongPress={FLOATING_AI_BUTTON_LONG_PRESS_MS}
            disabled={isPushing}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: isPushing ? colors.border : colors.primary },
              pressed && !isPushing ? styles.pressed : null,
            ]}
          >
            <Ionicons name="cloud-upload" size={24} color="#FFFFFF" />
          </Pressable>
          {unpushedCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.error }]}>
              <Text style={styles.badgeText}>
                {unpushedCount > 99 ? '99+' : unpushedCount}
              </Text>
            </View>
          ) : null}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 9999,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
