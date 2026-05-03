import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import type { RecentItem, BentoSize } from '../../utils/recentItems';
import CanvasThumbnail from '../CanvasThumbnail';

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

const HEIGHT_FOR: Record<BentoSize, number> = { large: 184, medium: 132, small: 112 };
const PADDING_FOR: Record<BentoSize, number> = { large: 18, medium: 14, small: 12 };
const TITLE_SIZE: Record<BentoSize, number> = { large: 18, medium: 15, small: 13 };
const SUB_SIZE: Record<BentoSize, number> = { large: 13, medium: 12, small: 11 };
const ICON_SIZE: Record<BentoSize, number> = { large: 28, medium: 22, small: 18 };
const RADIUS_FOR: Record<BentoSize, number> = { large: 20, medium: 16, small: 14 };
const THUMB_HEIGHT: Record<BentoSize, number> = { large: 110, medium: 70, small: 56 };
const TILE_WIDTH_HINT: Record<BentoSize, number> = { large: 320, medium: 160, small: 160 };

export function BentoTile({ item, size, onPress }: Props) {
  const { colors } = useTheme();
  const isLarge = size === 'large';
  const isMedium = size === 'medium';
  const isCanvas = item.kind === 'canvas';

  const accentByKind: Record<RecentItem['kind'], string> = {
    note: colors.primary,
    document: colors.accent,
    canvas: colors.accent,
  };
  const accent = accentByKind[item.kind];

  const tileHeight = HEIGHT_FOR[size];
  const tilePad = PADDING_FOR[size];
  const tileRadius = RADIUS_FOR[size];

  if (isCanvas) {
    const thumbHeight = THUMB_HEIGHT[size];
    const scene = item.data.scene;
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.tile,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            height: tileHeight,
            borderRadius: tileRadius,
            opacity: pressed ? 0.92 : 1,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`canvas ${titleFor(item)}`}
      >
        <View style={[styles.thumbWrap, { height: thumbHeight, backgroundColor: '#FFFFFF' }]}>
          <CanvasThumbnail scene={scene} width={TILE_WIDTH_HINT[size]} height={thumbHeight} />
          <View style={[styles.canvasBadge, { backgroundColor: colors.background }]}>
            <Ionicons name="easel" size={12} color={accent} />
          </View>
          {item.pinned ? (
            <View style={[styles.pin, { backgroundColor: colors.background }]}>
              <Ionicons name="pin" size={11} color={accent} />
            </View>
          ) : null}
        </View>
        <View style={[styles.canvasFooter, { padding: tilePad }]}>
          <Text style={[styles.title, { color: colors.text, fontSize: TITLE_SIZE[size] }]} numberOfLines={isLarge ? 2 : 1}>
            {titleFor(item)}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: SUB_SIZE[size] }]} numberOfLines={1}>
            {subtitleFor(item)}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          height: tileHeight,
          padding: tilePad,
          borderRadius: tileRadius,
          opacity: pressed ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${item.kind} ${titleFor(item)}`}
    >
      <View style={[styles.badge, { backgroundColor: accent + '1F' }]}>
        <Ionicons name={iconFor(item.kind)} size={ICON_SIZE[size]} color={accent} />
      </View>
      {item.pinned ? (
        <View style={[styles.pin, { backgroundColor: colors.background }]}>
          <Ionicons name="pin" size={11} color={accent} />
        </View>
      ) : null}
      <View style={styles.spacer} />
      <Text style={[styles.title, { color: colors.text, fontSize: TITLE_SIZE[size] }]} numberOfLines={isLarge ? 3 : isMedium ? 2 : 2}>
        {titleFor(item)}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: SUB_SIZE[size] }]} numberOfLines={1}>
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
    zIndex: 2,
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
  thumbWrap: {
    width: '100%',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  canvasBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvasFooter: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});

export default BentoTile;
