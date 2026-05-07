import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Note, NoteFormat } from '../models/Note';
import { NOTE_COLORS } from '../theme/tokens';
import { useResponsive } from '../hooks/useResponsive';

function stripPreview(content: string, noteFormat?: NoteFormat): string {
  let text = content;
  const trimmed = text.trimStart();
  // Strip YAML front-matter
  if (trimmed.startsWith('---\n')) {
    const close = trimmed.indexOf('\n---', 3);
    if (close !== -1) text = trimmed.slice(close + 4);
  }
  // Strip neorg @document.meta block
  if (noteFormat === 'neorg' && text.trimStart().startsWith('@document.meta')) {
    const lines = text.split('\n');
    const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '@end');
    if (endIdx !== -1) text = lines.slice(endIdx + 1).join('\n');
  }
  // Strip org #+KEY: headers
  if (noteFormat === 'org') {
    const lines = text.split('\n');
    let i = 0;
    while (i < lines.length && /^\s*#\+[A-Za-z0-9_]+:/.test(lines[i])) i++;
    text = lines.slice(i).join('\n');
  }
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\*{1,6}\s+/gm, '')
    .replace(/\*{1,2}([^*\n]+)\*{1,2}/g, '$1')
    .replace(/_{1,2}([^_\n]+)_{1,2}/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`[^`]+`/g, '')
    .replace(/\{[^}]+\}\[[^\]]+\]/g, '')
    .replace(/\{https?:\/\/[^}]+\}/g, '')
    .replace(/\{\*[^}]+\}/g, '')
    .replace(/\{:[^:]+:\}/g, '')
    .replace(/\[\[[^\]]+\]\[[^\]]+\]\]/g, '')
    .replace(/\[\[[^\]]+\]\]/g, '')
    .replace(/\+([^+\s][^+]*[^+\s]?)\+/g, '$1')
    .replace(/=([^=\s][^=]*[^=\s]?)=/g, '$1')
    .replace(/~([^~\s][^~]*[^~\s]?)~/g, '$1')
    .replace(/^>\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}
import { useTheme } from '../contexts/ThemeContext';
import { getChecklistProgress, hasChecklists } from '../utils/checklist';
import { useNoteTags } from '../hooks/useNoteTags';
import { TagChips } from './TagChips';

interface NoteCardProps {
  note: Note;
  onPress: (note: Note) => void;
  onLongPress?: (note: Note) => void;
  compact?: boolean;
  highlighted?: boolean;
  variant?: 'default' | 'card';
  isOffline?: boolean;
  isCached?: boolean;
  onTagPress?: (tag: string) => void;
}

function NoteCardImpl({
  note,
  onPress,
  onLongPress,
  compact = false,
  highlighted = false,
  variant = 'default',
  isOffline = false,
  isCached = true,
  onTagPress,
}: NoteCardProps) {
  const { colors, isDark } = useTheme();
  const { isTablet } = useResponsive();
  const isCard = variant === 'card';
  const showCompact = isCard ? false : compact;
  const isOfflineUncached = isOffline && !isCached;
  const titleColor = isOfflineUncached ? colors.textSecondary : colors.text;
  const noteColorHex = note.color ? NOTE_COLORS[note.color as keyof typeof NOTE_COLORS] : undefined;
  const noteColorStyle = noteColorHex
    ? { borderColor: noteColorHex, borderWidth: 2 }
    : undefined;
  
  const checklistProgress = useMemo(() => {
    if (!hasChecklists(note.content)) return null;
    return getChecklistProgress(note.content);
  }, [note.content]);

  const { allTags: mergedTags } = useNoteTags(note.tags ?? [], note.content ?? '');

  return (
    <View testID="note-card.button.press">
      <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          shadowColor: colors.shadow,
          shadowOpacity: isDark ? 0 : 0.1,
          opacity: isOfflineUncached ? 0.5 : 1,
        },
        showCompact && styles.cardCompact,
        isCard && styles.cardVariant,
        isTablet && styles.cardTablet,
        noteColorStyle,
        highlighted && { borderWidth: 2, borderColor: colors.primary },
      ]}
      testID={`note-card-${note.id}`}
      onPress={() => onPress(note)}
      onLongPress={() => onLongPress?.(note)}
      activeOpacity={0.7}
    >
      {note.isPinned && (
        <View style={[styles.pinIndicator, { backgroundColor: colors.primary }]}>
          <Ionicons name="pin" size={12} color="#fff" />
        </View>
      )}
      <View style={styles.header}>
        <Text
          testID={`note-card-title-${note.id}`}
          style={[styles.title, { color: titleColor }, showCompact && styles.titleCompact]}
          numberOfLines={showCompact ? 1 : 2}
        >
          {note.title || 'Untitled Note'}
        </Text>
        {!showCompact && (
          <Text
            testID={`note-card-content-${note.id}`}
            style={[styles.content, { color: colors.textSecondary }]}
            numberOfLines={isCard ? 3 : 2}
          >
            {stripPreview(note.content, note.format) || 'No content'}
          </Text>
        )}
      </View>

      {!showCompact && checklistProgress && checklistProgress.total > 0 && (
        <View style={styles.checklistContainer}>
          <Ionicons
            name={checklistProgress.completed === checklistProgress.total ? 'checkmark-circle' : 'radio-button-off'}
            size={14}
            color={checklistProgress.completed === checklistProgress.total ? colors.primary : colors.textSecondary}
          />
          <Text style={[styles.checklistText, { color: colors.textSecondary }]}>
            {checklistProgress.completed}/{checklistProgress.total} tasks
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <Text style={[styles.date, { color: colors.textSecondary }]}>
            {format(new Date(note.updatedAt), showCompact ? 'MMM d' : 'MMM d, yyyy')}
          </Text>
          <View style={[styles.formatBadge, { backgroundColor: colors.primary + '18' }]}>
            <Text style={[styles.formatBadgeText, { color: colors.primary }]}>
              {(note.format ?? 'markdown') === 'markdown' ? '.md' : (note.format ?? 'markdown') === 'neorg' ? '.norg' : (note.format ?? 'markdown') === 'org' ? '.org' : (note.format ?? 'markdown') === 'pdf' ? '.pdf' : '.md'}
            </Text>
          </View>
        </View>
      </View>

      {!showCompact && mergedTags.length > 0 && (
        <View testID="notes-list-card.button.press-tag" style={styles.tagsRow}>
          <TagChips tags={mergedTags} onTagPress={onTagPress} />
        </View>
      )}

      {!showCompact && (note.folderPath || note.repo) && (
        <View style={[styles.repoContainer, { borderTopColor: colors.border }]}> 
          {note.folderPath && note.folderPath !== '/' && (
            <View style={styles.repoItem}>
              <Ionicons name="folder" size={14} color={colors.textSecondary} />
              <Text style={[styles.repoText, { color: colors.textSecondary }]}>{note.folderPath.split('/').pop()}</Text>
            </View>
          )}
          {note.repo && (
            <View style={styles.repoItem}>
              <Ionicons name="cube-outline" size={14} color={colors.textSecondary} />
              <Text style={[styles.repoText, { color: colors.textSecondary }]}>{note.repo}</Text>
            </View>
          )}
          {note.branch && (
            <View style={styles.repoItem}>
              <Ionicons name="git-branch-outline" size={14} color={colors.primary} />
              <Text style={[styles.branchText, { color: colors.primary }]}>{note.branch}</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
    </View>
  );
}

const NoteCard = React.memo(NoteCardImpl);
export default NoteCard;

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  cardCompact: {
    padding: 12,
    marginVertical: 4,
    marginHorizontal: 0,
  },
  cardVariant: {
    padding: 20,
    marginVertical: 6,
    marginHorizontal: 0,
  },
  pinIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  titleCompact: {
    fontSize: 14,
    marginBottom: 0,
  },
  content: {
    fontSize: 14,
    lineHeight: 20,
  },
  checklistContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
    gap: 6,
  },
  checklistText: {
    fontSize: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  formatBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  formatBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  date: {
    fontSize: 12,
  },
  tagsRow: {
    marginTop: 8,
  },
  tagsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  tag: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 4,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '500',
  },
  moreTagsText: {
    fontSize: 10,
    marginLeft: 4,
  },
  repoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexWrap: 'wrap',
  },
  repoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
    marginBottom: 4,
    gap: 4,
  },
  repoText: {
    fontSize: 12,
  },
  branchText: {
    fontSize: 12,
  },
  cardTablet: {
    marginHorizontal: 4,
  },
});
