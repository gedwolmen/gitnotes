import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

interface NotesSwipeActionsProps {
  onDelete: () => void;
}

export function NotesSwipeActions({ onDelete }: NotesSwipeActionsProps) {
  const { colors } = useTheme();

  return (
    <View testID="notes-swipe.button.delete">
      <View testID="notes-list-card.swipe.delete" style={styles.track}>
      <TouchableOpacity
        testID="notes-list-card.button.delete"
        style={[styles.action, { backgroundColor: colors.error }]}
        onPress={onDelete}
        activeOpacity={0.85}
      >
        <Ionicons name="trash-outline" size={20} color="#fff" />
        <Text style={styles.text}>Delete</Text>
      </TouchableOpacity>
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 80,
    marginVertical: 8,
  },
  action: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
