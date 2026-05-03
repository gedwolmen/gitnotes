import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import type { RecentItem, BentoSize } from '../../utils/recentItems';

interface Props {
  item: RecentItem;
  size: BentoSize;
  onPress: () => void;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ms).toLocaleDateString();
}

function iconFor(kind: RecentItem['kind']): keyof typeof Ionicons.glyphMap {
  if (kind === 'canvas') return 'easel-outline';
  if (kind === 'document') return 'document-text-outline';
  return 'reader-outline';
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

function subtitleFor(item: RecentItem): string {
  if (item.kind === 'canvas') {
    const n = item.data.scene?.elements?.length ?? 0;
    return `${n} ${n === 1 ? 'element' : 'elements'} · ${relativeTime(item.updatedAt)}`;
  }
  if (item.kind === 'document') {
    return item.data.filePath ?? `PDF · ${relativeTime(item.updatedAt)}`;
  }
  return relativeTime(item.updatedAt);
}

export function BentoTile({ item, size, onPress }: Props) {
  const { colors } = useTheme();
  const isLarge = size === 'large';
  const isMedium = size === 'medium';

  const accentByKind: Record<RecentItem['kind'], string> = {
    note: colors.primary,
    document: colors.accent,
    canvas: colors.accent,
  };
  const accent = accentByKind[item.kind];

  const heightFor: Record<BentoSize, number> = { large: 168, medium: 124, small: 84 };
  const padding: Record<BentoSize, number> = { large: 18, medium: 14, small: 12 };
  const titleSize: Record<BentoSize, number> = { large: 18, medium: 15, small: 13 };
  const subSize: Record<BentoSize, number> = { large: 13, medium: 12, small: 11 };
  const iconSize: Record<BentoSize, number> = { large: 28, medium: 22, small: 18 };
  const radius: Record<BentoSize, number> = { large: 20, medium: 16, small: 14 };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          height: heightFor[size],
          padding: padding[size],
          borderRadius: radius[size],
          opacity: pressed ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${item.kind} ${titleFor(item)}`}
    >
      <View style={[styles.badge, { backgroundColor: accent + '1F' }]}>
        <Ionicons name={iconFor(item.kind)} size={iconSize[size]} color={accent} />
      </View>
      {item.pinned ? (
        <View style={[styles.pin, { backgroundColor: colors.background }]}>
          <Ionicons name="pin" size={11} color={accent} />
        </View>
      ) : null}
      <View style={styles.spacer} />
      <Text style={[styles.title, { color: colors.text, fontSize: titleSize[size] }]} numberOfLines={isLarge ? 3 : isMedium ? 2 : 1}>
        {titleFor(item)}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: subSize[size] }]} numberOfLines={1}>
        {subtitleFor(item)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  badge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: { flex: 1 },
  title: {
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontWeight: '500',
    marginTop: 2,
  },
});

export default BentoTile;
