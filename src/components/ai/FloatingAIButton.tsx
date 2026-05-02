import React, { useEffect } from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAIStore } from '../../stores/aiStore';
import { useTheme } from '../../contexts/ThemeContext';
import { HapticService } from '../../utils/haptics';
import { Surface } from '../ui/Surface';

const BUTTON_SIZE = 56;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const STORAGE_KEY = 'ai-button-position';

export function FloatingAIButton() {
  const { isEnabled } = useAIStore();
  const { colors } = useTheme();
  const navigation = useNavigation();

  const initialX = SCREEN_WIDTH - BUTTON_SIZE - 24;
  const initialY = SCREEN_HEIGHT - BUTTON_SIZE - 100;

  const translateX = useSharedValue(initialX);
  const translateY = useSharedValue(initialY);
  
  const savedTranslateX = useSharedValue(initialX);
  const savedTranslateY = useSharedValue(initialY);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((pos) => {
      if (pos) {
        try {
          const { x, y } = JSON.parse(pos);
          translateX.value = x;
          translateY.value = y;
          savedTranslateX.value = x;
          savedTranslateY.value = y;
        } catch (e) {}
      }
    });
  }, [translateX, translateY, savedTranslateX, savedTranslateY]);

  const savePosition = (x: number, y: number) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ x, y })).catch(() => {});
  };

  const panGesture = Gesture.Pan()
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

  const tapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(HapticService.success)();
    runOnJS(navigation.navigate as any)('ChatThreadList');
  });

  const composedGesture = Gesture.Exclusive(panGesture, tapGesture);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
      ],
    };
  });

  if (!isEnabled) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <GestureDetector gesture={composedGesture}>
        <Animated.View>
          <Surface
            elevation="raised"
            radius="pill"
            style={[
              styles.button,
              { backgroundColor: colors.primary }
            ]}
          >
            <Ionicons name="sparkles" size={24} color="#FFFFFF" />
          </Surface>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 9999,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
