import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Dimensions, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAIStore } from '../../stores/aiStore';
import { useAIHubStore } from '../../stores/aiHubStore';
import { useTheme } from '../../contexts/ThemeContext';
import { HapticService } from '../../utils/haptics';
import { Surface } from '../ui/Surface';
import type { RootStackParamList } from '../../navigation/types';
import {
  FloatingAIHubMenu,
  MENU_SPRING,
  type HubItemId,
  type MenuDirection,
} from './FloatingAIHubMenu';

const BUTTON_SIZE = 56;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const STORAGE_KEY = 'ai-button-position';

interface FloatingAIButtonProps {
  currentRouteName?: string;
}

export function FloatingAIButton({ currentRouteName }: FloatingAIButtonProps) {
  const { isEnabled } = useAIStore();
  const { colors } = useTheme();
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [horizontalDirection, setHorizontalDirection] = useState<MenuDirection>(-1);
  const [verticalDirection, setVerticalDirection] = useState<MenuDirection>(-1);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const initialX = SCREEN_WIDTH - BUTTON_SIZE - 24;
  const initialY = SCREEN_HEIGHT - BUTTON_SIZE - 100;

  const translateX = useSharedValue(initialX);
  const translateY = useSharedValue(initialY);
  
  const savedTranslateX = useSharedValue(initialX);
  const savedTranslateY = useSharedValue(initialY);
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
    AsyncStorage.getItem(STORAGE_KEY).then((pos) => {
      if (pos) {
        try {
          const { x, y } = JSON.parse(pos);
          translateX.value = x;
          translateY.value = y;
          savedTranslateX.value = x;
          savedTranslateY.value = y;
        } catch (e) {
          console.warn('Failed to restore FAB position:', e);
        }
      }
    });
  }, [translateX, translateY, savedTranslateX, savedTranslateY]);

  useEffect(() => {
    menuProgress.value = reduceMotionEnabled
      ? menuOpen ? 1 : 0
      : withSpring(menuOpen ? 1 : 0, MENU_SPRING);
  }, [menuOpen, menuProgress, reduceMotionEnabled]);

  const savePosition = (x: number, y: number) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ x, y })).catch(() => { return; });
  };

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const handleTap = useCallback(() => {
    closeMenu();
    HapticService.success();
    useAIHubStore.getState().goNewChat(navigation);
  }, [closeMenu, navigation]);

  const handleLongPress = useCallback(() => {
    HapticService.selection();
    if (menuOpen) {
      closeMenu();
      return;
    }

    setHorizontalDirection(translateX.value < SCREEN_WIDTH / 2 ? 1 : -1);
    setVerticalDirection(translateY.value < SCREEN_HEIGHT / 2 ? 1 : -1);
    setMenuOpen(true);
  }, [closeMenu, menuOpen, translateX, translateY]);

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
      default:
        return itemId;
    }
  }, [navigation]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      runOnJS(closeMenu)();
    })
    .onUpdate((event) => {
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      const distanceToLeft = translateX.value;
      const distanceToRight = SCREEN_WIDTH - BUTTON_SIZE - translateX.value;
      
      const snapX = distanceToLeft < distanceToRight ? 16 : SCREEN_WIDTH - BUTTON_SIZE - 16;
      
      const minY = 60;
      const maxY = SCREEN_HEIGHT - BUTTON_SIZE - 100;
      const snapY = Math.min(Math.max(translateY.value, minY), maxY);

      translateX.value = withSpring(snapX, {
        mass: 1,
        damping: 15,
        stiffness: 120,
      });
      translateY.value = withSpring(snapY, {
        mass: 1,
        damping: 15,
        stiffness: 120,
      });

      savedTranslateX.value = snapX;
      savedTranslateY.value = snapY;

      runOnJS(savePosition)(snapX, snapY);
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
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 9998,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
