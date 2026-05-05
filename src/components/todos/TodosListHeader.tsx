import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import SearchBar from '../SearchBar';
import SortPicker from '../SortPicker';
import { SortMode } from '../../types/SortTypes';

interface TodosListHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
}

export function TodosListHeader({ searchQuery, onSearchChange, sortMode, onSortChange }: TodosListHeaderProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <SearchBar
        value={searchQuery}
        onChangeText={onSearchChange}
        placeholder={t('todos.searchTodos')}
        style={styles.searchBar}
      />
      <SortPicker currentSort={sortMode} onSortChange={onSortChange} entityType="todos" size="bar" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
  },
  searchBar: {
    flex: 1,
  },
});
