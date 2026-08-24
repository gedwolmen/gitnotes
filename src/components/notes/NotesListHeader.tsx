import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import SearchBar from '../SearchBar';
import SortPicker from '../SortPicker';
import { useTheme } from '../../contexts/ThemeContext';
import { HapticService } from '../../utils/haptics';
import { GitRepository } from '../../services/GitService';
import { SortMode } from '../../types/SortTypes';

interface NotesListHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  repositories: GitRepository[];
  selectedRepo: GitRepository | null;
  hasActiveSearch: boolean;
  searchMatchCount: number;
  currentSearchMatchIndex: number;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
  onSelectRepo: (repo: GitRepository | null) => void;
  onSearchNavigate: (step: -1 | 1) => void;
}

export function NotesListHeader({
  searchQuery,
  onSearchChange,
  repositories,
  selectedRepo,
  hasActiveSearch,
  searchMatchCount,
  currentSearchMatchIndex,
  sortMode,
  onSortChange,
  onSelectRepo,
  onSearchNavigate,
}: NotesListHeaderProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <>
      <View style={styles.topBar}>
        <SearchBar
          testID="notes-list.search-bar.search"
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder={t('notes.searchNotes')}
          style={styles.searchBar}
        />
        <View testID="notes-list.sort.change">
          <SortPicker currentSort={sortMode} onSortChange={onSortChange} entityType="notes" size="bar" iconOnly />
        </View>
      </View>

      <View style={styles.chipRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipContent}
        >
          <View testID="notes-list.button.select-repo">
            <TouchableOpacity
              testID="notes-list-header.button.select-repo"
            style={[
              styles.chip,
              { borderColor: !selectedRepo ? colors.primary : colors.border + '60' },
              !selectedRepo && { backgroundColor: colors.primary + '15' },
            ]}
            onPress={() => {
              HapticService.selection();
              onSelectRepo(null);
            }}
          >
            <Ionicons
              name="home-outline"
              size={13}
              color={!selectedRepo ? colors.primary : colors.textSecondary}
            />
            <Text style={[styles.chipText, { color: !selectedRepo ? colors.primary : colors.text }]}>{t('notes.allNotes')}</Text>
          </TouchableOpacity>
          </View>
          {repositories.map((repo) => {
            const isSelected = selectedRepo?.id === repo.id;
            return (
              <TouchableOpacity
                key={repo.id}
                style={[
                  styles.chip,
                  { borderColor: isSelected ? colors.primary : colors.border + '60' },
                  isSelected && { backgroundColor: colors.primary + '15' },
                ]}
                onPress={() => {
                  HapticService.selection();
                  onSelectRepo(repo);
                }}
              >
                <Ionicons
                  name="git-branch-outline"
                  size={13}
                  color={isSelected ? colors.primary : colors.textSecondary}
                />
                <Text style={[styles.chipText, { color: isSelected ? colors.primary : colors.text }]}>
                  {repo.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {hasActiveSearch ? (
        <View style={[styles.searchNavigatorRow, { backgroundColor: colors.surface }]}>
          <Text style={[styles.searchNavigatorCount, { color: colors.textSecondary }]}>
            {searchMatchCount > 0 ? `${currentSearchMatchIndex + 1}/${searchMatchCount}` : '0/0'}
          </Text>
          <View testID="notes-list.button.navigate-search" style={styles.searchNavigatorActions}>
            {([-1, 1] as const).map((step) => (
              <TouchableOpacity
                key={step}
                testID={step === -1 ? 'notes-list.button.navigate-search-prev' : 'notes-list.button.navigate-search-next'}
                style={[
                  styles.searchNavButton,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
                onPress={() => onSearchNavigate(step)}
                disabled={searchMatchCount === 0}
              >
                <Ionicons
                  name={step === -1 ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={searchMatchCount === 0 ? colors.textSecondary : colors.text}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
  },
  searchBar: { flex: 1 },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    minHeight: 50,
    maxHeight: 50,
    paddingTop: 6,
    paddingBottom: 8,
  },
  chipScroll: { flex: 1 },
  chipContent: { gap: 6, paddingHorizontal: 16, alignItems: 'center' },
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
  searchNavigatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 12,
    marginBottom: 4,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  searchNavigatorCount: {
    fontSize: 12,
    fontWeight: '500',
  },
  searchNavigatorActions: {
    flexDirection: 'row',
    gap: 6,
  },
  searchNavButton: {
    width: 34,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
