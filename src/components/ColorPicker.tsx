import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Modal } from './ui';
import { useTheme } from '../contexts/ThemeContext';
import { NOTE_COLORS } from '../theme/tokens';
import { NoteColor, NOTE_COLOR_VALUES } from '../models/Note';

export interface ColorPickerProps {
  visible: boolean;
  onClose: () => void;
  // null = clear / "None"; a NoteColor value = set
  onSelect: (color: NoteColor | null) => void;
  selected?: NoteColor | null;
  title?: string;
}

const SWATCH_SIZE = 44;

export default function ColorPicker({
  visible,
  onClose,
  onSelect,
  selected,
  title = 'Color',
}: ColorPickerProps) {
  const { colors } = useTheme();

  const handlePick = (color: NoteColor | null) => {
    onSelect(color);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      contentStyle={{ padding: 20, minWidth: 300 }}
    >
      <View testID="color-picker">
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

        <View style={styles.swatchGrid}>
          {NOTE_COLOR_VALUES.map((color) => {
            const hex = NOTE_COLORS[color];
            const isSelected = selected === color;
            return (
              <Pressable
                key={color}
                testID={`color-picker-swatch-${color}`}
                accessibilityLabel={`color ${color}`}
                accessibilityRole="button"
                onPress={() => handlePick(color)}
                style={({ pressed }) => [
                  styles.swatch,
                  {
                    backgroundColor: hex,
                    borderColor: isSelected ? colors.text : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                {isSelected ? (
                  <Ionicons name="checkmark" size={22} color="#ffffff" />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <TouchableOpacity
          testID="color-picker-none"
          accessibilityRole="button"
          onPress={() => handlePick(null)}
          style={[
            styles.noneRow,
            {
              borderColor: colors.border,
              backgroundColor: selected == null ? colors.surfaceSecondary : 'transparent',
            },
          ]}
        >
          <Ionicons name="close-circle-outline" size={20} color={colors.textSecondary} />
          <Text style={[styles.noneText, { color: colors.text }]}>None</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="color-picker-cancel"
          accessibilityRole="button"
          onPress={onClose}
          style={[styles.cancelRow]}
        >
          <Text style={[styles.cancelText, { color: colors.primary }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  swatch: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: SWATCH_SIZE / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  noneText: {
    fontSize: 16,
    fontWeight: '500',
  },
  cancelRow: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
