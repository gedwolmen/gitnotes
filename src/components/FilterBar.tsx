import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../contexts/ThemeContext';

export type FilterChipType = 'tag' | 'folder' | 'status';

export interface FilterChip {
  id: string;
  label: string;
  type: FilterChipType;
}

interface FilterBarProps {
  filters: FilterChip[];
  onRemoveFilter: (id: string) => void;
  onClearAll: () => void;
}

const TYPE_ICON: Record<FilterChipType, keyof typeof Ionicons.glyphMap> = {
  tag: 'pricetag-outline',
  folder: 'folder-outline',
  status: 'checkmark-circle-outline',
};

export function FilterBar({ filters, onRemoveFilter, onClearAll }: FilterBarProps) {
  const { colors } = useTheme();

  if (filters.length === 0) return null;

  return (
    <View testID="filter-bar.filter.change" style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="filter-bar.row" contentContainerStyle={styles.row}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.id}
            testID={`notes-filter-bar.button.remove`}
            style={[styles.chip, { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
            onPress={() => onRemoveFilter(f.id)}
          >
            <Ionicons name={TYPE_ICON[f.type]} size={12} color={colors.primary} />
            <Text style={[styles.chipText, { color: colors.primary }]} numberOfLines={1}>
              {f.label}
            </Text>
            <Ionicons name="close" size={12} color={colors.primary} />
          </TouchableOpacity>
        ))}
        {filters.length > 1 ? (
          <TouchableOpacity testID="notes-filter-bar.button.clear-all" style={[styles.chip, { borderColor: colors.border + '60' }]} onPress={onClearAll}>
            <Text style={[styles.chipText, { color: colors.textSecondary }]}>Clear all</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 0, marginTop: 4, marginBottom: 4 },
  row: { gap: 6, paddingTop: 6, paddingBottom: 8, paddingRight: 12 },
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
