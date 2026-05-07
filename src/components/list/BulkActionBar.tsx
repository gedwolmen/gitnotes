import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';

interface BulkActionBarProps {
  count: number;
  onCancel: () => void;
  onDelete: () => void;
  bottomOffset: number;
  itemNoun: string;
}

export function BulkActionBar({
  count,
  onCancel,
  onDelete,
  bottomOffset,
  itemNoun,
}: BulkActionBarProps) {
  const { colors } = useTheme();
  if (count === 0) return null;

  const noun = count === 1 ? itemNoun : `${itemNoun}s`;

  return (
    <View
      testID="bulk-action-bar.container"
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          bottom: bottomOffset,
        },
      ]}
    >
      <TouchableOpacity
        testID="bulk-action-bar.button.cancel"
        style={styles.cancelBtn}
        onPress={onCancel}
        accessibilityLabel="Cancel selection"
      >
        <Ionicons name="close" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
      <Text style={[styles.count, { color: colors.text }]} numberOfLines={1}>
        {count} {noun} selected
      </Text>
      <TouchableOpacity
        testID="bulk-action-bar.button.delete"
        style={[styles.deleteBtn, { backgroundColor: colors.error }]}
        onPress={onDelete}
        accessibilityLabel={`Delete ${count} ${noun}`}
      >
        <Ionicons name="trash" size={16} color="#FFFFFF" />
        <Text style={styles.deleteText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  cancelBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  deleteText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default BulkActionBar;
