import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../contexts/ThemeContext';

interface TodosEmptyStateProps {
  isFiltered: boolean;
}

export function TodosEmptyState({ isFiltered }: TodosEmptyStateProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Ionicons name="checkbox-outline" size={64} color={colors.textSecondary} />
      <Text style={[styles.title, { color: colors.text }]}>
        {isFiltered ? t('todos.noMatchingTodos') : t('todos.noTodosYet')}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {isFiltered ? t('notes.tryAdjusting') : t('todos.addFirst')}
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
