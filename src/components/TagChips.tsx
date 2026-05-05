import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

import { useTheme } from '../contexts/ThemeContext';

interface TagChipsProps {
  tags: string[];
  onTagPress?: (tag: string) => void;
  maxVisible?: number;
}

const TAG_COLORS = [
  '#4F46E5',
  '#7C3AED',
  '#DB2777',
  '#DC2626',
  '#EA580C',
  '#CA8A04',
  '#16A34A',
  '#0891B2',
  '#2563EB',
];

function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export function TagChips({ tags, onTagPress, maxVisible = 3 }: TagChipsProps) {
  const { colors } = useTheme();

  if (tags.length === 0) return null;

  const visible = tags.slice(0, maxVisible);
  const remaining = tags.length - maxVisible;

  return (
    <View style={styles.row}>
      {visible.map((tag) => {
        const bg = tagColor(tag);
        return (
          <TouchableOpacity
            key={tag}
            style={[styles.chip, { backgroundColor: bg + '20' }]}
            onPress={onTagPress ? () => onTagPress(tag) : undefined}
            disabled={!onTagPress}
          >
            <Text style={[styles.chipText, { color: bg }]} numberOfLines={1}>
              #{tag}
            </Text>
          </TouchableOpacity>
        );
      })}
      {remaining > 0 ? (
        <Text style={[styles.moreText, { color: colors.textSecondary }]}>
          +{remaining} more
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    maxWidth: '100%',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '500',
  },
  moreText: {
    fontSize: 11,
  },
});
