import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { FilterableItem, UseEntityFilterReturn } from '../hooks/useEntityFilter';

interface Props<T extends FilterableItem> {
  filter: UseEntityFilterReturn<T>;
}

export function ActiveFilterStrip<T extends FilterableItem>({ filter }: Props<T>) {
  const { colors } = useTheme();
  const {
    state,
    setSelectedRepo,
    setSelectedBranch,
    setSelectedFolder,
    toggleTag,
    clearAll,
    activeCount,
  } = filter;
  const { selectedRepo, selectedBranch, selectedFolder, selectedTags } = state;

  if (activeCount === 0) return null;

  const chip = (
    key: string,
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    onClear: () => void,
  ) => (
    <TouchableOpacity
      key={key}
      style={[
        styles.chip,
        { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
      ]}
      onPress={onClear}
    >
      <Ionicons name={icon} size={12} color={colors.primary} />
      <Text style={[styles.chipText, { color: colors.primary }]} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="close" size={12} color={colors.primary} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {selectedRepo &&
          chip('repo', 'logo-github', selectedRepo.name, () => setSelectedRepo(null))}
        {selectedBranch &&
          chip('branch', 'git-branch-outline', selectedBranch, () => setSelectedBranch(null))}
        {selectedFolder &&
          chip('folder', 'folder-outline', selectedFolder, () => setSelectedFolder(null))}
        {selectedTags.map((tag) =>
          chip(`tag-${tag}`, 'pricetag-outline', tag, () => toggleTag(tag)),
        )}
        <TouchableOpacity
          style={[styles.chip, { borderColor: colors.border + '60' }]}
          onPress={clearAll}
        >
          <Text style={[styles.chipText, { color: colors.textSecondary }]}>Clear all</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 6,
  },
  row: {
    paddingHorizontal: 12,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    maxWidth: 180,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
