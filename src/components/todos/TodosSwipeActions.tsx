import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';

interface TodosSwipeActionsProps {
  onDelete: () => void;
}

export function TodosSwipeActions({ onDelete }: TodosSwipeActionsProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.track}>
      <TouchableOpacity
        style={[styles.action, { backgroundColor: colors.error }]}
        onPress={onDelete}
        activeOpacity={0.85}
      >
        <Ionicons name="trash" size={24} color="#fff" />
        <Text style={styles.text}>Delete</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 80,
    marginBottom: 8,
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
