import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useStageStore } from '../../stores/stageStore';
import { useConflictStore } from '../../stores/conflictStore';
import { drainPushQueue } from '../../services/StagePushScheduler';
import { useTheme } from '../../contexts/ThemeContext';
import { HapticService } from '../../utils/haptics';
import type { RootStackParamList } from '../../navigation/types';
import { useFloatingButtonCollision } from '../floatingButtonLayout';
import { HoldProgressRing } from '../ui/HoldProgressRing';
import { STAGE_BUTTON_SIZE } from './stageButtonGeometry';
import { useStageButtonPosition } from './useStageButtonPosition';
import { useStageButtonPanGesture } from './useStageButtonPanGesture';
import {
  FLOATING_AI_BUTTON_LONG_PRESS_MS,
  PRESS_SCALE_FACTOR,
  useFloatingAIButtonAffordances,
} from '../ai/useFloatingAIButtonAffordances';

interface FloatingStageButtonProps {
  readonly currentRouteName?: string;
}

export function FloatingStageButton({ currentRouteName }: FloatingStageButtonProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const pendingCount = useStageStore((s) => s.pendingCount);
  const globalPushing = useStageStore((s) => s.globalPushing);
  const isPushing = useStageStore((s) => s.isPushing);
  const totalUnresolved = useConflictStore((s) => s.totalUnresolvedFiles());
  const hasConflicts = totalUnresolved > 0;
  const position = useStageButtonPosition();

  // Ensure conflict store is loaded before first render — checkOnboarding fires
  // loadConflicts() without await, so the button may mount before it completes.
  useEffect(() => {
    void useConflictStore.getState().loadConflicts();
  }, []);

  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(true);
  const [reduceMotionResolved, setReduceMotionResolved] = useState(false);

  useFloatingButtonCollision('stage', {
    translateX: position.translateX,
    translateY: position.translateY,
    dragActive: position.dragActive,
    size: STAGE_BUTTON_SIZE,
    geometry: position.geometry,
  });

  const affordances = useFloatingAIButtonAffordances({
    reduceMotionEnabled,
    reduceMotionResolved,
    menuOpen: false,
  });

  const anyPushing = useMemo(
    () => globalPushing || Object.values(isPushing).some(Boolean),
    [globalPushing, isPushing],
  );

  const storePushProgress = useStageStore((s) => s.pushProgress);
  const ringProgress = useSharedValue(0);

  useEffect(() => {
    if (!anyPushing) {
      ringProgress.value = 0;
    } else if (storePushProgress !== null) {
      ringProgress.value = storePushProgress;
    } else {
      // Total unknown (e.g. clone push before transport progress lands):
      // show a small arc so the ring reads "working", not "almost done".
      ringProgress.value = 0.15;
    }
  }, [anyPushing, storePushProgress, ringProgress]);

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

  const triggerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: 1 - PRESS_SCALE_FACTOR * affordances.pressProgress.value,
      },
    ],
  }));

  const handleTap = useCallback(() => {
    HapticService.selection();
    if (hasConflicts) {
      navigation.navigate('Conflicts');
    } else {
      navigation.navigate('Stage');
    }
  }, [navigation, hasConflicts]);

  const handleLongPress = useCallback(() => {
    if (anyPushing) return;
    affordances.handleHoldComplete();
    HapticService.selection();
    useStageStore.getState().pushAll();
    void drainPushQueue('manual');
  }, [affordances, anyPushing]);

  const panGesture = useStageButtonPanGesture(position);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: position.translateX.value },
      { translateY: position.translateY.value },
    ],
  }));

  if (
    pendingCount === 0
    || currentRouteName === 'ChatThreadList'
    || currentRouteName === 'ChatScreen'
    || currentRouteName === 'Paywall'
  ) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, animatedStyle]} pointerEvents="box-none">
      <HoldProgressRing
        progress={anyPushing ? ringProgress : affordances.holdProgress}
        size={STAGE_BUTTON_SIZE}
        color={colors.primary}
        reduceMotionEnabled={reduceMotionEnabled}
      />
      <GestureDetector gesture={panGesture}>
        <Animated.View style={triggerAnimatedStyle}>
          <Pressable
            testID="floating-stage.button.navigate-stage"
            accessibilityRole="button"
            accessibilityLabel={hasConflicts ? 'Resolve conflicts' : 'View staged changes'}
            accessibilityHint={hasConflicts ? 'Tap to resolve merge conflicts.' : 'Tap to view staged changes. Press and hold to push all staged changes.'}
            accessibilityState={{ busy: anyPushing }}
            onPress={handleTap}
            onLongPress={handleLongPress}
            onPressIn={affordances.handlePressIn}
            onPressOut={affordances.handlePressOut}
            delayLongPress={FLOATING_AI_BUTTON_LONG_PRESS_MS}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: hasConflicts ? colors.error : anyPushing ? colors.border : colors.primary },
              pressed ? styles.pressed : null,
            ]}
          >
            <Ionicons name={hasConflicts ? 'git-merge' : 'cloud-upload'} size={24} color={hasConflicts ? '#FFFFFF' : anyPushing ? colors.textSecondary : '#FFFFFF'} />
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 9999,
    width: STAGE_BUTTON_SIZE,
    height: STAGE_BUTTON_SIZE,
  },
  button: {
    width: STAGE_BUTTON_SIZE,
    height: STAGE_BUTTON_SIZE,
    borderRadius: STAGE_BUTTON_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
});
