import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import SearchBar from '../SearchBar';
import SortPicker from '../SortPicker';
import { useTheme } from '../../contexts/ThemeContext';
import { HapticService } from '../../utils/haptics';
import { GitRepository } from '../../services/GitService';
import { ViewMode, VIEW_MODE_ICONS } from '../../utils/viewModes';
import { SortMode } from '../../types/SortTypes';

interface NotesListHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  viewMode: ViewMode;
  activeFilterCount: number;
  pendingSync: number;
  isManualSyncing: boolean;
  repositories: GitRepository[];
  selectedRepo: GitRepository | null;
  hasActiveSearch: boolean;
  searchMatchCount: number;
  currentSearchMatchIndex: number;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
  onToggleViewModePicker: () => void;
  onOpenFilters: () => void;
  onManualSync: () => void;
  onSelectRepo: (repo: GitRepository | null) => void;
  onSearchNavigate: (step: -1 | 1) => void;
}

export function NotesListHeader({
  searchQuery,
  onSearchChange,
  viewMode,
  activeFilterCount,
  pendingSync,
  isManualSyncing,
  repositories,
  selectedRepo,
  hasActiveSearch,
  searchMatchCount,
  currentSearchMatchIndex,
  sortMode,
  onSortChange,
  onToggleViewModePicker,
  onOpenFilters,
  onManualSync,
  onSelectRepo,
  onSearchNavigate,
}: NotesListHeaderProps) {
  const { colors } = useTheme();

  return (
    <>
      <View style={styles.topBar}>
        <SearchBar
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder="Search notes..."
          style={styles.searchBar}
        />
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: colors.surface }]}
          onPress={() => {
            HapticService.light();
            onToggleViewModePicker();
          }}
        >
          <Ionicons name={VIEW_MODE_ICONS[viewMode]} size={20} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.iconBtn,
            {
              backgroundColor: activeFilterCount > 0 ? colors.primary + '20' : colors.surface,
            },
          ]}
          onPress={() => {
            HapticService.light();
            onOpenFilters();
          }}
        >
          <Ionicons
            name="funnel-outline"
            size={20}
            color={activeFilterCount > 0 ? colors.primary : colors.textSecondary}
          />
          {activeFilterCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Text style={styles.badgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.iconBtn,
            {
              backgroundColor: pendingSync > 0 ? colors.primary + '20' : colors.surface,
            },
          ]}
          onPress={onManualSync}
          disabled={isManualSyncing}
        >
          {isManualSyncing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons
              name={pendingSync > 0 ? 'cloud-upload' : 'cloud-done'}
              size={20}
              color={pendingSync > 0 ? colors.primary : colors.textSecondary}
            />
          )}
          {pendingSync > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Text style={styles.badgeText}>{pendingSync}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chipContent}
      >
        <TouchableOpacity
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
          <Text style={[styles.chipText, { color: !selectedRepo ? colors.primary : colors.text }]}>All Notes</Text>
        </TouchableOpacity>
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
        <SortPicker currentSort={sortMode} onSortChange={onSortChange} entityType="notes" />
      </ScrollView>

      {hasActiveSearch ? (
        <View style={[styles.searchNavigatorRow, { backgroundColor: colors.surface }]}>
          <Text style={[styles.searchNavigatorCount, { color: colors.textSecondary }]}>
            {searchMatchCount > 0 ? `${currentSearchMatchIndex + 1}/${searchMatchCount}` : '0/0'}
          </Text>
          <View style={styles.searchNavigatorActions}>
            {([-1, 1] as const).map((step) => (
              <TouchableOpacity
                key={step}
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchBar: { flex: 1 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  chipRow: { marginBottom: 4, minHeight: 50, maxHeight: 50 },
  chipContent: { gap: 6, paddingTop: 6, paddingBottom: 8, paddingHorizontal: 12 },
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
