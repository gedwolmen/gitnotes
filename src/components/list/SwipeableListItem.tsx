import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useTheme } from '../../contexts/ThemeContext';
import { HapticService } from '../../utils/haptics';

interface SwipeableListItemProps {
  itemId: string;
  selected: boolean;
  selectionMode: boolean;
  onToggleSelect: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}

const SWIPE_THRESHOLD = 36;
const MAX_DRAG = 48;

export function SwipeableListItem({
  itemId,
  selected,
  selectionMode,
  onToggleSelect,
  children,
  disabled = false,
}: SwipeableListItemProps) {
  const { colors } = useTheme();
  const translateX = useSharedValue(0);

  const triggerToggle = () => {
    HapticService.selection();
    onToggleSelect();
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 9999])
    .failOffsetY([-8, 8])
    .onUpdate((event) => {
      translateX.value = Math.max(Math.min(event.translationX, 0), -MAX_DRAG);
    })
    .onEnd((event) => {
      if (event.translationX < -SWIPE_THRESHOLD) {
        runOnJS(triggerToggle)();
      }
      translateX.value = withSpring(0, { damping: 22, stiffness: 320 });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const cardContent = selectionMode ? (
    <TouchableOpacity
      testID={`swipeable-list-item.button.toggle-${itemId}`}
      activeOpacity={0.7}
      disabled={disabled}
      onPress={disabled ? undefined : () => {
        HapticService.selection();
        onToggleSelect();
      }}
    >
      {children}
    </TouchableOpacity>
  ) : (
    children
  );

  const row = (
    <Animated.View
      testID={`swipeable-${itemId}`}
      className="rounded-sm"
      style={[
        { flex: 1 },
        selected && {
          shadowColor: colors.error,
          shadowOpacity: 0.55,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 0 },
          elevation: 8,
        },
        animatedStyle,
      ]}
    >
      {cardContent}
    </Animated.View>
  );

  if (disabled) return row;

  return (
    <GestureDetector gesture={pan}>
      {row}
    </GestureDetector>
  );
}

export default SwipeableListItem;
