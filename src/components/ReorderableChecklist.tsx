import React, { memo, useMemo } from 'react';
import {
  AccessibilityActionEvent,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { useTokens } from '../contexts/ThemeContext';

export interface ChecklistItem {
  checked: boolean;
  text: string;
}

interface ReorderableChecklistProps {
  items: ChecklistItem[];
  onReorder: (items: ChecklistItem[]) => void;
  onToggle: (index: number) => void;
  onTextChange: (index: number, text: string) => void;
  onAddItem: () => void;
  onDeleteItem: (index: number) => void;
}

const ROW_HEIGHT = 56;

export function reorderItems(items: ChecklistItem[], fromIndex: number, toIndex: number): ChecklistItem[] {
  if (items.length <= 1 || fromIndex === toIndex) {
    return items;
  }

  const nextItems = [...items];
  const boundedFromIndex = Math.max(0, Math.min(fromIndex, nextItems.length - 1));
  const boundedToIndex = Math.max(0, Math.min(toIndex, nextItems.length - 1));
  const [movedItem] = nextItems.splice(boundedFromIndex, 1);

  if (!movedItem) {
    return items;
  }

  nextItems.splice(boundedToIndex, 0, movedItem);
  return nextItems;
}

function ReorderableChecklist({
  items,
  onReorder,
  onToggle,
  onTextChange,
  onAddItem,
  onDeleteItem,
}: ReorderableChecklistProps) {
  const { colors, radii, spacing, type } = useTokens();

  // Key on index only — including item.text in the key remounts the row
  // every keystroke, which steals focus from the TextInput and dismisses the
  // keyboard mid-word.
  const itemRows = useMemo(() => items.map((item, index) => (
    <ChecklistRow
      key={`checklist-item-${index}`}
      index={index}
      item={item}
      itemCount={items.length}
      onDeleteItem={onDeleteItem}
      onReorder={onReorder}
      onTextChange={onTextChange}
      onToggle={onToggle}
      items={items}
    />
  )), [items, onDeleteItem, onReorder, onTextChange, onToggle]);

  return (
    <View style={{ gap: spacing[3] }}>
      <View style={{ gap: spacing[2] }}>{itemRows}</View>
      <TouchableOpacity
        accessibilityLabel="Add checklist item"
        activeOpacity={0.8}
        onPress={onAddItem}
        style={[
          styles.addButton,
          {
            borderColor: colors.border,
            borderRadius: radii.md,
            paddingHorizontal: spacing[3],
            paddingVertical: spacing[3],
          },
        ]}
      >
        <Text style={{ color: colors.accent, fontSize: type.md, fontWeight: '600' }}>+ Add item</Text>
      </TouchableOpacity>
    </View>
  );
}

interface ChecklistRowProps {
  item: ChecklistItem;
  index: number;
  itemCount: number;
  items: ChecklistItem[];
  onReorder: (items: ChecklistItem[]) => void;
  onToggle: (index: number) => void;
  onTextChange: (index: number, text: string) => void;
  onDeleteItem: (index: number) => void;
}

const ChecklistRow = memo(function ChecklistRow({
  item,
  index,
  itemCount,
  items,
  onReorder,
  onToggle,
  onTextChange,
  onDeleteItem,
}: ChecklistRowProps) {
  const { colors, radii, spacing, type } = useTokens();
  const translateY = useSharedValue(0);
  const dragging = useSharedValue(false);

  const commitReorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) {
      return;
    }

    onReorder(reorderItems(items, fromIndex, toIndex));
  };

  const gesture = Gesture.Pan()
    .runOnJS(true)
    .onStart(() => {
      dragging.value = true;
    })
    .onUpdate((event) => {
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      const nextIndex = Math.max(0, Math.min(index + Math.round(event.translationY / ROW_HEIGHT), itemCount - 1));
      translateY.value = withTiming(0);
      dragging.value = false;
      if (nextIndex !== index) {
        commitReorder(index, nextIndex);
      }
    })
    .onFinalize(() => {
      translateY.value = withTiming(0);
      dragging.value = false;
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    zIndex: dragging.value ? 1 : 0,
    opacity: withTiming(dragging.value ? 0.95 : 1),
  }));

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    const { actionName } = event.nativeEvent;

    if (actionName === 'increment' && index < itemCount - 1) {
      commitReorder(index, index + 1);
    }

    if (actionName === 'decrement' && index > 0) {
      commitReorder(index, index - 1);
    }
  };

  return (
    <Animated.View
      accessibilityActions={[
        { name: 'decrement', label: 'Move item up' },
        { name: 'increment', label: 'Move item down' },
      ]}
      accessibilityLabel={`Checklist item ${index + 1}`}
      accessible
      onAccessibilityAction={handleAccessibilityAction}
      style={[
        styles.row,
        animatedStyle,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radii.md,
          minHeight: ROW_HEIGHT,
          paddingHorizontal: spacing[3],
          paddingVertical: spacing[2],
        },
      ]}
    >
      <TouchableOpacity
        testID="reorderable-checklist.checkbox.check"
        accessibilityLabel={`Toggle checklist item ${index + 1}`}
        activeOpacity={0.8}
        onPress={() => onToggle(index)}
        style={[
          styles.checkbox,
          {
            borderColor: item.checked ? colors.accent : colors.border,
            backgroundColor: item.checked ? colors.accent : 'transparent',
            borderRadius: radii.sm,
            marginRight: spacing[2],
          },
        ]}
      >
        {item.checked ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
      </TouchableOpacity>

      <TextInput
        accessibilityLabel={`Checklist text input ${index + 1}`}
        onChangeText={(text) => onTextChange(index, text)}
        placeholder="List item"
        placeholderTextColor={colors.textSecondary}
        style={[
          styles.input,
          {
            color: colors.text,
            fontSize: type.md,
            marginRight: spacing[2],
            textDecorationLine: item.checked ? 'line-through' : 'none',
          },
        ]}
        value={item.text}
      />

      <GestureDetector gesture={gesture}>
        <View style={styles.dragHandleWrap}>
          <View testID="reorderable-checklist.drag-handle.drag" accessibilityLabel={`Drag checklist item ${index + 1}`} style={{ paddingHorizontal: spacing[1], paddingVertical: spacing[2] }}>
            <Text style={{ color: colors.textSecondary, fontSize: type.lg, fontWeight: '600' }}>=</Text>
          </View>
        </View>
      </GestureDetector>

      <TouchableOpacity
        accessibilityLabel={`Delete checklist item ${index + 1}`}
        activeOpacity={0.8}
        onPress={() => onDeleteItem(index)}
        style={{ paddingHorizontal: spacing[1], paddingVertical: spacing[2] }}
      >
        <Ionicons name="close" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </Animated.View>
  );
});

export default ReorderableChecklist;

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderWidth: 1,
    flexDirection: 'row',
  },
  checkbox: {
    alignItems: 'center',
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  checkboxMark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 0,
  },
  dragHandleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    alignItems: 'center',
    borderStyle: 'dashed',
    borderWidth: 1,
    justifyContent: 'center',
  },
});
