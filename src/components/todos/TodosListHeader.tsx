import React from 'react';
import { View, StyleSheet } from 'react-native';

import SearchBar from '../SearchBar';

interface TodosListHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function TodosListHeader({ searchQuery, onSearchChange }: TodosListHeaderProps) {
  return (
    <View style={styles.container}>
      <SearchBar
        value={searchQuery}
        onChangeText={onSearchChange}
        placeholder="Search todos..."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
});
