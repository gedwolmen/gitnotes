import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { IconButton } from './ui';

interface UndoRedoControlsProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  disabled?: boolean;
}

export default function UndoRedoControls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  disabled = false,
}: UndoRedoControlsProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <IconButton
        size="sm"
        onPress={onUndo}
        disabled={!canUndo || disabled}
        accessibilityLabel="Undo"
      >
        <Ionicons
          name="arrow-undo"
          size={18}
          color={(!canUndo || disabled) ? colors.textSecondary : colors.text}
        />
      </IconButton>

      <IconButton
        size="sm"
        onPress={onRedo}
        disabled={!canRedo || disabled}
        accessibilityLabel="Redo"
      >
        <Ionicons
          name="arrow-redo"
          size={18}
          color={(!canRedo || disabled) ? colors.textSecondary : colors.text}
        />
      </IconButton>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
