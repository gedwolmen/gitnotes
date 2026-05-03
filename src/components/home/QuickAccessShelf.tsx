import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import type { RecentItem } from '../../utils/recentItems';

interface Props {
  items: RecentItem[];
  onOpen: (item: RecentItem) => void;
}

function iconFor(kind: RecentItem['kind']): keyof typeof Ionicons.glyphMap {
  if (kind === 'canvas') return 'easel';
  if (kind === 'document') return 'document-text';
  return 'reader';
}

function titleFor(item: RecentItem): string {
  if (item.kind === 'canvas') return item.data.title || 'Untitled Canvas';
  const note = item.data;
  if (note.title) return note.title;
  if (item.kind === 'document' && note.filePath) {
    return note.filePath.split('/').pop() ?? 'Document';
  }
  return 'Untitled';
}

export function QuickAccessShelf({ items, onOpen }: Props) {
  const { colors } = useTheme();
  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Ionicons name="pin" size={14} color={colors.textSecondary} />
        <Text style={[styles.heading, { color: colors.textSecondary }]}>Quick access</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {items.map((item) => {
          const accent = item.kind === 'note' ? colors.primary : colors.accent;
          return (
            <Pressable
              key={`${item.kind}-${item.data.id}`}
              onPress={() => onOpen(item)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.92 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Pinned ${item.kind} ${titleFor(item)}`}
            >
              <View style={[styles.badge, { backgroundColor: accent + '1F' }]}>
                <Ionicons name={iconFor(item.kind)} size={16} color={accent} />
              </View>
              <Text
                style={[styles.title, { color: colors.text }]}
                numberOfLines={2}
              >
                {titleFor(item)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 4,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  heading: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  row: {
    gap: 10,
    paddingRight: 12,
  },
  card: {
    width: 148,
    minHeight: 88,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 8,
    justifyContent: 'space-between',
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
});

export default QuickAccessShelf;
