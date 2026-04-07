import React from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

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
      <TouchableOpacity
        onPress={onUndo}
        disabled={!canUndo || disabled}
        style={[styles.button, (!canUndo || disabled) && styles.buttonDisabled]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons
          name="arrow-undo"
          size={22}
          color={(!canUndo || disabled) ? colors.textSecondary : colors.text}
        />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onRedo}
        disabled={!canRedo || disabled}
        style={[styles.button, (!canRedo || disabled) && styles.buttonDisabled]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons
          name="arrow-redo"
          size={22}
          color={(!canRedo || disabled) ? colors.textSecondary : colors.text}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  button: {
    padding: 6,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});