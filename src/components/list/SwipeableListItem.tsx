import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
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
  mergeTop?: boolean;
  mergeBottom?: boolean;
  children: React.ReactNode;
}

const SWIPE_THRESHOLD = 36;
const MAX_DRAG = 48;

export function SwipeableListItem({
  itemId,
  selected,
  selectionMode,
  onToggleSelect,
  mergeTop = false,
  mergeBottom = false,
  children,
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
      const shouldToggle = event.translationX < -SWIPE_THRESHOLD;
      translateX.value = withSpring(0, { damping: 22, stiffness: 320 }, (finished) => {
        if (finished && shouldToggle) {
          runOnJS(triggerToggle)();
        }
      });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const cardContent = selectionMode ? (
    <TouchableOpacity
      testID={`swipeable-list-item.button.toggle-${itemId}`}
      activeOpacity={0.7}
      onPress={() => {
        HapticService.selection();
        onToggleSelect();
      }}
    >
      {children}
    </TouchableOpacity>
  ) : (
    children
  );

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          styles.itemWrap,
          selected && {
            backgroundColor: colors.primary + '14',
            borderColor: colors.primary,
          },
          selected && mergeTop && styles.mergeTop,
          selected && mergeBottom && styles.mergeBottom,
          animatedStyle,
        ]}
      >
        {cardContent}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  itemWrap: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  mergeTop: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 0,
    marginTop: -8,
    paddingTop: 8,
  },
  mergeBottom: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
    marginBottom: -8,
    paddingBottom: 8,
  },
});

export default SwipeableListItem;
