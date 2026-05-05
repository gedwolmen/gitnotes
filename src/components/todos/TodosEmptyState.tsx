import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';

interface TodosEmptyStateProps {
  isFiltered: boolean;
}

export function TodosEmptyState({ isFiltered }: TodosEmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <Ionicons name="checkbox-outline" size={64} color={colors.textSecondary} />
      <Text style={[styles.title, { color: colors.text }]}>
        {isFiltered ? 'No matching todos' : 'No todos yet'}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {isFiltered ? 'Try adjusting your search or filters' : 'Tap the + button to add your first todo'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 64,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});
