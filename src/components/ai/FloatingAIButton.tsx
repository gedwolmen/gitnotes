import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAIStore } from '../../stores/aiStore';
import { useAIHubStore } from '../../stores/aiHubStore';
import { useTheme } from '../../contexts/ThemeContext';
import { HapticService } from '../../utils/haptics';
import { Surface } from '../ui/Surface';
import type { RootStackParamList } from '../../navigation/types';
import {
  FLOATING_AI_BUTTON_SIZE,
  resolveFloatingAIButtonPlacement,
  type HubItemId,
  type MenuDirection,
} from './floatingAIButtonGeometry';
import {
  FloatingAIHubMenu,
  MENU_SPRING,
} from './FloatingAIHubMenu';
import { useFloatingAIButtonPosition } from './useFloatingAIButtonPosition';
import { useFloatingAIButtonPanGesture } from './useFloatingAIButtonPanGesture';

interface FloatingAIButtonProps {
  readonly currentRouteName?: string;
}

export function FloatingAIButton({ currentRouteName }: FloatingAIButtonProps) {
  const { isEnabled } = useAIStore();
  const { colors } = useTheme();
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [horizontalDirection, setHorizontalDirection] = useState<MenuDirection>(-1);
  const [verticalDirection, setVerticalDirection] = useState<MenuDirection>(-1);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const position = useFloatingAIButtonPosition();
  const {
    geometry,
    translateX,
    translateY,
    savedTranslateX,
    savedTranslateY,
    markPositionInteractionStarted,
    savePosition,
  } = position;
  const menuProgress = useSharedValue(0);

  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (isMounted) setReduceMotionEnabled(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled,
    );

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    menuProgress.value = reduceMotionEnabled
      ? menuOpen ? 1 : 0
      : withSpring(menuOpen ? 1 : 0, MENU_SPRING);
  }, [menuOpen, menuProgress, reduceMotionEnabled]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    closeMenu();
  }, [closeMenu, geometry]);

  const handleTap = useCallback(() => {
    if (menuOpen) {
      closeMenu();
      return;
    }

    closeMenu();
    HapticService.success();
    useAIHubStore.getState().goNewChat(navigation);
  }, [closeMenu, menuOpen, navigation]);

  const handleLongPress = useCallback(() => {
    markPositionInteractionStarted();
    HapticService.selection();
    if (menuOpen) {
      closeMenu();
      return;
    }

    const currentPosition = { x: translateX.value, y: translateY.value };
    const placement = resolveFloatingAIButtonPlacement(currentPosition, geometry);
    translateX.value = placement.position.x;
    translateY.value = placement.position.y;
    savedTranslateX.value = placement.position.x;
    savedTranslateY.value = placement.position.y;
    if (
      placement.position.x !== currentPosition.x
      || placement.position.y !== currentPosition.y
    ) {
      savePosition(placement.position);
    }
    setHorizontalDirection(placement.horizontalDirection);
    setVerticalDirection(placement.verticalDirection);
    setMenuOpen(true);
  }, [
    closeMenu,
    geometry,
    markPositionInteractionStarted,
    menuOpen,
    savedTranslateX,
    savedTranslateY,
    savePosition,
    translateX,
    translateY,
  ]);

  const handleMenuItemPress = useCallback((itemId: HubItemId) => {
    setMenuOpen(false);
    HapticService.selection();
    const hub = useAIHubStore.getState();
    switch (itemId) {
      case 'new-chat':
        hub.goNewChat(navigation);
        return;
      case 'chat-history':
        hub.goChatHistory(navigation);
        return;
      case 'ai-settings':
        hub.goAISettings(navigation);
        return;
      case 'thought-dump':
        hub.goThoughtDump(navigation);
        return;
      case 'voice-dump':
        hub.goVoiceDump(navigation);
        return;
      default:
        return itemId;
    }
  }, [navigation]);

  const panGesture = useFloatingAIButtonPanGesture(position, {
    closeMenu,
    setHorizontalDirection,
    setVerticalDirection,
  });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
      ],
    };
  });

  if (!isEnabled || currentRouteName === 'ChatThreadList' || currentRouteName === 'ChatScreen') {
    return null;
  }

  return (
    <>
      {menuOpen && (
        <Pressable
          testID="floating-ai.hub.backdrop"
          accessible={false}
          onPress={closeMenu}
          style={styles.backdrop}
        />
      )}
      <Animated.View style={[styles.container, animatedStyle]} pointerEvents="box-none">
        <FloatingAIHubMenu
          menuOpen={menuOpen}
          reduceMotionEnabled={reduceMotionEnabled}
          horizontalDirection={horizontalDirection}
          verticalDirection={verticalDirection}
          progress={menuProgress}
          primaryColor={colors.primary}
          iconColor={colors.surface}
          labelColor={colors.text}
          surfaceColor={colors.elevated}
          onItemPress={handleMenuItemPress}
        />

        <GestureDetector gesture={panGesture}>
          <Pressable
            testID="floating-ai.button.navigate-chat"
            accessibilityRole="button"
            accessibilityLabel={menuOpen ? 'Close AI hub' : 'Start a new AI chat'}
            accessibilityState={{ expanded: menuOpen }}
            onPress={handleTap}
            onLongPress={handleLongPress}
            delayLongPress={450}
            style={styles.button}
          >
            {reduceMotionEnabled ? (
              <Surface
                elevation="raised"
                radius="pill"
                style={[styles.button, { backgroundColor: colors.primary }]}
              >
                <Ionicons name="sparkles" size={24} color="#FFFFFF" />
              </Surface>
            ) : (
              <Ionicons name="sparkles" size={24} color={colors.surface} />
            )}
          </Pressable>
        </GestureDetector>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 9999,
    width: FLOATING_AI_BUTTON_SIZE,
    height: FLOATING_AI_BUTTON_SIZE,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 9998,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  button: {
    width: FLOATING_AI_BUTTON_SIZE,
    height: FLOATING_AI_BUTTON_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
