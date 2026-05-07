import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../contexts/ThemeContext';
import { NoteFormat } from '../../models/Note';
import { NotesListFilters, NOTE_FORMAT_LABELS } from './notesShared';

interface NotesActiveFiltersProps {
  filters: NotesListFilters;
  onClearFormat: () => void;
  onClearBranch: () => void;
  onClearFolder: () => void;
  onClearAll: () => void;
}

export function NotesActiveFilters({
  filters,
  onClearFormat,
  onClearBranch,
  onClearFolder,
  onClearAll,
}: NotesActiveFiltersProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { selectedFormat, selectedBranch, selectedFolder } = filters;

  if (!selectedFormat && !selectedBranch && !selectedFolder) return null;

  const renderChip = (
    key: string,
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    onPress: () => void,
  ) => (
    <TouchableOpacity
      key={key}
      testID={`notes-active-filters.button.remove-${key}`}
      style={[styles.chip, { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={12} color={colors.primary} />
      <Text style={[styles.chipText, { color: colors.primary }]}>{label}</Text>
      <Ionicons name="close" size={12} color={colors.primary} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {selectedFormat
          ? renderChip(
              'format',
              'document-outline',
              NOTE_FORMAT_LABELS[selectedFormat as Exclude<NoteFormat, 'json'>],
              onClearFormat,
            )
          : null}
        {selectedBranch
          ? renderChip('branch', 'git-branch-outline', selectedBranch, onClearBranch)
          : null}
        {selectedFolder ? renderChip('folder', 'folder-outline', selectedFolder, onClearFolder) : null}
        <TouchableOpacity testID="notes-active-filters.button.clear-all" style={[styles.chip, { borderColor: colors.border + '60' }]} onPress={onClearAll}>
          <Text style={[styles.chipText, { color: colors.textSecondary }]}>{t('common.clearAll')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 12, marginTop: 4, marginBottom: 4 },
  row: { gap: 6, paddingTop: 6, paddingBottom: 8, paddingRight: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    backgroundColor: 'transparent',
  },
  chipText: { fontSize: 12, fontWeight: '500' },
});
