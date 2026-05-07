import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../contexts/ThemeContext';

export interface UndoRedoButtonsProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function UndoRedoButtons({ canUndo, canRedo, onUndo, onRedo }: UndoRedoButtonsProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <TouchableOpacity
        testID="undo-redo.icon-button.undo"
        accessibilityRole="button"
        accessibilityLabel="undo"
        accessibilityState={{ disabled: !canUndo }}
        disabled={!canUndo}
        onPress={onUndo}
        style={[styles.button, !canUndo && styles.disabled]}
      >
        <Ionicons
          name="arrow-undo"
          size={20}
          color={canUndo ? colors.text : colors.textSecondary}
        />
      </TouchableOpacity>

      <TouchableOpacity
        testID="undo-redo.icon-button.redo"
        accessibilityRole="button"
        accessibilityLabel="redo"
        accessibilityState={{ disabled: !canRedo }}
        disabled={!canRedo}
        onPress={onRedo}
        style={[styles.button, !canRedo && styles.disabled]}
      >
        <Ionicons
          name="arrow-redo"
          size={20}
          color={canRedo ? colors.text : colors.textSecondary}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  button: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
});
