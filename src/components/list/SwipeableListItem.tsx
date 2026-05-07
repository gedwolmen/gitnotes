import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  onDelete: () => void;
  onToggleSelect: () => void;
  registerRef: (id: string) => React.RefObject<SwipeableMethods | null>;
  onSwipeableWillOpen: (id: string) => void;
  onSwipeableWillClose: (id: string) => void;
  children: React.ReactNode;
}

const ACTION_WIDTH = 88;
const SWIPE_THRESHOLD = 48;

export function SwipeableListItem({
  itemId,
  selected,
  selectionMode,
  onDelete,
  onToggleSelect,
  registerRef,
  onSwipeableWillOpen,
  onSwipeableWillClose,
  children,
}: SwipeableListItemProps) {
  const { colors } = useTheme();
  const ref = registerRef(itemId);

  const close = () => ref.current?.close();

  const handleDelete = () => {
    HapticService.medium();
    close();
    onDelete();
  };

  const handleSwipeableOpen = (direction: 'left' | 'right') => {
    if (direction === 'left') {
      HapticService.selection();
      close();
      onToggleSelect();
      return;
    }
  };

  const renderRightActions = () => (
    <View style={styles.actionRowRight}>
      <TouchableOpacity
        testID={`swipeable-list-item.button.delete-${itemId}`}
        style={[styles.action, { backgroundColor: colors.error }]}
        onPress={handleDelete}
        accessibilityLabel="Delete"
      >
        <Ionicons name="trash" size={20} color="#FFFFFF" />
        <Text style={styles.actionText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  const renderLeftActions = () => (
    <View
      testID={`swipeable-list-item.hint.select-${itemId}`}
      style={[styles.selectHint, { backgroundColor: colors.primary }]}
    >
      <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color="#FFFFFF" />
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
      leftThreshold={SWIPE_THRESHOLD}
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
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
  actionRowRight: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'flex-end',
  },
  selectHint: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    marginVertical: 4,
    marginHorizontal: 4,
  },
  action: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    marginVertical: 4,
    marginHorizontal: 4,
    gap: 4,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default SwipeableListItem;
