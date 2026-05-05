import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';

interface NotesEmptyStateProps {
  isFiltered: boolean;
}

export function NotesEmptyState({ isFiltered }: NotesEmptyStateProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Ionicons name="document-text-outline" size={48} color={colors.textSecondary} />
      <Text style={[styles.title, { color: colors.text }]}>
        {isFiltered ? t('notes.noMatchingNotes') : t('notes.noNotesYet')}
      </Text>
      <Text style={[styles.subtext, { color: colors.textSecondary }]}>
        {isFiltered ? t('notes.tryAdjusting') : t('notes.createFirst')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 6,
  },
  subtext: {
    fontSize: 14,
    textAlign: 'center',
  },
});
