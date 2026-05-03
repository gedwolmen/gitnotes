import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import type { RecentItem } from '../../utils/recentItems';
import CanvasThumbnail from '../CanvasThumbnail';

interface Props {
  items: RecentItem[];
  onOpen: (item: RecentItem) => void;
}

const CARD_WIDTH = 176;
const CARD_HEIGHT = 116;
const THUMB_HEIGHT = 64;

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
          const isCanvas = item.kind === 'canvas';
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
              {isCanvas ? (
                <View style={[styles.thumbWrap, { height: THUMB_HEIGHT }]}>
                  <CanvasThumbnail scene={item.data.scene} width={CARD_WIDTH} height={THUMB_HEIGHT} />
                  <View style={[styles.canvasBadge, { backgroundColor: colors.background }]}>
                    <Ionicons name="easel" size={11} color={accent} />
                  </View>
                </View>
              ) : (
                <View style={[styles.badge, { backgroundColor: accent + '1F' }]}>
                  <Ionicons name={iconFor(item.kind)} size={18} color={accent} />
                </View>
              )}
              <View style={styles.titleWrap}>
                <Text
                  style={[styles.title, { color: colors.text }]}
                  numberOfLines={2}
                >
                  {titleFor(item)}
                </Text>
              </View>
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
    gap: 12,
    paddingRight: 12,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 12,
  },
  thumbWrap: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  canvasBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
});

export default QuickAccessShelf;
