import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ReanimatedSwipeable, {
  SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { useTheme } from '../../contexts/ThemeContext';
import { HapticService } from '../../utils/haptics';

interface SwipeableListItemProps {
  itemId: string;
  selected: boolean;
  selectionMode: boolean;
  onToggleSelect: () => void;
  registerRef: (id: string) => React.RefObject<SwipeableMethods | null>;
  onSwipeableWillOpen: (id: string) => void;
  onSwipeableWillClose: (id: string) => void;
  children: React.ReactNode;
}

const SWIPE_THRESHOLD = 56;

export function SwipeableListItem({
  itemId,
  selected,
  selectionMode,
  onToggleSelect,
  registerRef,
  onSwipeableWillOpen,
  onSwipeableWillClose,
  children,
}: SwipeableListItemProps) {
  const { colors } = useTheme();
  const ref = registerRef(itemId);

  const handleSwipeableOpen = (direction: 'left' | 'right') => {
    if (direction !== 'right') return;
    HapticService.selection();
    ref.current?.close();
    onToggleSelect();
  };

  const renderRightActions = () => (
    <View
      testID={`swipeable-list-item.hint.swipe-${itemId}`}
      style={[styles.swipeHint, { backgroundColor: colors.error }]}
    >
      <Ionicons name={selected ? 'checkmark-circle' : 'trash'} size={22} color="#FFFFFF" />
    </View>
  );

  const wrapped = (
    <View
      style={[
        styles.itemWrap,
        selected && {
          backgroundColor: colors.primary + '14',
          borderColor: colors.primary,
        },
      ]}
    >
      {selectionMode ? (
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
      )}
    </View>
  );

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      rightThreshold={SWIPE_THRESHOLD}
      renderRightActions={renderRightActions}
      onSwipeableOpen={handleSwipeableOpen}
      onSwipeableWillOpen={() => onSwipeableWillOpen(itemId)}
      onSwipeableWillClose={() => onSwipeableWillClose(itemId)}
    >
      {wrapped}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  itemWrap: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  swipeHint: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    marginVertical: 4,
    marginLeft: 4,
    marginRight: 4,
  },
});

export default SwipeableListItem;
