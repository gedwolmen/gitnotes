import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useStageStore } from '../../stores/stageStore';
import { useTheme } from '../../contexts/ThemeContext';
import { HapticService } from '../../utils/haptics';
import type { RootStackParamList } from '../../navigation/types';
import {
  STAGE_BUTTON_SIZE,
  STAGE_BUTTON_LONG_PRESS_MS,
} from './stageButtonGeometry';
import { useStageButtonPosition } from './useStageButtonPosition';
import { useStageButtonPanGesture } from './useStageButtonPanGesture';

interface FloatingStageButtonProps {
  readonly currentRouteName?: string;
}

export function FloatingStageButton({ currentRouteName }: FloatingStageButtonProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const pendingCount = useStageStore((s) => s.pendingCount);
  const globalPushing = useStageStore((s) => s.globalPushing);
  const isPushing = useStageStore((s) => s.isPushing);
  const position = useStageButtonPosition();

  const anyPushing = useMemo(
    () => globalPushing || Object.values(isPushing).some(Boolean),
    [globalPushing, isPushing],
  );

  const handleTap = useCallback(() => {
    HapticService.selection();
    navigation.navigate('Stage');
  }, [navigation]);

  const handleLongPress = useCallback(() => {
    if (anyPushing) return;
    HapticService.selection();
    useStageStore.getState().pushAll();
  }, [anyPushing]);

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
  ) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, animatedStyle]} pointerEvents="box-none">
      <GestureDetector gesture={panGesture}>
        <Pressable
          testID="floating-stage.button.navigate-stage"
          accessibilityRole="button"
          accessibilityLabel="View staged changes"
          accessibilityHint="Tap to view staged changes. Press and hold to push all staged changes."
          accessibilityState={{ disabled: anyPushing }}
          onPress={handleTap}
          onLongPress={handleLongPress}
          delayLongPress={STAGE_BUTTON_LONG_PRESS_MS}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary },
            pressed ? styles.pressed : null,
          ]}
        >
          {anyPushing ? (
            <ActivityIndicator
              testID="floating-stage.button.progress"
              size="small"
              color="#FFFFFF"
            />
          ) : (
            <Ionicons name="cloud-upload" size={24} color="#FFFFFF" />
          )}
        </Pressable>
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
