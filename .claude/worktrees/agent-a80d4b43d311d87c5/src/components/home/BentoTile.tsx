import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import type { RecentItem, BentoSize } from '../../utils/recentItems';
import type { NoteFormat } from '../../models/Note';
import { NOTE_COLORS } from '../../theme/tokens';
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

/**
 * Strip frontmatter blocks and Markdown noise from a note's content so we can
 * preview the first ~120 chars as plain text in a small tile. Mirrors the
 * intent of `stripPreview` in NoteCard but kept lean and inline since this is
 * the only home tile that needs it.
 */
function stripMarkdownPreview(content: string, format?: NoteFormat): string {
  let text = content ?? '';
  // YAML frontmatter at the very start: ---\n...\n---\n
  text = text.replace(/^---\n[\s\S]*?\n---\n?/, '');
  // neorg @document.meta ... @end
  if (format === 'neorg') {
    const trimmed = text.trimStart();
    if (trimmed.startsWith('@document.meta')) {
      const lines = text.split('\n');
      const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '@end');
      if (endIdx !== -1) text = lines.slice(endIdx + 1).join('\n');
    }
  }
  // org-mode #+KEY: header lines
  if (format === 'org') {
    const lines = text.split('\n');
    let i = 0;
    while (i < lines.length && /^\s*#\+[A-Za-z0-9_]+:/.test(lines[i])) i++;
    text = lines.slice(i).join('\n');
  }
  return text
    .replace(/^#{1,6}\s+/gm, '') // markdown heading markers
    .replace(/^\*{1,6}\s+/gm, '') // org/neorg heading markers
    .replace(/\*{1,2}([^*\n]+)\*{1,2}/g, '$1')
    .replace(/_{1,2}([^_\n]+)_{1,2}/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`[^`]+`/g, '')
    .replace(/^>\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function snippetFor(content: string | undefined, format: NoteFormat | undefined, max = 120): string {
  const stripped = stripMarkdownPreview(content ?? '', format);
  if (stripped.length <= max) return stripped;
  return stripped.slice(0, max).trimEnd() + '…';
}

function formatChipLabel(format: NoteFormat | undefined): string | null {
  switch (format) {
    case 'neorg':
      return 'NORG';
    case 'org':
      return 'ORG';
    case 'pdf':
      return 'PDF';
    case 'json':
      return 'JSON';
    case 'markdown':
    default:
      return 'MD';
  }
}

const HEIGHT_FOR: Record<BentoSize, number> = { large: 184, medium: 132, small: 112 };
const PADDING_FOR: Record<BentoSize, number> = { large: 18, medium: 14, small: 12 };
const TITLE_SIZE: Record<BentoSize, number> = { large: 18, medium: 15, small: 13 };
const SUB_SIZE: Record<BentoSize, number> = { large: 13, medium: 12, small: 11 };
const ICON_SIZE: Record<BentoSize, number> = { large: 28, medium: 22, small: 18 };
const RADIUS_FOR: Record<BentoSize, number> = { large: 20, medium: 16, small: 14 };
const THUMB_HEIGHT: Record<BentoSize, number> = { large: 110, medium: 70, small: 56 };
const TILE_WIDTH_HINT: Record<BentoSize, number> = { large: 320, medium: 160, small: 160 };
const SNIPPET_LINES: Record<BentoSize, number> = { large: 3, medium: 2, small: 1 };
const COLOR_STRIPE_WIDTH = 4;

export function BentoTile({ item, size, onPress }: Props) {
  const { colors } = useTheme();
  const isLarge = size === 'large';
  const isMedium = size === 'medium';
  const isSmall = size === 'small';
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
            {(() => {
              const n = item.data.scene?.elements?.length ?? 0;
              return `${n} ${n === 1 ? 'element' : 'elements'} · ${relativeTime(item.updatedAt)}`;
            })()}
          </Text>
        </View>
      </Pressable>
    );
  }

  // Document tile (PDF)
  if (item.kind === 'document') {
    const note = item.data;
    const filename = note.filePath ? note.filePath.split('/').pop() ?? '' : '';
    const folder = note.filePath ? note.filePath.split('/').slice(0, -1).join('/') : '';
    const noteColorHex = note.color ? NOTE_COLORS[note.color as keyof typeof NOTE_COLORS] : undefined;

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
          noteColorHex ? { borderLeftColor: noteColorHex, borderLeftWidth: COLOR_STRIPE_WIDTH } : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`document ${titleFor(item)}`}
      >
        <View style={[styles.badge, { backgroundColor: accent + '1F' }]}>
          <Ionicons name={iconFor(item.kind)} size={ICON_SIZE[size]} color={accent} />
        </View>
        {item.pinned ? (
          <View style={[styles.pin, { backgroundColor: colors.background }]}>
            <Ionicons name="pin" size={11} color={accent} />
          </View>
        ) : null}
        {!isSmall ? (
          <View style={[styles.formatChip, { backgroundColor: accent + '20' }]}>
            <Text style={[styles.formatChipText, { color: accent }]}>PDF</Text>
          </View>
        ) : null}
        <View style={styles.spacer} />
        <Text style={[styles.title, { color: colors.text, fontSize: TITLE_SIZE[size] }]} numberOfLines={isLarge ? 2 : 1}>
          {titleFor(item)}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: SUB_SIZE[size] }]} numberOfLines={1}>
          {filename ? `${filename} · ${relativeTime(item.updatedAt)}` : `PDF · ${relativeTime(item.updatedAt)}`}
        </Text>
        {!isSmall && folder ? (
          <Text style={[styles.metaLine, { color: colors.textSecondary, fontSize: SUB_SIZE[size] - 1 }]} numberOfLines={1}>
            {folder}
          </Text>
        ) : null}
      </Pressable>
    );
  }

  // Note tile
  const note = item.data;
  const noteColorHex = note.color ? NOTE_COLORS[note.color as keyof typeof NOTE_COLORS] : undefined;
  const snippet = !isSmall
    ? snippetFor(note.content, note.format, isLarge ? 160 : 110)
    : snippetFor(note.content, note.format, 70);
  const tags = note.tags ?? [];
  const visibleTags = tags.slice(0, 2);
  const formatChip = !isSmall ? formatChipLabel(note.format) : null;
  const showRepoBadge = !isSmall && !!note.repo;

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
        noteColorHex ? { borderLeftColor: noteColorHex, borderLeftWidth: COLOR_STRIPE_WIDTH } : null,
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
      {formatChip ? (
        <View style={[styles.formatChip, { backgroundColor: accent + '20' }]}>
          <Text style={[styles.formatChipText, { color: accent }]}>{formatChip}</Text>
        </View>
      ) : null}
      <View style={styles.spacer} />
      <Text
        style={[styles.title, { color: colors.text, fontSize: TITLE_SIZE[size] }]}
        numberOfLines={isLarge ? 2 : isMedium ? 2 : 2}
      >
        {titleFor(item)}
      </Text>
      {snippet ? (
        <Text
          style={[styles.snippet, { color: colors.textSecondary, fontSize: SUB_SIZE[size] }]}
          numberOfLines={SNIPPET_LINES[size]}
        >
          {snippet}
        </Text>
      ) : null}
      <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: SUB_SIZE[size] }]} numberOfLines={1}>
        {relativeTime(item.updatedAt)}
      </Text>
      {!isSmall && (visibleTags.length > 0 || showRepoBadge) ? (
        <View style={styles.metaRow}>
          {visibleTags.map((tag) => (
            <View key={tag} style={[styles.tagChip, { backgroundColor: colors.primary + '20' }]}>
              <Text style={[styles.tagChipText, { color: colors.primary }]} numberOfLines={1}>
                {tag}
              </Text>
            </View>
          ))}
          {showRepoBadge ? (
            <View style={styles.repoBadge}>
              <Ionicons name="git-branch-outline" size={11} color={colors.textSecondary} />
              <Text
                style={[styles.repoText, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {note.repo}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
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
  formatChip: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    zIndex: 1,
  },
  formatChipText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
    fontFamily: 'monospace',
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
  snippet: {
    fontWeight: '400',
    marginTop: 4,
    lineHeight: 18,
  },
  metaLine: {
    fontWeight: '400',
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  tagChip: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    maxWidth: 110,
  },
  tagChipText: {
    fontSize: 10,
    fontWeight: '500',
  },
  repoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    maxWidth: 130,
  },
  repoText: {
    fontSize: 10,
    fontWeight: '500',
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
