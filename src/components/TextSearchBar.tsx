import React from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

export interface TextSearchBarProps {
  totalMatches: number;
  currentIndex: number;
  onSearch: (query: string) => void;
  onNavigate: (index: number) => void;
  onClose: () => void;
}

export function TextSearchBar({
  totalMatches,
  currentIndex,
  onSearch,
  onNavigate,
  onClose,
}: TextSearchBarProps) {
  const { colors } = useTheme();

  const displayIndex = totalMatches === 0 ? 0 : currentIndex + 1;
  const matchCountText = `${displayIndex}/${totalMatches}`;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TextInput
        style={[styles.input, { color: colors.text }]}
        placeholder="Search..."
        placeholderTextColor={colors.textSecondary}
        onChangeText={onSearch}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
      <Text style={[styles.matchCount, { color: colors.textSecondary }]}>{matchCountText}</Text>
      <TouchableOpacity
        testID="search-prev"
        onPress={() => onNavigate(currentIndex - 1)}
        hitSlop={8}
      >
        <Ionicons name="chevron-up" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
      <TouchableOpacity
        testID="search-next"
        onPress={() => onNavigate(currentIndex + 1)}
        hitSlop={8}
      >
        <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
      <TouchableOpacity
        testID="search-close"
        onPress={onClose}
        hitSlop={8}
      >
        <Ionicons name="close" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 4,
  },
  matchCount: {
    fontSize: 13,
    minWidth: 40,
    textAlign: 'center',
  },
});
